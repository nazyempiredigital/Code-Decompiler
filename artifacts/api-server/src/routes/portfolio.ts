import { Router } from "express";
import { db } from "@workspace/db";
import { portfolioProjectsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { mkdirSync } from "fs";
import crypto from "crypto";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
try { mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const unique = crypto.randomBytes(8).toString("hex");
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${unique}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** Public — list all visible portfolio projects ordered by sortOrder */
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(portfolioProjectsTable)
      .where(eq(portfolioProjectsTable.isVisible, true))
      .orderBy(asc(portfolioProjectsTable.sortOrder), asc(portfolioProjectsTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

/** Admin — list ALL portfolio projects (including hidden) */
router.get("/all", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(portfolioProjectsTable)
      .orderBy(asc(portfolioProjectsTable.sortOrder), asc(portfolioProjectsTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

/** Admin — create a new portfolio project */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { title, description, imageUrl, category, link, sortOrder, isVisible } =
      req.body as {
        title: string;
        description: string;
        imageUrl: string;
        category?: string;
        link?: string;
        sortOrder?: number;
        isVisible?: boolean;
      };

    if (!title?.trim() || !description?.trim() || !imageUrl?.trim()) {
      res.status(400).json({ error: "title, description, and imageUrl are required" });
      return;
    }

    const [row] = await db
      .insert(portfolioProjectsTable)
      .values({
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        category: category?.trim() || "Web Development",
        link: link?.trim() || null,
        sortOrder: sortOrder ?? 0,
        isVisible: isVisible ?? true,
      })
      .returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to create portfolio project" });
  }
});

/** Admin — update a portfolio project */
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { title, description, imageUrl, category, link, sortOrder, isVisible } =
      req.body as Partial<{
        title: string;
        description: string;
        imageUrl: string;
        category: string;
        link: string;
        sortOrder: number;
        isVisible: boolean;
      }>;

    const [row] = await db
      .update(portfolioProjectsTable)
      .set({
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description: description.trim() } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl.trim() } : {}),
        ...(category !== undefined ? { category: category.trim() } : {}),
        ...(link !== undefined ? { link: link.trim() || null } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isVisible !== undefined ? { isVisible } : {}),
        updatedAt: new Date(),
      })
      .where(eq(portfolioProjectsTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Portfolio project not found" }); return; }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Failed to update portfolio project" });
  }
});

/** Admin — delete a portfolio project */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(portfolioProjectsTable).where(eq(portfolioProjectsTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete portfolio project" });
  }
});

/** Admin — upload a portfolio project image */
router.post("/upload-image", requireAdmin, upload.single("image"), (req, res) => {
  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }
  res.json({ url: `/api/uploads/${file.filename}` });
});

export const portfolioRouter = router;
