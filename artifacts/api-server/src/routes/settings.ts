import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";
import { PAYSTACK_PUBLIC_KEY } from "../lib/paystack.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    let websitePrices: Record<string, number> = {};
    try { websitePrices = JSON.parse(map["website_prices"] ?? "{}"); } catch {}

    let tldPrices: Record<string, number> = {};
    try { tldPrices = JSON.parse(map["tld_prices"] ?? "{}"); } catch {}

    let hostingPlans: Record<string, { monthly: number; annual: number; features: string[] }> = {};
    try { hostingPlans = JSON.parse(map["hosting_plans"] ?? "{}"); } catch {}

    res.json({
      businessName: map["business_name"] ?? "Nazy Empire",
      adminEmail: map["admin_email"] ?? "info@nazyempire.com",
      currency: map["currency"] ?? "NGN",
      websitePrices,
      tldPrices,
      hostingPlans,
      paystackPublicKey: PAYSTACK_PUBLIC_KEY,
      contactPhone: map["contact_phone"] ?? "",
      contactAddress: map["contact_address"] ?? "",
      facebookUrl: map["facebook_url"] ?? "",
      twitterUrl: map["twitter_url"] ?? "",
      instagramUrl: map["instagram_url"] ?? "",
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.get("/all", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.patch("/", requireAdmin, async (req, res) => {
  try {
    const { key, value } = req.body as { key: string; value: string };
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.post("/bulk", requireAdmin, async (req, res) => {
  try {
    const settings = req.body as Record<string, string>;
    await Promise.all(
      Object.entries(settings).map(([key, value]) =>
        db
          .insert(settingsTable)
          .values({ key, value })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } }),
      ),
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to bulk update settings" });
  }
});

export const settingsRouter = router;
