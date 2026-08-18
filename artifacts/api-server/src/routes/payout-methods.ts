import { Router } from "express";
import { db } from "@workspace/db";
import { payoutMethodsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

const VALID_METHODS = new Set(["paypal", "bank_transfer"]);
const VALID_CURRENCIES = new Set(["NGN", "USD"]);
const VALID_BANK_TYPES = new Set(["naira", "ach", "wire", "swift"]);

function validatePayload(body: Record<string, unknown>): { error: string } | {
  method: string;
  currency: string | null;
  bankDetailType: string | null;
  details: Record<string, string>;
} {
  const method = body.method as string;
  if (!VALID_METHODS.has(method)) return { error: "Invalid payment method" };

  if (method === "paypal") {
    const email = (body.details as Record<string, string> | undefined)?.email?.trim();
    if (!email) return { error: "PayPal email is required" };
    return { method, currency: null, bankDetailType: null, details: { email } };
  }

  // bank_transfer
  const currency = body.currency as string;
  if (!VALID_CURRENCIES.has(currency)) return { error: "Invalid currency" };

  if (currency === "NGN") {
    const details = (body.details as Record<string, string>) ?? {};
    const bankName = details.bankName?.trim();
    const accountNumber = details.accountNumber?.trim();
    const accountName = details.accountName?.trim();
    if (!bankName || !accountNumber || !accountName) {
      return { error: "Bank name, account number and account name are required" };
    }
    return { method, currency, bankDetailType: "naira", details: { bankName, accountNumber, accountName } };
  }

  // USD bank transfer
  const bankDetailType = body.bankDetailType as string;
  if (!VALID_BANK_TYPES.has(bankDetailType) || bankDetailType === "naira") {
    return { error: "Invalid receiver bank details type" };
  }
  const details = (body.details as Record<string, string>) ?? {};
  const receiverType = details.receiverType?.trim();
  const accountName = details.accountName?.trim();
  const accountNumber = details.accountNumber?.trim();
  if (!receiverType || !accountName) return { error: "Receiver type and account name are required" };

  if (bankDetailType === "ach") {
    const routingNumber = details.routingNumber?.trim();
    const accountType = details.accountType?.trim();
    if (!routingNumber || !accountNumber || !accountType) {
      return { error: "ACH routing number, account number and account type are required" };
    }
    return { method, currency, bankDetailType, details: { receiverType, routingNumber, accountNumber, accountType, accountName } };
  }

  if (bankDetailType === "wire") {
    const routingNumber = details.routingNumber?.trim();
    if (!routingNumber || !accountNumber) {
      return { error: "Routing number and account number are required" };
    }
    return { method, currency, bankDetailType, details: { receiverType, routingNumber, accountNumber, accountName } };
  }

  // swift
  const swiftBicCode = details.swiftBicCode?.trim();
  if (!swiftBicCode || !accountNumber) {
    return { error: "SWIFT/BIC code and IBAN/account number are required" };
  }
  return { method, currency, bankDetailType, details: { receiverType, swiftBicCode, accountNumber, accountName } };
}

// ── Artist: get my payout method ──
router.get("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [row] = await db.select().from(payoutMethodsTable).where(eq(payoutMethodsTable.userId, authReq.user!.id)).limit(1);
    res.json(row ?? null);
  } catch (err) {
    logger.error({ err }, "Failed to fetch payout method");
    res.status(500).json({ error: "Failed to fetch payout method" });
  }
});

// ── Artist: create or replace my payout method ──
router.put("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const parsed = validatePayload(req.body as Record<string, unknown>);
    if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }

    const [existing] = await db.select({ id: payoutMethodsTable.id }).from(payoutMethodsTable).where(eq(payoutMethodsTable.userId, authReq.user!.id)).limit(1);

    const [saved] = existing
      ? await db.update(payoutMethodsTable)
          .set({ method: parsed.method, currency: parsed.currency, bankDetailType: parsed.bankDetailType, details: parsed.details, updatedAt: new Date() })
          .where(eq(payoutMethodsTable.userId, authReq.user!.id))
          .returning()
      : await db.insert(payoutMethodsTable)
          .values({ userId: authReq.user!.id, method: parsed.method, currency: parsed.currency, bankDetailType: parsed.bankDetailType, details: parsed.details })
          .returning();

    res.json(saved);
  } catch (err) {
    logger.error({ err }, "Failed to save payout method");
    res.status(500).json({ error: "Failed to save payout method" });
  }
});

// ── Admin: view an artist's payout method (needed to actually send the payout) ──
router.get("/admin/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params["userId"] as string);
    const [row] = await db.select().from(payoutMethodsTable).where(eq(payoutMethodsTable.userId, userId)).limit(1);
    res.json(row ?? null);
  } catch (err) {
    logger.error({ err }, "Failed to fetch payout method for admin");
    res.status(500).json({ error: "Failed to fetch payout method" });
  }
});

export const payoutMethodsRouter = router;
