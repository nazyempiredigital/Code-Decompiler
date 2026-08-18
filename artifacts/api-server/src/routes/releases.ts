import { Router } from "express";
import { db } from "@workspace/db";
import { releasesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireArtist, requireModerator, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { sendReleaseSubmittedEmail, sendReleaseStatusEmail } from "../lib/email.js";

const router = Router();

// Check if artist is blocked before upload
async function checkNotBlocked(req: AuthRequest, res: import("express").Response, next: import("express").NextFunction) {
  try {
    const [user] = await db
      .select({ isBlocked: usersTable.isBlocked, blockedReason: usersTable.blockedReason })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id))
      .limit(1);
    if (user?.isBlocked) {
      res.status(403).json({
        error: "Your account is suspended. Contact support.",
        blocked: true,
        reason: user.blockedReason,
      });
      return;
    }
    next();
  } catch {
    next();
  }
}

router.post("/", requireArtist, checkNotBlocked, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const body = req.body as Record<string, unknown>;
    const [release] = await db
      .insert(releasesTable)
      .values({
        userId: authReq.user!.id,
        releaseType: (body.releaseType as string) || "single",
        releaseTitle: (body.releaseTitle as string) || null,
        title: body.title as string,
        version: (body.version as string) || null,
        genre: body.genre as string,
        language: body.language as string,
        explicitContent: Boolean(body.explicitContent),
        isrc: (body.isrc as string) || null,
        upc: (body.upc as string) || null,
        releaseDate: (body.releaseDate as string) || null,
        originalReleaseDate: (body.originalReleaseDate as string) || null,
        copyright: (body.copyright as string) || null,
        copyrightRecordingYear: (body.copyrightRecordingYear as string) || null,
        publisher: (body.publisher as string) || null,
        composer: (body.composer as string) || null,
        songwriter: (body.songwriter as string) || null,
        producer: (body.producer as string) || null,
        lyrics: (body.lyrics as string) || null,
        mainArtists: (body.mainArtists as string) || null,
        featuredArtists: (body.featuredArtists as string) || null,
        streamingProfiles: (body.streamingProfiles as string) || null,
        collaborators: (body.collaborators as string) || null,
        stores: Array.isArray(body.stores) ? body.stores as string[] : null,
        territory: (body.territory as string) || "worldwide",
        selectedCountries: Array.isArray(body.selectedCountries) ? body.selectedCountries as string[] : null,
        tracks: Array.isArray(body.tracks) ? body.tracks as any[] : null,
        audioUrl: (body.audioUrl as string) || null,
        artworkUrl: (body.artworkUrl as string) || null,
        status: (body.status as "draft" | "pending_review") ?? "draft",
      })
      .returning();
    res.json(release);
  } catch (err) {
    logger.error({ err }, "releases create error");
    res.status(500).json({ error: "Failed to create release" });
  }
});

router.get("/my", requireArtist, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const releases = await db
      .select()
      .from(releasesTable)
      .where(eq(releasesTable.userId, authReq.user!.id))
      .orderBy(desc(releasesTable.createdAt));
    res.json(releases);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/", requireModerator, async (_req, res) => {
  try {
    const releases = await db
      .select({
        id: releasesTable.id,
        userId: releasesTable.userId,
        releaseType: releasesTable.releaseType,
        releaseTitle: releasesTable.releaseTitle,
        title: releasesTable.title,
        genre: releasesTable.genre,
        language: releasesTable.language,
        releaseDate: releasesTable.releaseDate,
        artworkUrl: releasesTable.artworkUrl,
        audioUrl: releasesTable.audioUrl,
        stores: releasesTable.stores,
        territory: releasesTable.territory,
        status: releasesTable.status,
        adminNotes: releasesTable.adminNotes,
        createdAt: releasesTable.createdAt,
        updatedAt: releasesTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(releasesTable)
      .leftJoin(usersTable, eq(releasesTable.userId, usersTable.id))
      .orderBy(desc(releasesTable.createdAt));
    res.json(releases);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const role = authReq.user!.role;
    if (role === "admin" || role === "moderator") {
      const rows = await db
        .select({
          id: releasesTable.id,
          userId: releasesTable.userId,
          releaseType: releasesTable.releaseType,
          releaseTitle: releasesTable.releaseTitle,
          title: releasesTable.title,
          version: releasesTable.version,
          genre: releasesTable.genre,
          language: releasesTable.language,
          explicitContent: releasesTable.explicitContent,
          isrc: releasesTable.isrc,
          upc: releasesTable.upc,
          releaseDate: releasesTable.releaseDate,
          originalReleaseDate: releasesTable.originalReleaseDate,
          copyright: releasesTable.copyright,
          copyrightRecordingYear: releasesTable.copyrightRecordingYear,
          publisher: releasesTable.publisher,
          composer: releasesTable.composer,
          songwriter: releasesTable.songwriter,
          producer: releasesTable.producer,
          lyrics: releasesTable.lyrics,
          mainArtists: releasesTable.mainArtists,
          featuredArtists: releasesTable.featuredArtists,
          stores: releasesTable.stores,
          territory: releasesTable.territory,
          selectedCountries: releasesTable.selectedCountries,
          tracks: releasesTable.tracks,
          audioUrl: releasesTable.audioUrl,
          artworkUrl: releasesTable.artworkUrl,
          status: releasesTable.status,
          adminNotes: releasesTable.adminNotes,
          createdAt: releasesTable.createdAt,
          updatedAt: releasesTable.updatedAt,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(releasesTable)
        .leftJoin(usersTable, eq(releasesTable.userId, usersTable.id))
        .where(eq(releasesTable.id, id))
        .limit(1);
      if (!rows[0]) { res.status(404).json({ error: "Release not found" }); return; }
      res.json(rows[0]);
    } else {
      const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, id)).limit(1);
      if (!release) { res.status(404).json({ error: "Release not found" }); return; }
      if (release.userId !== authReq.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
      res.json(release);
    }
  } catch (err) {
    logger.error({ err }, "releases get by id error");
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
    const role = authReq.user!.role;
    const isOwner = existing.userId === authReq.user!.id;
    if (!isOwner && role !== "admin" && role !== "moderator") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const body = req.body as Record<string, unknown>;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (role === "admin" || role === "moderator") {
      if (body.status !== undefined) updateData.status = body.status;
      if (body.adminNotes !== undefined) updateData.adminNotes = body.adminNotes;
      if (body.isrc !== undefined) updateData.isrc = body.isrc || null;
      if (body.upc !== undefined) updateData.upc = body.upc || null;
    }
    if (isOwner && (existing.status === "draft" || existing.status === "changes_requested" || existing.status === "rejected")) {
      const fields = [
        "releaseType","releaseTitle","title","version","genre","language","explicitContent",
        "releaseDate","originalReleaseDate","copyright","copyrightRecordingYear","publisher","composer",
        "songwriter","producer","lyrics","audioUrl","artworkUrl","territory","status",
      ];
      if (body.isrc !== undefined && !existing.isrc) updateData.isrc = body.isrc || null;
      if (body.upc !== undefined && !existing.upc) updateData.upc = body.upc || null;
      for (const f of fields) {
        if (body[f] !== undefined) updateData[f] = body[f];
      }
      if (body.mainArtists !== undefined) updateData.mainArtists = body.mainArtists || null;
      if (body.featuredArtists !== undefined) updateData.featuredArtists = body.featuredArtists || null;
      if (body.streamingProfiles !== undefined) updateData.streamingProfiles = body.streamingProfiles || null;
      if (body.collaborators !== undefined) updateData.collaborators = body.collaborators || null;
      if (Array.isArray(body.stores)) updateData.stores = body.stores;
      if (Array.isArray(body.selectedCountries)) updateData.selectedCountries = body.selectedCountries;
      if (Array.isArray(body.tracks)) updateData.tracks = body.tracks;
    }
    const [updated] = await db.update(releasesTable).set(updateData).where(eq(releasesTable.id, id)).returning();
    res.json(updated);

    const newStatus = updateData.status as string | undefined;
    if (newStatus) {
      const releaseTitle = (updated.releaseTitle || updated.title) ?? "your release";
      if (!isOwner && (newStatus === "approved" || newStatus === "rejected" || newStatus === "distributed" || newStatus === "changes_requested")) {
        // Admin changed status — notify owner
        db.select({ name: usersTable.name, email: usersTable.email })
          .from(usersTable).where(eq(usersTable.id, updated.userId)).limit(1)
          .then(([u]) => { if (u) sendReleaseStatusEmail(u.name, u.email, releaseTitle, newStatus, updated.adminNotes).catch(() => {}); })
          .catch(() => {});
      } else if (isOwner && newStatus === "pending_review") {
        // Artist submitted for review
        sendReleaseSubmittedEmail(authReq.user!.name, authReq.user!.email, releaseTitle).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, "releases patch error");
    res.status(500).json({ error: "Update failed" });
  }
});

// Delete a release — only allowed for draft or rejected by the owner
router.delete("/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
    const isOwner = existing.userId === authReq.user!.id;
    const role = authReq.user!.role;
    if (!isOwner && role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    // Artists can only delete draft or rejected releases
    if (isOwner && role !== "admin" && existing.status !== "draft" && existing.status !== "rejected") {
      res.status(400).json({ error: "Only draft or rejected releases can be deleted" }); return;
    }
    await db.delete(releasesTable).where(eq(releasesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "releases delete error");
    res.status(500).json({ error: "Delete failed" });
  }
});

export const releasesRouter = router;
