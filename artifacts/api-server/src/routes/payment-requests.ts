import { Router } from "express";
import { db } from "@workspace/db";
import { paymentRequestsTable, earningsEntriesTable, payoutMethodsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { sendWithdrawalRequestEmail, sendWithdrawalPaidEmail } from "../lib/email.js";

const router = Router();

const MIN_AMOUNT_NGN = 10_000;
const MAX_AMOUNT_NGN = 50_000_000;

async function getAvailableBalance(userId: number): Promise<number> {
  const entries = await db.select({ earningsNgn: earningsEntriesTable.earningsNgn }).from(earningsEntriesTable).where(eq(earningsEntriesTable.userId, userId));
  const artistShareNgn = entries.reduce((sum, e) => sum + e.earningsNgn, 0) * 0.85;
  const requests = await db.select({ amountNgn: paymentRequestsTable.amountNgn }).from(paymentRequestsTable).where(eq(paymentRequestsTable.userId, userId));
  const totalRequestedNgn = requests.reduce((sum, r) => sum + r.amountNgn, 0);
  return Math.max(0, artistShareNgn - totalRequestedNgn);
}

// ── Artist: my payment requests ──
router.get("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const rows = await db.select().from(paymentRequestsTable).where(eq(paymentRequestsTable.userId, authReq.user!.id)).orderBy(desc(paymentRequestsTable.createdAt));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to fetch payment requests");
    res.status(500).json({ error: "Failed to fetch payment requests" });
  }
});

// ── Artist: create a payment request ──
router.post("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const amountNgn = Number(req.body?.amountNgn);
    if (!Number.isFinite(amountNgn) || amountNgn <= 0) { res.status(400).json({ error: "Enter a valid amount" }); return; }
    if (amountNgn < MIN_AMOUNT_NGN) { res.status(400).json({ error: `Minimum withdrawal is ₦${MIN_AMOUNT_NGN.toLocaleString("en-NG")}` }); return; }
    if (amountNgn > MAX_AMOUNT_NGN) { res.status(400).json({ error: `Maximum withdrawal is ₦${MAX_AMOUNT_NGN.toLocaleString("en-NG")}` }); return; }

    const [payoutMethod] = await db.select().from(payoutMethodsTable).where(eq(payoutMethodsTable.userId, authReq.user!.id)).limit(1);
    if (!payoutMethod) { res.status(400).json({ error: "Add a payment method before requesting a withdrawal" }); return; }

    const balance = await getAvailableBalance(authReq.user!.id);
    if (amountNgn > balance) { res.status(400).json({ error: "Amount exceeds your available balance" }); return; }

    const [request] = await db.insert(paymentRequestsTable).values({
      userId: authReq.user!.id,
      amountNgn,
      status: "pending",
      payoutMethodSnapshot: JSON.stringify({ method: payoutMethod.method, currency: payoutMethod.currency, bankDetailType: payoutMethod.bankDetailType, details: payoutMethod.details }),
    }).returning();

    res.json(request);
    sendWithdrawalRequestEmail(authReq.user!.name, authReq.user!.email, amountNgn).catch(() => {});
  } catch (err) {
    logger.error({ err }, "Failed to create payment request");
    res.status(500).json({ error: "Failed to create payment request" });
  }
});

// ── Admin: list all payment requests ──
router.get("/admin", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: paymentRequestsTable.id,
        userId: paymentRequestsTable.userId,
        amountNgn: paymentRequestsTable.amountNgn,
        status: paymentRequestsTable.status,
        payoutMethodSnapshot: paymentRequestsTable.payoutMethodSnapshot,
        adminNotes: paymentRequestsTable.adminNotes,
        createdAt: paymentRequestsTable.createdAt,
        paidAt: paymentRequestsTable.paidAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(paymentRequestsTable)
      .leftJoin(usersTable, eq(paymentRequestsTable.userId, usersTable.id))
      .orderBy(desc(paymentRequestsTable.createdAt));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to fetch payment requests for admin");
    res.status(500).json({ error: "Failed to fetch payment requests" });
  }
});

// ── Admin: mark a request paid ──
router.patch("/admin/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status, adminNotes } = req.body as { status?: string; adminNotes?: string };
    if (status && status !== "pending" && status !== "paid") { res.status(400).json({ error: "Invalid status" }); return; }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
      updateData.status = status;
      updateData.paidAt = status === "paid" ? new Date() : null;
    }
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes || null;

    const [updated] = await db.update(paymentRequestsTable).set(updateData).where(eq(paymentRequestsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Payment request not found" }); return; }
    res.json(updated);
    if (status === "paid") {
      db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, updated.userId)).limit(1)
        .then(([u]) => { if (u) sendWithdrawalPaidEmail(u.name, u.email, updated.amountNgn).catch(() => {}); })
        .catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "Failed to update payment request");
    res.status(500).json({ error: "Failed to update payment request" });
  }
});

export const paymentRequestsRouter = router;
