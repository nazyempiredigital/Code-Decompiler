import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, authReq.user!.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);
    res.json(notes);
  } catch {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/:id/read", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.id, parseInt(req.params["id"] as string)),
          eq(notificationsTable.userId, authReq.user!.id),
        ),
      );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to mark read" });
  }
});

router.post("/read-all", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, authReq.user!.id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to mark all read" });
  }
});

export const notificationsRouter = router;
