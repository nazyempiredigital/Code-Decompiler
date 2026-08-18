import { Router } from "express";
import { db } from "@workspace/db";
import { earningsUploadsTable, earningsEntriesTable, releasesTable, paymentRequestsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import multer from "multer";
import Papa from "papaparse";
import { requireAdmin, requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

type EarningsCsvRow = {
  ISRC?: string;
  isrc?: string;
  Earnings?: string;
  earnings?: string;
};

// ── Admin: upload an earnings CSV ──
router.post("/admin/upload", requireAdmin, upload.single("file"), async (req, res) => {
  const authReq = req as AuthRequest;
  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }

  try {
    const text = file.buffer.toString("utf-8");
    const parsed = Papa.parse<EarningsCsvRow>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      res.status(400).json({ error: "Could not parse CSV", details: parsed.errors[0]?.message });
      return;
    }

    const rows = parsed.data.filter((r) => (r.ISRC || r.isrc)?.trim());
    if (rows.length === 0) {
      res.status(400).json({ error: "No rows with an ISRC column found in this CSV" });
      return;
    }

    // Build ISRC → release lookup (single + multi-track)
    const allReleases = await db
      .select({ id: releasesTable.id, userId: releasesTable.userId, isrc: releasesTable.isrc, title: releasesTable.title, tracks: releasesTable.tracks })
      .from(releasesTable);

    const isrcToRelease = new Map<string, { releaseId: number; userId: number; title: string }>();
    for (const rel of allReleases) {
      if (rel.isrc) isrcToRelease.set(rel.isrc.trim().toUpperCase(), { releaseId: rel.id, userId: rel.userId, title: rel.title });
      if (Array.isArray(rel.tracks)) {
        for (const t of rel.tracks) {
          if (t.isrc) isrcToRelease.set(t.isrc.trim().toUpperCase(), { releaseId: rel.id, userId: rel.userId, title: t.title || rel.title });
        }
      }
    }

    const [uploadRow] = await db
      .insert(earningsUploadsTable)
      .values({ uploadedBy: authReq.user!.id, filename: file.originalname, totalRows: rows.length, matchedRows: 0, unmatchedRows: 0 })
      .returning();

    const entries: Array<typeof earningsEntriesTable.$inferInsert> = [];
    const unmatched: Array<{ isrc: string; title?: string; earnings: number }> = [];

    for (const row of rows) {
      const isrc = ((row.ISRC || row.isrc) ?? "").trim().toUpperCase();
      const earnings = Number.parseFloat((row.Earnings || row.earnings || "0").replace(/[^0-9.-]/g, "")) || 0;
      const match = isrcToRelease.get(isrc);
      if (!match) { unmatched.push({ isrc, earnings }); continue; }
      entries.push({ uploadId: uploadRow.id, userId: match.userId, releaseId: match.releaseId, isrc, trackTitle: match.title, earningsNgn: earnings });
    }

    if (entries.length > 0) await db.insert(earningsEntriesTable).values(entries);
    await db.update(earningsUploadsTable).set({ matchedRows: entries.length, unmatchedRows: unmatched.length, unmatched }).where(eq(earningsUploadsTable.id, uploadRow.id));

    res.json({ uploadId: uploadRow.id, totalRows: rows.length, matchedRows: entries.length, unmatchedRows: unmatched.length, unmatched });
  } catch (err) {
    logger.error({ err }, "Failed to process earnings CSV");
    res.status(500).json({ error: "Failed to process CSV" });
  }
});

// ── Admin: upload history ──
router.get("/admin/uploads", requireAdmin, async (_req, res) => {
  try {
    const uploads = await db.select().from(earningsUploadsTable).orderBy(desc(earningsUploadsTable.createdAt));
    res.json(uploads);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ── Artist: my earnings ──
router.get("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const entries = await db.select().from(earningsEntriesTable).where(eq(earningsEntriesTable.userId, authReq.user!.id));
    const totalEarningsNgn = entries.reduce((sum, e) => sum + e.earningsNgn, 0);
    const artistShareNgn = totalEarningsNgn * 0.85;
    const platformFeeNgn = totalEarningsNgn * 0.15;

    const byReleaseMap = new Map<number, { releaseId: number; title: string; earningsNgn: number }>();
    for (const e of entries) {
      const existing = byReleaseMap.get(e.releaseId);
      if (existing) { existing.earningsNgn += e.earningsNgn; }
      else { byReleaseMap.set(e.releaseId, { releaseId: e.releaseId, title: e.trackTitle || "Untitled", earningsNgn: e.earningsNgn }); }
    }

    // Requested amounts are deducted from the available balance the moment
    // a request is created, whether it's still pending or already paid.
    const requests = await db.select({ amountNgn: paymentRequestsTable.amountNgn }).from(paymentRequestsTable).where(eq(paymentRequestsTable.userId, authReq.user!.id));
    const totalRequestedNgn = requests.reduce((sum, r) => sum + r.amountNgn, 0);
    const availableBalanceNgn = Math.max(0, artistShareNgn - totalRequestedNgn);

    res.json({
      totalEarningsNgn,
      artistShareNgn,
      platformFeeNgn,
      totalRequestedNgn,
      availableBalanceNgn,
      byRelease: Array.from(byReleaseMap.values()).sort((a, b) => b.earningsNgn - a.earningsNgn),
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch artist earnings");
    res.status(500).json({ error: "Failed to fetch earnings" });
  }
});

// ── Admin: platform earnings summary ──
router.get("/admin/summary", requireAdmin, async (_req, res) => {
  try {
    const [total] = await db
      .select({ totalEarningsNgn: sql<number>`coalesce(sum(${earningsEntriesTable.earningsNgn}), 0)`.mapWith(Number) })
      .from(earningsEntriesTable);
    res.json({ totalEarningsNgn: total?.totalEarningsNgn || 0 });
  } catch { res.status(500).json({ error: "Failed" }); }
});

export const earningsRouter = router;
