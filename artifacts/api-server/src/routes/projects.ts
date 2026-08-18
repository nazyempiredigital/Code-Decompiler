import { Router } from "express";
import { db } from "@workspace/db";
import {
  projectsTable,
  messagesTable,
  notificationsTable,
  settingsTable,
  paymentsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { mkdirSync } from "fs";
import crypto from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { sendProjectSubmissionEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

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

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

function generateProjectId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `NE-${y}${m}-${rand}`;
}

async function getPricingSettings(): Promise<{
  websitePrices: Record<string, number>;
  tldPrices: Record<string, number>;
  hostingPlans: Record<string, { annual: number }>;
}> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(
      // Use OR equivalent — read all pricing rows
      eq(settingsTable.key, "website_prices"),
    );
  const allRows = await db.select().from(settingsTable);
  const map = Object.fromEntries(allRows.map((r) => [r.key, r.value]));

  let websitePrices: Record<string, number> = {};
  let tldPrices: Record<string, number> = {};
  let hostingPlans: Record<string, { annual: number }> = {};
  try { websitePrices = JSON.parse(map["website_prices"] ?? "{}"); } catch {}
  try { tldPrices = JSON.parse(map["tld_prices"] ?? "{}"); } catch {}
  try { hostingPlans = JSON.parse(map["hosting_plans"] ?? "{}"); } catch {}
  return { websitePrices, tldPrices, hostingPlans };
}

router.post("/", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const body = req.body as {
      websiteType: string;
      includesDomainHosting: boolean;
      domainName?: string;
      domainTld?: string;
      domainPeriod?: number;
      hostingPlan?: string;
      hostingPeriod?: number;
      servicePeriod?: number;
      projectTitle?: string;
      description?: string;
      preferredCompletionDate?: string;
      clientName: string;
      clientEmail: string;
      clientPhone?: string;
      clientCompany?: string;
      clientCountry?: string;
      // Client-supplied amounts — treated as hints only; server recomputes
      developmentFee?: number;
      domainPrice?: number;
      hostingPrice?: number;
      totalAmount?: number;
      // Affiliate referral code (optional, captured at project creation)
      affiliateRef?: string;
    };

    if (!body.websiteType || !body.clientName || !body.clientEmail) {
      res.status(400).json({ error: "websiteType, clientName and clientEmail are required" });
      return;
    }

    // --- Server-side canonical pricing ---
    const { websitePrices, tldPrices, hostingPlans } = await getPricingSettings();

    const developmentFee = websitePrices[body.websiteType];
    if (developmentFee === undefined) {
      res.status(400).json({ error: `Unknown website type: ${body.websiteType}` });
      return;
    }

    let domainPrice = 0;
    let hostingPrice = 0;

    if (body.includesDomainHosting) {
      // Domain
      if (body.domainTld) {
        const yearlyPrice = tldPrices[body.domainTld] ?? 0;
        const period = Math.max(1, Math.min(3, Number(body.domainPeriod) || 1));
        domainPrice = yearlyPrice * period;
      }
      // Hosting (multi-year discounts: 2yr = 10% off, 3yr = 20% off)
      if (body.hostingPlan && hostingPlans[body.hostingPlan]) {
        const annual = hostingPlans[body.hostingPlan].annual ?? 0;
        const period = Math.max(1, Math.min(3, Number(body.hostingPeriod) || 1));
        const discountRate: Record<number, number> = { 1: 0, 2: 0.10, 3: 0.20 };
        hostingPrice = Math.round(annual * period * (1 - (discountRate[period] ?? 0)));
      }
    }

    const totalAmount = developmentFee + domainPrice + hostingPrice;

    logger.info(
      { websiteType: body.websiteType, developmentFee, domainPrice, hostingPrice, totalAmount },
      "Server-computed project pricing",
    );

    let projectId = generateProjectId();
    for (let i = 0; i < 5; i++) {
      const existing = await db.select().from(projectsTable).where(eq(projectsTable.projectId, projectId)).limit(1);
      if (existing.length === 0) break;
      projectId = generateProjectId();
    }

    // ── Resolve affiliate ref ──────────────────────────────────────────────
    let resolvedAffiliateRef: string | null = null;
    if (body.affiliateRef) {
      const [affiliateUser] = await db
        .select({ id: usersTable.id, referralCode: usersTable.referralCode, isAffiliate: usersTable.isAffiliate })
        .from(usersTable)
        .where(eq(usersTable.referralCode, body.affiliateRef))
        .limit(1);
      if (affiliateUser?.isAffiliate && affiliateUser.id !== authReq.user!.id) {
        resolvedAffiliateRef = body.affiliateRef;
      }
    }
    // Self-referral: if user is an affiliate and no external ref was provided
    if (!resolvedAffiliateRef) {
      const [userRow] = await db
        .select({ isAffiliate: usersTable.isAffiliate, referralCode: usersTable.referralCode })
        .from(usersTable)
        .where(eq(usersTable.id, authReq.user!.id))
        .limit(1);
      if (userRow?.isAffiliate && userRow.referralCode) {
        resolvedAffiliateRef = userRow.referralCode;
      }
    }

    const [project] = await db
      .insert(projectsTable)
      .values({
        projectId,
        userId: authReq.user!.id,
        websiteType: body.websiteType,
        developmentFee: String(developmentFee),
        includesDomainHosting: body.includesDomainHosting,
        domainName: body.domainName,
        domainPrice: String(domainPrice),
        hostingPrice: String(hostingPrice),
        servicePeriod: body.servicePeriod ?? 1,
        totalAmount: String(totalAmount),
        status: "awaiting_payment",
        affiliateRef: resolvedAffiliateRef,
        clientName: body.clientName,
        clientEmail: body.clientEmail,
        clientPhone: body.clientPhone,
        clientCompany: body.clientCompany,
        clientCountry: body.clientCountry,
        projectTitle: body.projectTitle,
        description: body.description,
        preferredCompletionDate: body.preferredCompletionDate,
        files: [],
        completedFiles: [],
      })
      .returning();

    await db.insert(notificationsTable).values({
      userId: authReq.user!.id,
      title: "Project Submitted",
      message: `Your project ${projectId} has been submitted and is awaiting payment.`,
    });

    sendProjectSubmissionEmail(
      projectId,
      body.clientName,
      body.clientEmail,
      body.websiteType,
      String(totalAmount),
    ).catch(() => {});

    res.json(project);
  } catch (err) {
    logger.error({ err }, "Project create error");
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const projects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.userId, authReq.user!.id))
      .orderBy(desc(projectsTable.createdAt));
    res.json(projects);
  } catch {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, parseInt(req.params["id"] as string)))
      .limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== authReq.user!.id && authReq.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    res.json(project);
  } catch {
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.get("/:id/messages", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const projectId = parseInt(req.params["id"] as string);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== authReq.user!.id && authReq.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.projectId, projectId))
      .orderBy(messagesTable.createdAt);
    res.json(msgs);
  } catch {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const id = parseInt(req.params["id"] as string);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const isOwner = project.userId === authReq.user!.id;
    if (!isOwner && authReq.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    // Clients may only delete projects still awaiting payment. Admins can always delete.
    if (isOwner && authReq.user!.role !== "admin" && project.status !== "awaiting_payment") {
      res.status(400).json({ error: "Only projects awaiting payment can be deleted" }); return;
    }
    await db.delete(messagesTable).where(eq(messagesTable.projectId, id));
    await db.delete(paymentsTable).where(eq(paymentsTable.projectId, id));
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "projects delete error");
    res.status(500).json({ error: "Delete failed" });
  }
});

router.post("/:id/messages", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const projectId = parseInt(req.params["id"] as string);
    const { content } = req.body as { content: string };
    if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== authReq.user!.id && authReq.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const [msg] = await db.insert(messagesTable).values({
      projectId,
      userId: authReq.user!.id,
      content: content.trim(),
      isAdmin: authReq.user!.role === "admin",
    }).returning();
    res.json(msg);
  } catch {
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/:id/files", requireAuth, upload.single("file"), async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const projectId = parseInt(req.params["id"] as string);
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file" }); return; }
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== authReq.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
    const url = `/api/uploads/${file.filename}`;
    const updatedFiles = [...(project.files ?? []), url];
    await db.update(projectsTable).set({ files: updatedFiles, updatedAt: new Date() }).where(eq(projectsTable.id, projectId));
    res.json({ url, filename: file.filename });
  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

export const projectsRouter = router;
