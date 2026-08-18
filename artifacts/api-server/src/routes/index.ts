import { Router } from "express";
import healthRouter from "./health.js";
import { authRouter } from "./auth.js";
import { projectsRouter } from "./projects.js";
import { paymentsRouter } from "./payments.js";
import { adminRouter } from "./admin.js";
import { settingsRouter } from "./settings.js";
import { notificationsRouter } from "./notifications.js";
import { artistApplicationsRouter } from "./artist-applications.js";
import { releasesRouter } from "./releases.js";
import { supportRouter } from "./support.js";
import { domainsRouter, checkDomainHandler } from "./domains.js";
import { portfolioRouter } from "./portfolio.js";
import { analyticsRouter } from "./analytics.js";
import { earningsRouter } from "./earnings.js";
import { payoutMethodsRouter } from "./payout-methods.js";
import { paymentRequestsRouter } from "./payment-requests.js";
import { blogRouter } from "./blog.js";
import { artistOrdersRouter } from "./artist-orders.js";
import { affiliatesRouter } from "./affiliates.js";
import multer from "multer";
import path from "path";
import { mkdirSync } from "fs";
import crypto from "crypto";
import { requireAuth } from "../middlewares/auth.js";

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
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file" }); return; }
  res.json({ url: `/api/uploads/${file.filename}`, filename: file.filename });
});

router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/projects", projectsRouter);
router.use("/payments", paymentsRouter);
router.use("/admin", adminRouter);
router.use("/settings", settingsRouter);
router.use("/notifications", notificationsRouter);
router.use("/artist-applications", artistApplicationsRouter);
router.use("/releases", releasesRouter);
router.use("/support", supportRouter);
router.use("/domains", domainsRouter);
router.use("/portfolio", portfolioRouter);
router.use("/analytics", analyticsRouter);
router.use("/earnings", earningsRouter);
router.use("/payout-methods", payoutMethodsRouter);
router.use("/payment-requests", paymentRequestsRouter);
router.use("/blog", blogRouter);
router.use("/artist-orders", artistOrdersRouter);
router.use("/affiliates", affiliatesRouter);
// Short-path alias used by the order form
router.get("/check-domain", checkDomainHandler);

export default router;
