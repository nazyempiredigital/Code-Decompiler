import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { mkdirSync } from "fs";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { db } from "@workspace/db";
import { usersTable, settingsTable, portfolioProjectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);
const allowedOrigins = new Set<string>();
// Explicitly configured origins (comma-separated list in env)
if (process.env.ALLOWED_ORIGINS) {
  for (const o of process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)) {
    allowedOrigins.add(o);
  }
}
// Always trust the current Replit dev domain (exact match only, not all *.replit.dev)
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      if (!origin) return callback(null, true);
      // Allow only explicitly listed origins
      if (allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
try { mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
app.use("/api/uploads", express.static(UPLOAD_DIR));

app.use("/api", router);

// NGN website & app development prices (~₦1,600 per USD)
const NGN_WEBSITE_PRICES = JSON.stringify({
  "Landing Page": 32000,
  "Personal Portfolio": 40000,
  "Blog Website & App": 48000,
  "School Website & App": 64000,
  "Church Website & App": 64000,
  "NGO Website & App": 72000,
  "Business Website & App": 80000,
  "Company Website & App": 96000,
  "Real Estate Website & App": 112000,
  "Hotel Website & App": 120000,
  "Restaurant Website & App": 120000,
  "News Website & App": 128000,
  "Directory Website & App": 144000,
  "E-learning Website & App": 160000,
  "Membership Website & App": 176000,
  "Booking Website & App": 192000,
  "Job Portal": 208000,
  "Marketplace Website & App": 240000,
  "E-commerce Store & App": 256000,
  "Custom Web Application": 400000,
});

const TLD_PRICES = JSON.stringify({
  ".com":    16067.31,
  ".ng":     9855.27,
  ".net":    31065.53,
  ".com.ng": 3213.68,
  ".edu.ng": 16711.11,
  ".org":    18103.70,
  ".biz":    51472.36,
  ".xyz":    36957.26,
});

const HOSTING_PLANS = JSON.stringify({
  Starter: {
    monthly: 1391.25, annual: 16695,
    features: ["8GB Webspace","30GB Bandwidth","10 Subdomains","2 Addon Domains","Free SSL Certificate","Unlimited Emails","Unlimited Database"],
  },
  Business: {
    monthly: 1947.75, annual: 23373,
    features: ["15GB Webspace","45GB Bandwidth","15 Subdomains","3 Addon Domains","Free SSL Certificate","Unlimited Emails","Unlimited Database"],
  },
  Professional: {
    monthly: 2504.25, annual: 30051,
    features: ["30GB Webspace","60GB Bandwidth","20 Subdomains","5 Addon Domains","Free SSL Certificate","Unlimited Emails","Unlimited Database"],
  },
  Enterprise: {
    monthly: 3060.75, annual: 36729,
    features: ["120GB Webspace","150GB Bandwidth","40 Subdomains","10 Addon Domains","Free SSL Certificate","Unlimited Emails","Unlimited Database"],
  },
  "Starter VPS": {
    monthly: 20833, annual: 250000,
    features: ["2 vCPU Cores","4 GB RAM","80 GB SSD/NVMe","2 TB Monthly Transfer","1 Dedicated IPv4"],
  },
  "Pro Business VPS": {
    monthly: 58333, annual: 700000,
    features: ["4 vCPU Cores","12 GB RAM","250 GB NVMe","5 TB Monthly Transfer","2 Dedicated IPv4"],
  },
  "Elite VPS": {
    monthly: 166666, annual: 2000000,
    features: ["12 vCPU Cores","32 GB RAM","600 GB Enterprise NVMe","Unmetered / 15 TB Transfer","3 Dedicated IPv4"],
  },
});

async function seedDefaults() {
  try {
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, "business_name")).limit(1);
    if (existing.length === 0) {
      // First-time seed: insert all static settings
      await db.insert(settingsTable).values([
        { key: "business_name", value: "Nazy Empire" },
        { key: "admin_email", value: process.env.ADMIN_EMAIL ?? "hello@nazyempire.com" },
        { key: "contact_phone", value: "" },
        { key: "contact_address", value: "" },
        { key: "facebook_url", value: "" },
        { key: "twitter_url", value: "" },
        { key: "instagram_url", value: "" },
      ]).onConflictDoNothing();
      logger.info("Default settings seeded");
    }

    // Always keep pricing settings up-to-date (upsert)
    const pricingSettings = [
      { key: "currency",       value: "NGN" },
      { key: "website_prices", value: NGN_WEBSITE_PRICES },
      { key: "tld_prices",     value: TLD_PRICES },
      { key: "hosting_plans",  value: HOSTING_PLANS },
    ];
    await Promise.all(
      pricingSettings.map((s) =>
        db.insert(settingsTable)
          .values(s)
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: s.value, updatedAt: new Date() } }),
      ),
    );

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const [existingAdmin] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1);
      if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await db.insert(usersTable).values({
          name: "Admin",
          email: adminEmail,
          passwordHash,
          role: "admin",
        });
        logger.info({ email: adminEmail }, "Admin user created from env vars");
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed defaults");
  }
}

async function seedPortfolio() {
  try {
    const existing = await db.select().from(portfolioProjectsTable).limit(1);
    if (existing.length > 0) return; // already seeded

    await db.insert(portfolioProjectsTable).values([
      {
        title: "Osei Ventures Corporate Site",
        description: "A modern, high-converting corporate website for a pan-African investment firm. Includes investor portal, news hub, and multi-language support.",
        imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80",
        category: "Business Website & App",
        link: null,
        sortOrder: 1,
        isVisible: true,
      },
      {
        title: "Kemi's Fashion E-Store",
        description: "Full-featured e-commerce platform with product variants, secure checkout via Paystack, inventory management, and order tracking.",
        imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80",
        category: "E-commerce Store & App",
        link: null,
        sortOrder: 2,
        isVisible: true,
      },
      {
        title: "Lagos Eats Restaurant App",
        description: "Online ordering and table reservation system for a popular Lagos restaurant chain. Integrated with delivery tracking and loyalty rewards.",
        imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80",
        category: "Restaurant Website & App",
        link: null,
        sortOrder: 3,
        isVisible: true,
      },
      {
        title: "AfroBeats Hub Platform",
        description: "Artist-first music streaming and distribution platform. Enables African artists to upload, distribute, and monetize their music globally.",
        imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80",
        category: "Music Distribution",
        link: null,
        sortOrder: 4,
        isVisible: true,
      },
      {
        title: "NaijaTech Academy",
        description: "E-learning platform with video courses, live sessions, certificates, and a community forum. Empowering Nigerian youth with tech skills.",
        imageUrl: "https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=800&q=80",
        category: "E-learning Website & App",
        link: null,
        sortOrder: 5,
        isVisible: true,
      },
    ]);
    logger.info("Demo portfolio projects seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed portfolio projects");
  }
}

setTimeout(seedDefaults, 2000);
setTimeout(seedPortfolio, 3000);

export default app;
