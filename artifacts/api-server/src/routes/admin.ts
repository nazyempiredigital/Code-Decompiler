import { Router } from "express";
import { db } from "@workspace/db";
import {
  projectsTable,
  paymentsTable,
  usersTable,
  notificationsTable,
  artistApplicationsTable,
  releasesTable,
  supportTicketsTable,
} from "@workspace/db";
import { eq, desc, ilike, or, count, sum } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { mkdirSync } from "fs";
import crypto from "crypto";
import { requireAdmin } from "../middlewares/auth.js";
import { sendStatusUpdateEmail } from "../lib/email.js";

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
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const [total] = await db.select({ count: count() }).from(projectsTable);
    const [active] = await db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.status, "in_progress"));
    const [completed] = await db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.status, "completed"));
    const [delivered] = await db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.status, "delivered"));
    const [revenue] = await db.select({ total: sum(projectsTable.totalAmount) }).from(projectsTable).where(eq(projectsTable.paymentStatus, "paid"));
    const [clients] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "client"));
    const [artists] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "verified_artist"));
    const [pendingApps] = await db.select({ count: count() }).from(artistApplicationsTable).where(eq(artistApplicationsTable.status, "pending"));
    const [pendingReleases] = await db.select({ count: count() }).from(releasesTable).where(eq(releasesTable.status, "pending_review"));
    const [openTickets] = await db.select({ count: count() }).from(supportTicketsTable).where(eq(supportTicketsTable.status, "open"));
    const recent = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt)).limit(5);

    res.json({
      totalProjects: total.count,
      activeProjects: active.count,
      completedProjects: completed.count,
      deliveredProjects: delivered.count,
      totalRevenue: revenue.total ?? "0",
      totalClients: clients.count,
      totalArtists: artists.count,
      pendingArtistApplications: pendingApps.count,
      pendingReleases: pendingReleases.count,
      openSupportTickets: openTickets.count,
      recentOrders: recent,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/users", requireAdmin, async (_req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      phone: usersTable.phone,
      company: usersTable.company,
      country: usersTable.country,
      isBlocked: usersTable.isBlocked,
      blockedReason: usersTable.blockedReason,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt));
    res.json(users);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { role } = req.body as { role: string };
    const validRoles = ["client", "admin", "verified_artist", "moderator"];
    if (!validRoles.includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }
    const [user] = await db.update(usersTable).set({ role: role as any, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// Block a user
router.patch("/users/:id/block", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { reason } = req.body as { reason?: string };
    const [user] = await db
      .update(usersTable)
      .set({ isBlocked: true, blockedReason: reason || null, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, isBlocked: usersTable.isBlocked, blockedReason: usersTable.blockedReason });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    // Notify the user
    await db.insert(notificationsTable).values({
      userId: id,
      title: "Account Suspended",
      message: reason ? `Your account has been suspended. Reason: ${reason}` : "Your account has been suspended. Contact support for more information.",
    }).catch(() => {});
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to block user" });
  }
});

// Unblock a user
router.patch("/users/:id/unblock", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [user] = await db
      .update(usersTable)
      .set({ isBlocked: false, blockedReason: null, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, isBlocked: usersTable.isBlocked });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    await db.insert(notificationsTable).values({
      userId: id,
      title: "Account Restored",
      message: "Your account suspension has been lifted. You can now use all features.",
    }).catch(() => {});
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

// Delete a user
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/projects", requireAdmin, async (req, res) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string };
    let query = db.select().from(projectsTable).$dynamic();
    if (status && status !== "all") {
      query = query.where(eq(projectsTable.status, status as any));
    }
    const results = await query.orderBy(desc(projectsTable.createdAt));
    if (search) {
      const s = search.toLowerCase();
      const filtered = results.filter(
        (p) =>
          p.projectId.toLowerCase().includes(s) ||
          p.clientName.toLowerCase().includes(s) ||
          p.clientEmail.toLowerCase().includes(s) ||
          p.websiteType.toLowerCase().includes(s),
      );
      res.json(filtered);
      return;
    }
    res.json(results);
  } catch {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.patch("/projects/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status, internalNotes } = req.body as { status?: string; internalNotes?: string };
    const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
    await db.update(projectsTable).set({
      ...(status ? { status: status as any } : {}),
      ...(internalNotes !== undefined ? { internalNotes } : {}),
      updatedAt: new Date(),
    }).where(eq(projectsTable.id, id));
    if (status && status !== existing.status) {
      await db.insert(notificationsTable).values({
        userId: existing.userId,
        title: "Project Status Updated",
        message: `Your project ${existing.projectId} status has been updated to: ${status.replace(/_/g, " ")}.`,
      });
      sendStatusUpdateEmail(
        existing.projectId,
        existing.clientName,
        existing.clientEmail,
        status,
      ).catch(() => {});
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.post("/projects/:id/completed-files", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    const projectId = parseInt(req.params["id"] as string);
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file" }); return; }
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const url = `/api/uploads/${file.filename}`;
    const updatedFiles = [...(project.completedFiles ?? []), url];
    await db.update(projectsTable).set({ completedFiles: updatedFiles, updatedAt: new Date() }).where(eq(projectsTable.id, projectId));
    await db.insert(notificationsTable).values({
      userId: project.userId,
      title: "Completed File Uploaded",
      message: `A completed file has been uploaded for project ${project.projectId}.`,
    });
    res.json({ url, filename: file.filename });
  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

router.get("/clients", requireAdmin, async (_req, res) => {
  try {
    const clients = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "client"))
      .orderBy(desc(usersTable.createdAt));
    res.json(clients);
  } catch {
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

router.get("/payments", requireAdmin, async (_req, res) => {
  try {
    const payments = await db
      .select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.createdAt));
    res.json(payments);
  } catch {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

export const adminRouter = router;
