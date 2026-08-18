import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  projectsTable,
  notificationsTable,
  affiliateApplicationsTable,
  affiliateCommissionsTable,
  affiliateWithdrawalsTable,
} from "@workspace/db";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import {
  sendAffiliateApplicationReceivedEmail,
  sendAffiliateApplicationDecisionEmail,
  sendAffiliateWithdrawalRequestedEmail,
  sendAffiliateWithdrawalPaidEmail,
} from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router = Router();

export const AFFILIATE_COMMISSION_RATE = 0.05; // 5%
export const AFFILIATE_MIN_WITHDRAWAL  = 10_000; // ₦10,000

// ── Helpers ────────────────────────────────────────────────────────────────

/** Unique 8-char code: "NZ" + 6 alphanumeric characters */
async function generateReferralCode(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "NZ";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  return "NZ" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Available (un-withdrawn) affiliate balance for a user */
export async function affiliateAvailableBalance(userId: number): Promise<number> {
  const [totalRow] = await db
    .select({ total: sql<string>`coalesce(sum(commission), 0)` })
    .from(affiliateCommissionsTable)
    .where(eq(affiliateCommissionsTable.affiliateUserId, userId));

  const [requestedRow] = await db
    .select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(affiliateWithdrawalsTable)
    .where(
      and(
        eq(affiliateWithdrawalsTable.userId, userId),
        inArray(affiliateWithdrawalsTable.status, ["pending", "approved", "paid"]),
      ),
    );

  return Math.max(0, parseFloat(totalRow?.total ?? "0") - parseFloat(requestedRow?.total ?? "0"));
}

/**
 * Called after a project payment is confirmed (from payments.ts).
 * Prevents double-crediting via the unique project_id constraint.
 */
export async function maybeCreditAffiliateCommission(
  projectId: number,
  projectRef: string,
  affiliateRef: string | null | undefined,
  totalAmount: number,
): Promise<void> {
  if (!affiliateRef) return;

  const [existing] = await db
    .select({ id: affiliateCommissionsTable.id })
    .from(affiliateCommissionsTable)
    .where(eq(affiliateCommissionsTable.projectId, projectId))
    .limit(1);
  if (existing) return; // already credited

  const [affiliate] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.referralCode, affiliateRef),
        eq(usersTable.isAffiliate, true),
      ),
    )
    .limit(1);
  if (!affiliate) return;

  const commission = Math.round(totalAmount * AFFILIATE_COMMISSION_RATE * 100) / 100;

  await db.insert(affiliateCommissionsTable).values({
    affiliateUserId: affiliate.id,
    projectId,
    projectRef,
    projectAmount: String(totalAmount),
    commission: String(commission),
    status: "pending",
  });

  await db.insert(notificationsTable).values({
    userId: affiliate.id,
    title: "Affiliate Commission Earned",
    message: `₦${commission.toLocaleString("en-NG", { minimumFractionDigits: 2 })} commission credited from project ${projectRef}!`,
  });
}

// ── Format helpers ─────────────────────────────────────────────────────────

function fmtApp(app: Record<string, unknown>, userName?: string, userEmail?: string) {
  return {
    id:          app["id"],
    userId:      app["userId"] ?? app["user_id"],
    reason:      app["reason"],
    platform:    app["platform"] ?? null,
    status:      app["status"],
    adminNotes:  app["adminNotes"] ?? app["admin_notes"] ?? null,
    userName:    userName ?? null,
    userEmail:   userEmail ?? null,
    createdAt:   app["createdAt"] ?? app["created_at"],
    updatedAt:   app["updatedAt"] ?? app["updated_at"] ?? null,
  };
}

function fmtWithdrawal(w: Record<string, unknown>, userName?: string, userEmail?: string) {
  return {
    id:          w["id"],
    userId:      w["userId"] ?? w["user_id"],
    amount:      parseFloat(String(w["amount"])),
    notes:       w["notes"] ?? null,
    status:      w["status"],
    adminNotes:  w["adminNotes"] ?? w["admin_notes"] ?? null,
    paidAt:      w["paidAt"] ?? w["paid_at"] ?? null,
    createdAt:   w["createdAt"] ?? w["created_at"],
    updatedAt:   w["updatedAt"] ?? w["updated_at"] ?? null,
    userName:    userName ?? null,
    userEmail:   userEmail ?? null,
  };
}

function fmtCommission(c: Record<string, unknown>, affiliateName?: string, affiliateEmail?: string) {
  return {
    id:              c["id"],
    affiliateUserId: c["affiliateUserId"] ?? c["affiliate_user_id"],
    projectId:       c["projectId"] ?? c["project_id"],
    projectRef:      c["projectRef"] ?? c["project_ref"],
    projectAmount:   parseFloat(String(c["projectAmount"] ?? c["project_amount"])),
    commission:      parseFloat(String(c["commission"])),
    status:          c["status"],
    createdAt:       c["createdAt"] ?? c["created_at"],
    affiliateName:   affiliateName ?? null,
    affiliateEmail:  affiliateEmail ?? null,
  };
}

// ── Client / affiliate routes ──────────────────────────────────────────────

/** GET /affiliates/my-application */
router.get("/my-application", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [app] = await db
      .select()
      .from(affiliateApplicationsTable)
      .where(eq(affiliateApplicationsTable.userId, authReq.user!.id))
      .limit(1);

    const [userRow] = await db
      .select({ isAffiliate: usersTable.isAffiliate, referralCode: usersTable.referralCode })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);

    res.json({
      application:  app ? fmtApp(app as unknown as Record<string, unknown>) : null,
      isAffiliate:  userRow?.isAffiliate ?? false,
      referralCode: userRow?.referralCode ?? null,
    });
  } catch (err) {
    logger.error({ err }, "affiliates my-application error");
    res.status(500).json({ error: "Failed to fetch application" });
  }
});

/** POST /affiliates/apply */
router.post("/apply", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [userRow] = await db
      .select({ isAffiliate: usersTable.isAffiliate })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);

    if (userRow?.isAffiliate) {
      res.status(409).json({ error: "You are already an approved affiliate." });
      return;
    }

    const [existing] = await db
      .select({ id: affiliateApplicationsTable.id })
      .from(affiliateApplicationsTable)
      .where(eq(affiliateApplicationsTable.userId, authReq.user!.id))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "You already have an affiliate application on record." });
      return;
    }

    const { reason, platform } = req.body as { reason: string; platform?: string };
    if (!reason?.trim()) {
      res.status(400).json({ error: "Please tell us why you want to become an affiliate." });
      return;
    }

    const [app] = await db
      .insert(affiliateApplicationsTable)
      .values({
        userId:   authReq.user!.id,
        reason:   reason.trim(),
        platform: platform?.trim() || null,
        status:   "pending",
      })
      .returning();

    await db.insert(notificationsTable).values({
      userId:  authReq.user!.id,
      title:   "Affiliate Application Received",
      message: "Your affiliate application has been submitted and is under review. We will notify you once it is processed.",
    });

    sendAffiliateApplicationReceivedEmail(authReq.user!.name, authReq.user!.email).catch(() => {});

    res.json(fmtApp(app as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error({ err }, "affiliates apply error");
    res.status(500).json({ error: "Failed to submit application" });
  }
});

/** GET /affiliates/referral-link */
router.get("/referral-link", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [userRow] = await db
      .select({ isAffiliate: usersTable.isAffiliate, referralCode: usersTable.referralCode })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);

    if (!userRow?.isAffiliate) {
      res.status(403).json({ error: "Affiliate access required" });
      return;
    }

    const appUrl = process.env.APP_URL ?? "https://nazyempire.com";
    const code   = userRow.referralCode;
    res.json({
      referralCode: code,
      referralLink: code ? `${appUrl}?ref=${code}` : null,
    });
  } catch (err) {
    logger.error({ err }, "affiliates referral-link error");
    res.status(500).json({ error: "Failed to fetch referral link" });
  }
});

/** GET /affiliates/earnings */
router.get("/earnings", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [userRow] = await db
      .select({ isAffiliate: usersTable.isAffiliate })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);
    if (!userRow?.isAffiliate) {
      res.status(403).json({ error: "Affiliate access required" });
      return;
    }

    const commissions = await db
      .select()
      .from(affiliateCommissionsTable)
      .where(eq(affiliateCommissionsTable.affiliateUserId, authReq.user!.id))
      .orderBy(desc(affiliateCommissionsTable.createdAt));

    const [totalRow] = await db
      .select({ total: sql<string>`coalesce(sum(commission), 0)` })
      .from(affiliateCommissionsTable)
      .where(eq(affiliateCommissionsTable.affiliateUserId, authReq.user!.id));

    const [requestedRow] = await db
      .select({ total: sql<string>`coalesce(sum(amount), 0)` })
      .from(affiliateWithdrawalsTable)
      .where(
        and(
          eq(affiliateWithdrawalsTable.userId, authReq.user!.id),
          inArray(affiliateWithdrawalsTable.status, ["pending", "approved", "paid"]),
        ),
      );

    const totalCommissions  = parseFloat(totalRow?.total ?? "0");
    const alreadyRequested  = parseFloat(requestedRow?.total ?? "0");
    const available         = Math.max(0, totalCommissions - alreadyRequested);

    res.json({
      totalCommissions,
      alreadyRequested,
      availableBalance:  available,
      canWithdraw:       available >= AFFILIATE_MIN_WITHDRAWAL,
      minWithdrawal:     AFFILIATE_MIN_WITHDRAWAL,
      shortfall:         Math.max(0, AFFILIATE_MIN_WITHDRAWAL - available),
      commissionRate:    AFFILIATE_COMMISSION_RATE * 100,
      referredProjects:  commissions.length,
      commissions:       commissions.map((c) => fmtCommission(c as unknown as Record<string, unknown>)),
    });
  } catch (err) {
    logger.error({ err }, "affiliates earnings error");
    res.status(500).json({ error: "Failed to fetch earnings" });
  }
});

/** GET /affiliates/withdrawals */
router.get("/withdrawals", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [userRow] = await db
      .select({ isAffiliate: usersTable.isAffiliate })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);
    if (!userRow?.isAffiliate) {
      res.status(403).json({ error: "Affiliate access required" });
      return;
    }

    const rows = await db
      .select()
      .from(affiliateWithdrawalsTable)
      .where(eq(affiliateWithdrawalsTable.userId, authReq.user!.id))
      .orderBy(desc(affiliateWithdrawalsTable.createdAt));

    res.json(rows.map((r) => fmtWithdrawal(r as unknown as Record<string, unknown>)));
  } catch (err) {
    logger.error({ err }, "affiliates withdrawals error");
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

/** POST /affiliates/withdraw */
router.post("/withdraw", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [userRow] = await db
      .select({ isAffiliate: usersTable.isAffiliate, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);
    if (!userRow?.isAffiliate) {
      res.status(403).json({ error: "Affiliate access required" });
      return;
    }

    const { amount, notes } = req.body as { amount: number; notes?: string };
    if (!amount || amount <= 0) {
      res.status(400).json({ error: "Amount must be positive." });
      return;
    }
    if (amount < AFFILIATE_MIN_WITHDRAWAL) {
      res.status(400).json({ error: `Minimum withdrawal is ₦${AFFILIATE_MIN_WITHDRAWAL.toLocaleString()}.` });
      return;
    }

    const available = await affiliateAvailableBalance(authReq.user!.id);
    if (amount > available) {
      res.status(400).json({ error: `Amount exceeds your available balance of ₦${available.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.` });
      return;
    }

    const [pending] = await db
      .select({ id: affiliateWithdrawalsTable.id })
      .from(affiliateWithdrawalsTable)
      .where(
        and(
          eq(affiliateWithdrawalsTable.userId, authReq.user!.id),
          eq(affiliateWithdrawalsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) {
      res.status(409).json({ error: "You already have a pending withdrawal request." });
      return;
    }

    const [row] = await db
      .insert(affiliateWithdrawalsTable)
      .values({
        userId: authReq.user!.id,
        amount: String(amount),
        notes:  notes?.trim() || null,
        status: "pending",
      })
      .returning();

    await db.insert(notificationsTable).values({
      userId:  authReq.user!.id,
      title:   "Withdrawal Request Received",
      message: `Your affiliate withdrawal request for ₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} has been received and is being processed.`,
    });

    sendAffiliateWithdrawalRequestedEmail(
      userRow.name,
      userRow.email,
      amount,
    ).catch(() => {});

    res.json(fmtWithdrawal(row as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error({ err }, "affiliates withdraw error");
    res.status(500).json({ error: "Failed to submit withdrawal" });
  }
});

/** GET /affiliates/referred-accounts */
router.get("/referred-accounts", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [userRow] = await db
      .select({ isAffiliate: usersTable.isAffiliate, referralCode: usersTable.referralCode })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);
    if (!userRow?.isAffiliate) {
      res.status(403).json({ error: "Affiliate access required" });
      return;
    }
    if (!userRow.referralCode) { res.json([]); return; }

    const rows = await db
      .select({
        userId:             usersTable.id,
        name:               usersTable.name,
        email:              usersTable.email,
        joinedAt:           usersTable.createdAt,
        totalProjects:      sql<number>`count(${projectsTable.id})`,
      })
      .from(projectsTable)
      .innerJoin(usersTable, eq(projectsTable.userId, usersTable.id))
      .where(eq(projectsTable.affiliateRef, userRow.referralCode))
      .groupBy(usersTable.id, usersTable.name, usersTable.email, usersTable.createdAt)
      .orderBy(desc(sql`count(${projectsTable.id})`));

    res.json(rows.map((r) => ({
      userId:        r.userId,
      name:          r.name,
      email:         r.email,
      joinedAt:      r.joinedAt,
      totalProjects: Number(r.totalProjects),
    })));
  } catch (err) {
    logger.error({ err }, "affiliates referred-accounts error");
    res.status(500).json({ error: "Failed to fetch referred accounts" });
  }
});

// ── Admin routes ───────────────────────────────────────────────────────────

/** GET /affiliates/admin/applications */
router.get("/admin/applications", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        app:   affiliateApplicationsTable,
        uname: usersTable.name,
        uemail: usersTable.email,
      })
      .from(affiliateApplicationsTable)
      .leftJoin(usersTable, eq(affiliateApplicationsTable.userId, usersTable.id))
      .orderBy(affiliateApplicationsTable.createdAt);

    res.json(rows.map(({ app, uname, uemail }) =>
      fmtApp(app as unknown as Record<string, unknown>, uname ?? undefined, uemail ?? undefined),
    ));
  } catch (err) {
    logger.error({ err }, "affiliates admin applications error");
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

/** PATCH /affiliates/admin/applications/:id */
router.patch("/admin/applications/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status, adminNotes } = req.body as { status: "approved" | "rejected"; adminNotes?: string };
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be approved or rejected" });
      return;
    }

    await db
      .update(affiliateApplicationsTable)
      .set({ status, adminNotes: adminNotes ?? null, updatedAt: new Date() })
      .where(eq(affiliateApplicationsTable.id, id));

    const [app] = await db
      .select()
      .from(affiliateApplicationsTable)
      .where(eq(affiliateApplicationsTable.id, id))
      .limit(1);
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }

    // Update affiliate flag and assign referral code if approved
    if (status === "approved") {
      const [userRow] = await db
        .select({ referralCode: usersTable.referralCode })
        .from(usersTable)
        .where(eq(usersTable.id, app.userId))
        .limit(1);

      let code = userRow?.referralCode;
      if (!code) {
        code = await generateReferralCode();
        await db
          .update(usersTable)
          .set({ referralCode: code, updatedAt: new Date() })
          .where(eq(usersTable.id, app.userId));
      }
      await db
        .update(usersTable)
        .set({ isAffiliate: true, updatedAt: new Date() })
        .where(eq(usersTable.id, app.userId));
    } else {
      await db
        .update(usersTable)
        .set({ isAffiliate: false, updatedAt: new Date() })
        .where(eq(usersTable.id, app.userId));
    }

    const [owner] = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, app.userId))
      .limit(1);

    if (owner) {
      const notifMsg = status === "approved"
        ? "Congratulations! Your affiliate application has been approved. You can now find your referral link in your dashboard."
        : `Your affiliate application was not approved.${adminNotes ? ` Reason: ${adminNotes}` : ""}`;

      await db.insert(notificationsTable).values({
        userId:  app.userId,
        title:   status === "approved" ? "Affiliate Application Approved" : "Affiliate Application Update",
        message: notifMsg,
      });

      sendAffiliateApplicationDecisionEmail(
        owner.name,
        owner.email,
        status as "approved" | "rejected",
        adminNotes ?? null,
      ).catch(() => {});
    }

    res.json(fmtApp(app as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error({ err }, "affiliates admin review error");
    res.status(500).json({ error: "Failed to review application" });
  }
});

/** GET /affiliates/admin/withdrawals */
router.get("/admin/withdrawals", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        w:      affiliateWithdrawalsTable,
        uname:  usersTable.name,
        uemail: usersTable.email,
      })
      .from(affiliateWithdrawalsTable)
      .leftJoin(usersTable, eq(affiliateWithdrawalsTable.userId, usersTable.id))
      .orderBy(desc(affiliateWithdrawalsTable.createdAt));

    res.json(rows.map(({ w, uname, uemail }) =>
      fmtWithdrawal(w as unknown as Record<string, unknown>, uname ?? undefined, uemail ?? undefined),
    ));
  } catch (err) {
    logger.error({ err }, "affiliates admin withdrawals error");
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

/** PATCH /affiliates/admin/withdrawals/:id */
router.patch("/admin/withdrawals/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status, adminNotes } = req.body as {
      status: "approved" | "paid" | "rejected";
      adminNotes?: string;
    };
    if (!["approved", "paid", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be approved, paid, or rejected" });
      return;
    }

    await db
      .update(affiliateWithdrawalsTable)
      .set({
        status,
        adminNotes: adminNotes ?? null,
        paidAt:     status === "paid" ? new Date() : null,
        updatedAt:  new Date(),
      })
      .where(eq(affiliateWithdrawalsTable.id, id));

    const [req_row] = await db
      .select()
      .from(affiliateWithdrawalsTable)
      .where(eq(affiliateWithdrawalsTable.id, id))
      .limit(1);
    if (!req_row) { res.status(404).json({ error: "Withdrawal not found" }); return; }

    const [owner] = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req_row.userId))
      .limit(1);

    const amt = parseFloat(String(req_row.amount));
    const fmt = `₦${amt.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

    if (owner) {
      const notifMap: Record<string, string> = {
        approved: `Your affiliate withdrawal request for ${fmt} has been approved and will be paid shortly.`,
        paid:     `Your affiliate withdrawal of ${fmt} has been paid. Check your account!`,
        rejected: `Your affiliate withdrawal request for ${fmt} was declined.${adminNotes ? ` Reason: ${adminNotes}` : ""}`,
      };
      if (notifMap[status]) {
        await db.insert(notificationsTable).values({
          userId:  req_row.userId,
          title:   "Affiliate Withdrawal Update",
          message: notifMap[status] as string,
        });
      }
      if (status === "paid") {
        sendAffiliateWithdrawalPaidEmail(owner.name, owner.email, amt).catch(() => {});
      }
    }

    res.json(fmtWithdrawal(req_row as unknown as Record<string, unknown>));
  } catch (err) {
    logger.error({ err }, "affiliates admin withdrawal update error");
    res.status(500).json({ error: "Failed to update withdrawal" });
  }
});

/** GET /affiliates/admin/commissions */
router.get("/admin/commissions", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        c:      affiliateCommissionsTable,
        aname:  usersTable.name,
        aemail: usersTable.email,
      })
      .from(affiliateCommissionsTable)
      .leftJoin(usersTable, eq(affiliateCommissionsTable.affiliateUserId, usersTable.id))
      .orderBy(desc(affiliateCommissionsTable.createdAt));

    res.json(rows.map(({ c, aname, aemail }) =>
      fmtCommission(c as unknown as Record<string, unknown>, aname ?? undefined, aemail ?? undefined),
    ));
  } catch (err) {
    logger.error({ err }, "affiliates admin commissions error");
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

export const affiliatesRouter = router;
