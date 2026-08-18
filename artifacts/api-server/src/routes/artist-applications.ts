import { Router } from "express";
import { db } from "@workspace/db";
import { artistApplicationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { sendArtistApplicationReceivedEmail, sendArtistApplicationDecisionEmail } from "../lib/email.js";

const router = Router();

router.post("/apply", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const { stageName, bio, genre, socialLinks } = req.body as Record<string, string>;
    if (!stageName || !bio || !genre) {
      res.status(400).json({ error: "stageName, bio and genre are required" });
      return;
    }
    const bioWordCount = bio.trim() === "" ? 0 : bio.trim().split(/\s+/).length;
    if (bio.length > 1000 || bioWordCount > 250) {
      res.status(400).json({ error: "Bio must be at most 250 words and 1000 characters." });
      return;
    }
    const existing = await db
      .select()
      .from(artistApplicationsTable)
      .where(eq(artistApplicationsTable.userId, authReq.user!.id))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "You already have a pending or reviewed application", application: existing[0] });
      return;
    }
    const [app] = await db
      .insert(artistApplicationsTable)
      .values({
        userId: authReq.user!.id,
        stageName,
        bio,
        genre,
        socialLinks: socialLinks ? JSON.stringify(socialLinks) : null,
      })
      .returning();
    res.json(app);
    sendArtistApplicationReceivedEmail(authReq.user!.name, authReq.user!.email, stageName).catch(() => {});
  } catch (err) {
    logger.error({ err }, "artist-applications apply error");
    res.status(500).json({ error: "Application failed" });
  }
});

router.get("/my", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [app] = await db
      .select()
      .from(artistApplicationsTable)
      .where(eq(artistApplicationsTable.userId, authReq.user!.id))
      .limit(1);
    res.json(app ?? null);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const apps = await db
      .select({
        id: artistApplicationsTable.id,
        userId: artistApplicationsTable.userId,
        stageName: artistApplicationsTable.stageName,
        bio: artistApplicationsTable.bio,
        genre: artistApplicationsTable.genre,
        socialLinks: artistApplicationsTable.socialLinks,
        status: artistApplicationsTable.status,
        adminNotes: artistApplicationsTable.adminNotes,
        createdAt: artistApplicationsTable.createdAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(artistApplicationsTable)
      .leftJoin(usersTable, eq(artistApplicationsTable.userId, usersTable.id))
      .orderBy(artistApplicationsTable.createdAt);
    res.json(apps);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/:id/review", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status, adminNotes } = req.body as { status: "approved" | "rejected"; adminNotes?: string };
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be approved or rejected" });
      return;
    }
    const [app] = await db
      .update(artistApplicationsTable)
      .set({ status, adminNotes, updatedAt: new Date() })
      .where(eq(artistApplicationsTable.id, id))
      .returning();
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }

    if (status === "approved") {
      await db
        .update(usersTable)
        .set({ role: "verified_artist", updatedAt: new Date() })
        .where(eq(usersTable.id, app.userId));
      logger.info({ userId: app.userId }, "Artist approved — role updated to verified_artist");
    } else {
      await db
        .update(usersTable)
        .set({ role: "client", updatedAt: new Date() })
        .where(eq(usersTable.id, app.userId));
    }
    res.json(app);
    db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, app.userId)).limit(1)
      .then(([u]) => { if (u) sendArtistApplicationDecisionEmail(u.name, u.email, app.stageName, status, app.adminNotes).catch(() => {}); })
      .catch(() => {});
  } catch (err) {
    logger.error({ err }, "artist review error");
    res.status(500).json({ error: "Review failed" });
  }
});

export const artistApplicationsRouter = router;
