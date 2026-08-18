import { Router } from "express";
import { db } from "@workspace/db";
import { blogPostsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

/** Public — list all published posts (latest first) */
router.get("/", async (req, res) => {
  try {
    const limit = req.query["limit"] ? parseInt(req.query["limit"] as string) : undefined;
    let query = db
      .select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.isPublished, true))
      .orderBy(desc(blogPostsTable.publishedAt))
      .$dynamic();
    if (limit) query = query.limit(limit);
    const rows = await query;
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

/** Public — get a single published post by slug */
router.get("/slug/:slug", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(blogPostsTable)
      .where(
        and(
          eq(blogPostsTable.slug, req.params["slug"] as string),
          eq(blogPostsTable.isPublished, true)
        )
      )
      .limit(1);
    if (!row) { res.status(404).json({ error: "Post not found" }); return; }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

/** Admin — list all posts (including drafts) */
router.get("/admin/all", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(blogPostsTable)
      .orderBy(desc(blogPostsTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

/** Admin — get a single post by ID */
router.get("/admin/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [row] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Post not found" }); return; }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

/** Admin — create a new blog post */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const {
      title, slug, excerpt, content, featuredImage, category, tags, author,
      metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription, ogImage, canonicalUrl,
      isPublished,
    } = req.body as Record<string, string | boolean | undefined>;

    if (!title || !slug || !content) {
      res.status(400).json({ error: "title, slug, and content are required" });
      return;
    }

    const [row] = await db
      .insert(blogPostsTable)
      .values({
        title: String(title).trim(),
        slug: String(slug).trim().toLowerCase().replace(/\s+/g, "-"),
        excerpt: excerpt ? String(excerpt).trim() : null,
        content: String(content).trim(),
        featuredImage: featuredImage ? String(featuredImage).trim() : null,
        category: category ? String(category).trim() : "General",
        tags: tags ? String(tags).trim() : null,
        author: author ? String(author).trim() : "Nazy Empire",
        metaTitle: metaTitle ? String(metaTitle).trim() : null,
        metaDescription: metaDescription ? String(metaDescription).trim() : null,
        metaKeywords: metaKeywords ? String(metaKeywords).trim() : null,
        ogTitle: ogTitle ? String(ogTitle).trim() : null,
        ogDescription: ogDescription ? String(ogDescription).trim() : null,
        ogImage: ogImage ? String(ogImage).trim() : null,
        canonicalUrl: canonicalUrl ? String(canonicalUrl).trim() : null,
        isPublished: Boolean(isPublished),
        publishedAt: isPublished ? new Date() : null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "A post with this slug already exists" });
    } else {
      res.status(500).json({ error: "Failed to create blog post" });
    }
  }
});

/** Admin — update a blog post */
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const {
      title, slug, excerpt, content, featuredImage, category, tags, author,
      metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription, ogImage, canonicalUrl,
      isPublished,
    } = req.body as Record<string, string | boolean | undefined>;

    // Fetch current to check publish state transition
    const [current] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Post not found" }); return; }

    const wasPublished = current.isPublished;
    const nowPublished = isPublished !== undefined ? Boolean(isPublished) : current.isPublished;
    const publishedAt = (!wasPublished && nowPublished) ? new Date() : (nowPublished ? current.publishedAt : null);

    const [row] = await db
      .update(blogPostsTable)
      .set({
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(slug !== undefined ? { slug: String(slug).trim().toLowerCase().replace(/\s+/g, "-") } : {}),
        ...(excerpt !== undefined ? { excerpt: excerpt ? String(excerpt).trim() : null } : {}),
        ...(content !== undefined ? { content: String(content).trim() } : {}),
        ...(featuredImage !== undefined ? { featuredImage: featuredImage ? String(featuredImage).trim() : null } : {}),
        ...(category !== undefined ? { category: String(category).trim() } : {}),
        ...(tags !== undefined ? { tags: tags ? String(tags).trim() : null } : {}),
        ...(author !== undefined ? { author: String(author).trim() } : {}),
        ...(metaTitle !== undefined ? { metaTitle: metaTitle ? String(metaTitle).trim() : null } : {}),
        ...(metaDescription !== undefined ? { metaDescription: metaDescription ? String(metaDescription).trim() : null } : {}),
        ...(metaKeywords !== undefined ? { metaKeywords: metaKeywords ? String(metaKeywords).trim() : null } : {}),
        ...(ogTitle !== undefined ? { ogTitle: ogTitle ? String(ogTitle).trim() : null } : {}),
        ...(ogDescription !== undefined ? { ogDescription: ogDescription ? String(ogDescription).trim() : null } : {}),
        ...(ogImage !== undefined ? { ogImage: ogImage ? String(ogImage).trim() : null } : {}),
        ...(canonicalUrl !== undefined ? { canonicalUrl: canonicalUrl ? String(canonicalUrl).trim() : null } : {}),
        ...(isPublished !== undefined ? { isPublished: nowPublished, publishedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(blogPostsTable.id, id))
      .returning();
    res.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "A post with this slug already exists" });
    } else {
      res.status(500).json({ error: "Failed to update blog post" });
    }
  }
});

/** Admin — delete a blog post */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(blogPostsTable).where(eq(blogPostsTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete blog post" });
  }
});

export const blogRouter = router;
