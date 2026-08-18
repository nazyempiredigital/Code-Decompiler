import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { JWT_SECRET, requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { sendWelcomeEmail } from "../lib/email.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, company, country } = req.body as Record<string, string>;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email and password are required" });
      return;
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ name, email, passwordHash, phone, company, country })
      .returning();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    sendWelcomeEmail(user.name, user.email).catch(() => {});
  } catch {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as Record<string, string>;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    if (user.isBlocked) {
      res.status(403).json({ error: "Your account has been suspended. Please contact support.", blocked: true });
      return;
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const [user] = await db
      .select({
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
      })
      .from(usersTable)
      .where(eq(usersTable.id, authReq.user!.id))
      .limit(1);
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/profile", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const { name, phone, company, country } = req.body as Record<string, string>;
    await db
      .update(usersTable)
      .set({ name, phone, company, country, updatedAt: new Date() })
      .where(eq(usersTable.id, authReq.user!.id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Profile update failed" });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  try {
    const { currentPassword, newPassword } = req.body as Record<string, string>;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, authReq.user!.id));
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password incorrect" });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, authReq.user!.id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Password change failed" });
  }
});

export const authRouter = router;
