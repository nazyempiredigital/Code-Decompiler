import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { projectsTable, paymentsTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import {
  initializeTransaction,
  verifyTransaction,
  PAYSTACK_PUBLIC_KEY,
} from "../lib/paystack.js";
import { sendPaymentConfirmationEmail } from "../lib/email.js";
import { maybeCreditAffiliateCommission } from "./affiliates.js";
import { logger } from "../lib/logger.js";

const router = Router();

async function confirmPayment(reference: string) {
  const [pendingPayment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.paystackRef, reference))
    .limit(1);

  if (!pendingPayment) {
    logger.warn({ reference }, "Webhook: no pending payment row found");
    return;
  }

  if (pendingPayment.status === "success") {
    logger.info({ reference }, "Webhook: payment already confirmed — idempotent skip");
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.paystackRef, reference))
    .limit(1);

  if (!project) {
    logger.warn({ reference }, "Webhook: no project found for reference");
    return;
  }

  await db
    .update(paymentsTable)
    .set({ status: "success" })
    .where(eq(paymentsTable.paystackRef, reference));

  if (project.paymentStatus !== "paid") {
    await db
      .update(projectsTable)
      .set({ paymentStatus: "paid", status: "in_progress", updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id));

    await db.insert(notificationsTable).values({
      userId: project.userId,
      title: "Payment Confirmed",
      message: `Payment for project ${project.projectId} has been confirmed. Your project is now In Progress.`,
    });

    sendPaymentConfirmationEmail(
      project.projectId,
      project.clientName,
      project.clientEmail,
      project.totalAmount,
    ).catch(() => {});

    maybeCreditAffiliateCommission(
      project.id,
      project.projectId,
      project.affiliateRef,
      parseFloat(project.totalAmount),
    ).catch((err) => logger.error({ err }, "Webhook: affiliate commission error"));

    logger.info({ reference, projectId: project.projectId }, "Webhook: payment confirmed");
  }
}

router.post("/webhook", async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    logger.error("Webhook: PAYSTACK_SECRET_KEY is not set — rejecting all webhook requests");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const signature = req.headers["x-paystack-signature"] as string | undefined;

  if (!signature) {
    logger.warn("Webhook: missing x-paystack-signature header");
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  const rawBody = req.body as Buffer;

  if (!Buffer.isBuffer(rawBody)) {
    logger.warn("Webhook: body is not a raw buffer — check middleware order");
    res.status(400).json({ error: "Expected raw body" });
    return;
  }

  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  // Use constant-time comparison to prevent timing attacks
  const signatureBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const valid =
    signatureBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(signatureBuf, expectedBuf);

  if (!valid) {
    logger.warn("Webhook: invalid signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let event: { event: string; data: { reference: string } };
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  logger.info({ event: event.event, reference: event.data?.reference }, "Webhook received");

  if (event.event === "charge.success") {
    confirmPayment(event.data.reference).catch((err) =>
      logger.error({ err, reference: event.data.reference }, "Webhook: confirmPayment error"),
    );
  }

  res.json({ received: true });
});

router.post("/initialize", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const { projectId } = req.body as { projectId: number };
    if (!projectId) {
      res.status(400).json({ error: "projectId required" });
      return;
    }
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (project.userId !== authReq.user!.id && authReq.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (project.paymentStatus === "paid") {
      res.status(400).json({ error: "Project already paid" });
      return;
    }

    const reference = `NE-${project.projectId}-${Date.now()}`;

    // totalAmount is stored in NGN — convert directly to kobo
    const amountNgn = parseFloat(project.totalAmount);
    const amountKobo = Math.round(amountNgn * 100);

    const paystackData = await initializeTransaction(
      project.clientEmail,
      amountNgn,
      reference,
    );

    await db
      .update(projectsTable)
      .set({ paystackRef: reference, updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id));

    await db
      .insert(paymentsTable)
      .values({
        projectId: project.id,
        userId: project.userId,
        paystackRef: reference,
        amount: amountNgn.toFixed(2),
        currency: "NGN",
        status: "pending",
        meta: JSON.stringify({ amountNgn, amountKobo }),
      })
      .onConflictDoNothing();

    res.json({
      reference,
      publicKey: PAYSTACK_PUBLIC_KEY,
      amountKobo,
      amountNgn: parseFloat(amountNgn.toFixed(2)),
      email: project.clientEmail,
      authorizationUrl: paystackData.authorization_url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment initialization failed";
    res.status(500).json({ error: message });
  }
});

router.post("/verify", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const { reference } = req.body as { reference: string };
    if (!reference) {
      res.status(400).json({ error: "reference required" });
      return;
    }

    const verified = await verifyTransaction(reference);

    if (verified.status !== "success") {
      res.status(400).json({ error: "Payment not successful" });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.paystackRef, reference))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: "Project not found for this reference" });
      return;
    }

    if (project.userId !== authReq.user!.id && authReq.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [pendingPayment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.paystackRef, reference))
      .limit(1);

    if (pendingPayment?.meta) {
      const meta = JSON.parse(pendingPayment.meta as string) as { amountKobo: number };
      const expectedKobo = meta.amountKobo;
      if (verified.amount < Math.floor(expectedKobo * 0.99)) {
        res.status(400).json({
          error: `Payment amount mismatch: expected ~${expectedKobo} kobo but received ${verified.amount} kobo`,
        });
        return;
      }
    }

    if (
      verified.customer?.email &&
      verified.customer.email.toLowerCase() !== project.clientEmail.toLowerCase()
    ) {
      res.status(400).json({ error: "Payment customer does not match project" });
      return;
    }

    await db
      .update(paymentsTable)
      .set({ status: "success", paystackData: verified })
      .where(eq(paymentsTable.paystackRef, reference));

    if (project.paymentStatus !== "paid") {
      await db
        .update(projectsTable)
        .set({ paymentStatus: "paid", status: "in_progress", updatedAt: new Date() })
        .where(eq(projectsTable.id, project.id));

      await db.insert(notificationsTable).values({
        userId: project.userId,
        title: "Payment Confirmed",
        message: `Payment for project ${project.projectId} has been confirmed. Your project is now In Progress.`,
      });

      sendPaymentConfirmationEmail(
        project.projectId,
        project.clientName,
        project.clientEmail,
        project.totalAmount,
      ).catch(() => {});

      maybeCreditAffiliateCommission(
        project.id,
        project.projectId,
        project.affiliateRef,
        parseFloat(project.totalAmount),
      ).catch((err) => logger.error({ err }, "Verify: affiliate commission error"));
    }

    res.json({ success: true, projectId: project.projectId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    res.status(500).json({ error: message });
  }
});

export const paymentsRouter = router;
