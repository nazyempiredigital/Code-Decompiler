import { Router } from "express";
import { db } from "@workspace/db";
import { analyticsUploadsTable, analyticsEntriesTable, releasesTable } from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import multer from "multer";
import Papa from "papaparse";
import { requireAdmin, requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

// CSVs are small text files — parse in memory, no need to persist the raw file
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

type CsvRow = {
  raw_title?: string;
  release_name?: string;
  upc?: string;
  isrc?: string;
  outlet?: string;
  streams?: string;
};

// ── Admin: upload a streaming analytics CSV ──
router.post("/admin/upload", requireAdmin, upload.single("file"), async (req, res) => {
  const authReq = req as AuthRequest;
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const text = file.buffer.toString("utf-8");
    const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      res.status(400).json({ error: "Could not parse CSV file", details: parsed.errors[0]?.message });
      return;
    }

    const rows = parsed.data.filter((r) => r.isrc && r.isrc.trim());
    if (rows.length === 0) {
      res.status(400).json({ error: "No rows with an ISRC column found in this CSV" });
      return;
    }

    // Build a lookup of every ISRC we might need: single-track releases (releases.isrc)
    // and multi-track releases (isrc inside the tracks JSON array).
    const isrcs = Array.from(new Set(rows.map((r) => r.isrc!.trim().toUpperCase())));
    const allReleases = await db
      .select({ id: releasesTable.id, userId: releasesTable.userId, isrc: releasesTable.isrc, title: releasesTable.title, tracks: releasesTable.tracks })
      .from(releasesTable);

    const isrcToRelease = new Map<string, { releaseId: number; userId: number; title: string }>();
    for (const rel of allReleases) {
      if (rel.isrc) {
        isrcToRelease.set(rel.isrc.trim().toUpperCase(), { releaseId: rel.id, userId: rel.userId, title: rel.title });
      }
      if (Array.isArray(rel.tracks)) {
        for (const t of rel.tracks) {
          if (t.isrc) {
            isrcToRelease.set(t.isrc.trim().toUpperCase(), { releaseId: rel.id, userId: rel.userId, title: t.title || rel.title });
          }
        }
      }
    }

    const [uploadRow] = await db
      .insert(analyticsUploadsTable)
      .values({
        uploadedBy: authReq.user!.id,
        filename: file.originalname,
        totalRows: rows.length,
        matchedRows: 0,
        unmatchedRows: 0,
      })
      .returning();

    const entries: Array<typeof analyticsEntriesTable.$inferInsert> = [];
    const unmatched: Array<{ isrc: string; title?: string; outlet?: string; streams?: number }> = [];

    for (const row of rows) {
      const isrc = row.isrc!.trim().toUpperCase();
      const streams = Number.parseInt(row.streams || "0", 10) || 0;
      const outlet = (row.outlet || "unknown").trim().toLowerCase();
      const match = isrcToRelease.get(isrc);
      if (!match) {
        unmatched.push({ isrc, title: row.raw_title || row.release_name, outlet, streams });
        continue;
      }
      entries.push({
        uploadId: uploadRow.id,
        userId: match.userId,
        releaseId: match.releaseId,
        isrc,
        trackTitle: match.title,
        outlet,
        streams,
      });
    }

    if (entries.length > 0) {
      await db.insert(analyticsEntriesTable).values(entries);
    }

    await db
      .update(analyticsUploadsTable)
      .set({ matchedRows: entries.length, unmatchedRows: unmatched.length, unmatched })
      .where(eq(analyticsUploadsTable.id, uploadRow.id));

    res.json({
      uploadId: uploadRow.id,
      totalRows: rows.length,
      matchedRows: entries.length,
      unmatchedRows: unmatched.length,
      unmatched,
    });
  } catch (err) {
    logger.error({ err }, "Failed to process analytics CSV upload");
    res.status(500).json({ error: "Failed to process CSV" });
  }
});

// ── Admin: upload history ──
router.get("/admin/uploads", requireAdmin, async (_req, res) => {
  try {
    const uploads = await db
      .select()
      .from(analyticsUploadsTable)
      .orderBy(desc(analyticsUploadsTable.createdAt));
    res.json(uploads);
  } catch {
    res.status(500).json({ error: "Failed to fetch upload history" });
  }
});

// ── Admin: platform-wide totals ──
router.get("/admin/summary", requireAdmin, async (_req, res) => {
  try {
    const byOutlet = await db
      .select({ outlet: analyticsEntriesTable.outlet, streams: sql<number>`sum(${analyticsEntriesTable.streams})`.mapWith(Number) })
      .from(analyticsEntriesTable)
      .groupBy(analyticsEntriesTable.outlet);
    const [total] = await db
      .select({ streams: sql<number>`coalesce(sum(${analyticsEntriesTable.streams}), 0)`.mapWith(Number) })
      .from(analyticsEntriesTable);
    res.json({ totalStreams: total?.streams || 0, byOutlet });
  } catch {
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

// ── Artist: my own analytics ──
router.get("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const entries = await db
      .select()
      .from(analyticsEntriesTable)
      .where(eq(analyticsEntriesTable.userId, authReq.user!.id));

    const totalStreams = entries.reduce((sum, e) => sum + e.streams, 0);

    const byOutletMap = new Map<string, number>();
    const byReleaseMap = new Map<number, { releaseId: number; title: string; streams: number }>();
    for (const e of entries) {
      byOutletMap.set(e.outlet, (byOutletMap.get(e.outlet) || 0) + e.streams);
      const existing = byReleaseMap.get(e.releaseId);
      if (existing) {
        existing.streams += e.streams;
      } else {
        byReleaseMap.set(e.releaseId, { releaseId: e.releaseId, title: e.trackTitle || "Untitled", streams: e.streams });
      }
    }

    res.json({
      totalStreams,
      byOutlet: Array.from(byOutletMap.entries()).map(([outlet, streams]) => ({ outlet, streams })),
      byRelease: Array.from(byReleaseMap.values()).sort((a, b) => b.streams - a.streams),
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch artist analytics");
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export const analyticsRouter = router;
