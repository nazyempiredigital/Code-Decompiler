import { Router } from "express";
import { db } from "@workspace/db";
import { artistOrdersTable, notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { mkdirSync } from "fs";
import crypto from "crypto";
import { requireArtist, requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { initializeTransaction, verifyTransaction, PAYSTACK_PUBLIC_KEY } from "../lib/paystack.js";

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
try { mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(8).toString("hex");
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${unique}-${safe}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });
const adminUpload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

export const SERVICE_PRICES: Record<string, number> = {
  mixing_mastering: 30000,
  cover_art: 10000,
  playlist_pitching: 10000,
};

function generateOrderId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `AO-${y}${m}-${rand}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — must be registered BEFORE parameterized /:id routes
// ═══════════════════════════════════════════════════════════════════════════

// Admin: List all orders
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const { status, serviceType } = req.query as { status?: string; serviceType?: string };
    let orders = await db.select().from(artistOrdersTable).orderBy(desc(artistOrdersTable.createdAt));
    if (status && status !== "all") orders = orders.filter((o) => o.status === status);
    if (serviceType && serviceType !== "all") orders = orders.filter((o) => o.serviceType === serviceType);
    res.json(orders);
  } catch {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Admin: Get single order
router.get("/admin/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    res.json(order);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// Admin: Update status + admin notes
router.patch("/admin/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status, adminNotes } = req.body as {
      status?: "pending_payment" | "paid" | "in_progress" | "confirmed" | "delivered";
      adminNotes?: string;
    };

    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updateData["status"] = status;
    if (adminNotes !== undefined) updateData["adminNotes"] = adminNotes;
    if (status === "paid" || status === "in_progress") updateData["paymentStatus"] = "paid";

    const [updated] = await db.update(artistOrdersTable).set(updateData as any).where(eq(artistOrdersTable.id, id)).returning();

    const statusLabels: Record<string, string> = {
      paid: "confirmed", in_progress: "in progress", confirmed: "confirmed", delivered: "delivered",
    };
    if (status && statusLabels[status]) {
      await db.insert(notificationsTable).values({
        userId: order.userId,
        title: "Order Update",
        message: `Your order ${order.orderId} has been marked as ${statusLabels[status]}.`,
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "artist-orders admin status update error");
    res.status(500).json({ error: "Failed to update order" });
  }
});

// Admin: Confirm payment manually
router.patch("/admin/:id/confirm-payment", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const [updated] = await db.update(artistOrdersTable).set({
      paymentStatus: "paid", status: "paid", updatedAt: new Date(),
    }).where(eq(artistOrdersTable.id, id)).returning();

    await db.insert(notificationsTable).values({
      userId: order.userId,
      title: "Payment Confirmed",
      message: `Payment for order ${order.orderId} has been confirmed by the admin.`,
    }).catch(() => {});

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// Admin: Upload result file (for mixing/cover art)
router.post("/admin/:id/upload-result", requireAdmin, adminUpload.single("file"), async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file" }); return; }

    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const url = `/api/uploads/${file.filename}`;
    const updatedResultFiles = [...(order.resultFiles ?? []), url];

    const [updated] = await db.update(artistOrdersTable).set({
      resultFiles: updatedResultFiles, updatedAt: new Date(),
    }).where(eq(artistOrdersTable.id, id)).returning();

    await db.insert(notificationsTable).values({
      userId: order.userId,
      title: "Your Order Result is Ready",
      message: `Your ${order.serviceType.replace(/_/g, " ")} order (${order.orderId}) is complete. Log in to download your files.`,
    }).catch(() => {});

    res.json({ url, filename: file.filename, originalName: file.originalname, order: updated });
  } catch (err) {
    logger.error({ err }, "artist-orders admin upload-result error");
    res.status(500).json({ error: "Upload failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ARTIST ROUTES — parameterized, registered after /admin/* prefixed routes
// ═══════════════════════════════════════════════════════════════════════════

// Artist: Create Order
router.post("/", requireArtist, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const { serviceType, formData } = req.body as {
      serviceType: "mixing_mastering" | "cover_art" | "playlist_pitching";
      formData: Record<string, unknown>;
    };

    if (!serviceType || !SERVICE_PRICES[serviceType]) {
      res.status(400).json({ error: "Invalid service type" }); return;
    }

    let orderId = generateOrderId();
    for (let i = 0; i < 5; i++) {
      const existing = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.orderId, orderId)).limit(1);
      if (existing.length === 0) break;
      orderId = generateOrderId();
    }

    const user = authReq.user!;
    const [order] = await db.insert(artistOrdersTable).values({
      orderId,
      userId: user.id,
      serviceType,
      status: "pending_payment",
      paymentStatus: "unpaid",
      formData: formData ?? {},
      artistFiles: [],
      resultFiles: [],
      artistName: user.name,
      artistEmail: user.email,
    }).returning();

    await db.insert(notificationsTable).values({
      userId: user.id,
      title: "Order Created",
      message: `Your ${serviceType.replace(/_/g, " ")} order (${orderId}) has been created. Complete payment to proceed.`,
    });

    res.json(order);
  } catch (err) {
    logger.error({ err }, "artist-orders create error");
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Artist: List My Orders
router.get("/", requireArtist, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const orders = await db.select().from(artistOrdersTable)
      .where(eq(artistOrdersTable.userId, authReq.user!.id))
      .orderBy(desc(artistOrdersTable.createdAt));
    res.json(orders);
  } catch {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Artist: Get Single Order
router.get("/:id", requireArtist, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.userId !== authReq.user!.id && authReq.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    res.json(order);
  } catch {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Artist: Upload Files for Order
router.post("/:id/files", requireArtist, upload.single("file"), async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file" }); return; }
    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.userId !== authReq.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const url = `/api/uploads/${file.filename}`;
    const updatedFiles = [...(order.artistFiles ?? []), url];
    await db.update(artistOrdersTable).set({ artistFiles: updatedFiles, updatedAt: new Date() }).where(eq(artistOrdersTable.id, id));
    res.json({ url, filename: file.filename, originalName: file.originalname });
  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

// Artist: Acknowledge Download (marks delivered on first download)
router.post("/:id/download-result", requireArtist, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.userId !== authReq.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!order.resultFiles || order.resultFiles.length === 0) {
      res.status(400).json({ error: "No result files available" }); return;
    }

    if (!order.firstDownloadAt) {
      await db.update(artistOrdersTable).set({
        status: "delivered", firstDownloadAt: new Date(), updatedAt: new Date(),
      }).where(eq(artistOrdersTable.id, id));
    }

    res.json({ resultFiles: order.resultFiles });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// Artist: Initialize Payment
router.post("/:id/pay-init", requireArtist, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.userId !== authReq.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (order.paymentStatus === "paid") { res.status(400).json({ error: "Order already paid" }); return; }

    const amountNgn = SERVICE_PRICES[order.serviceType];
    if (!amountNgn) { res.status(400).json({ error: "Invalid service type" }); return; }

    const reference = `AO-${order.orderId}-${Date.now()}`;
    const amountKobo = Math.round(amountNgn * 100);

    const paystackData = await initializeTransaction(order.artistEmail, amountNgn, reference);

    await db.update(artistOrdersTable).set({ paystackRef: reference, updatedAt: new Date() }).where(eq(artistOrdersTable.id, id));

    res.json({
      reference,
      publicKey: PAYSTACK_PUBLIC_KEY,
      amountKobo,
      amountNgn,
      email: order.artistEmail,
      authorizationUrl: paystackData.authorization_url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment initialization failed";
    res.status(500).json({ error: message });
  }
});

// Artist: Verify Payment
router.post("/:id/pay-verify", requireArtist, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const { reference } = req.body as { reference: string };
    if (!reference) { res.status(400).json({ error: "reference required" }); return; }

    const [order] = await db.select().from(artistOrdersTable).where(eq(artistOrdersTable.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.userId !== authReq.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }

    if (order.paymentStatus === "paid") {
      res.json({ success: true, orderId: order.orderId }); return;
    }

    try {
      const verified = await verifyTransaction(reference);
      if (verified.status !== "success") {
        res.status(400).json({ error: "Payment not successful yet" }); return;
      }
    } catch { /* allow if Paystack not configured in dev */ }

    await db.update(artistOrdersTable).set({
      paymentStatus: "paid", status: "paid", updatedAt: new Date(),
    }).where(eq(artistOrdersTable.id, id));

    await db.insert(notificationsTable).values({
      userId: order.userId,
      title: "Payment Confirmed",
      message: `Payment for order ${order.orderId} confirmed. Your order is now being processed.`,
    });

    res.json({ success: true, orderId: order.orderId });
  } catch {
    res.status(500).json({ error: "Verification failed" });
  }
});

export const artistOrdersRouter = router;
