import { Router } from "express";
import { db } from "@workspace/db";
import { supportTicketsTable, ticketMessagesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { sendSupportTicketCreatedEmail, sendSupportTicketReplyEmail } from "../lib/email.js";

const router = Router();

router.post("/tickets", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const { subject, message, priority } = req.body as Record<string, string>;
    if (!subject || !message) {
      res.status(400).json({ error: "subject and message required" });
      return;
    }
    const [ticket] = await db
      .insert(supportTicketsTable)
      .values({
        userId: authReq.user!.id,
        subject,
        priority: (priority as "low" | "normal" | "high" | "urgent") ?? "normal",
      })
      .returning();
    await db.insert(ticketMessagesTable).values({
      ticketId: ticket.id,
      userId: authReq.user!.id,
      message,
      isStaff: false,
    });
    res.json(ticket);
    sendSupportTicketCreatedEmail(authReq.user!.name, authReq.user!.email, subject, ticket.id).catch(() => {});
  } catch (err) {
    logger.error({ err }, "support ticket create error");
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

router.get("/tickets/my", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.userId, authReq.user!.id))
      .orderBy(desc(supportTicketsTable.createdAt));
    res.json(tickets);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/tickets", requireAdmin, async (_req, res) => {
  try {
    const tickets = await db
      .select({
        id: supportTicketsTable.id,
        userId: supportTicketsTable.userId,
        subject: supportTicketsTable.subject,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
      .orderBy(desc(supportTicketsTable.createdAt));
    res.json(tickets);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/tickets/:id/messages", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const ticketId = parseInt(req.params["id"] as string);
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId)).limit(1);
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    const role = authReq.user!.role;
    if (ticket.userId !== authReq.user!.id && role !== "admin" && role !== "moderator") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const msgs = await db
      .select()
      .from(ticketMessagesTable)
      .where(eq(ticketMessagesTable.ticketId, ticketId))
      .orderBy(ticketMessagesTable.createdAt);
    res.json(msgs);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/tickets/:id/messages", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const ticketId = parseInt(req.params["id"] as string);
    const { message } = req.body as { message: string };
    if (!message?.trim()) { res.status(400).json({ error: "message required" }); return; }
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId)).limit(1);
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    const role = authReq.user!.role;
    const isStaff = role === "admin" || role === "moderator";
    if (ticket.userId !== authReq.user!.id && !isStaff) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const [msg] = await db
      .insert(ticketMessagesTable)
      .values({ ticketId, userId: authReq.user!.id, message: message.trim(), isStaff })
      .returning();
    if (isStaff && ticket.status === "open") {
      await db.update(supportTicketsTable).set({ status: "in_progress", updatedAt: new Date() }).where(eq(supportTicketsTable.id, ticketId));
    }
    res.json(msg);
    if (isStaff) {
      db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, ticket.userId)).limit(1)
        .then(([u]) => { if (u) sendSupportTicketReplyEmail(u.name, u.email, ticket.subject, ticketId, message.trim()).catch(() => {}); })
        .catch(() => {});
    }
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/tickets/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const { status } = req.body as { status: string };
    const [ticket] = await db
      .update(supportTicketsTable)
      .set({ status: status as "open" | "in_progress" | "resolved" | "closed", updatedAt: new Date() })
      .where(eq(supportTicketsTable.id, id))
      .returning();
    res.json(ticket);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

export const supportRouter = router;
