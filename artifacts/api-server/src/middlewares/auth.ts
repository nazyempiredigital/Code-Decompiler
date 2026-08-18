import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
export const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string; name: string };
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.split(" ")[1];
  let payload: AuthRequest["user"];
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthRequest["user"];
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  // Re-check block status on every request so suspensions take effect immediately
  db.select({ isBlocked: usersTable.isBlocked, blockedReason: usersTable.blockedReason })
    .from(usersTable)
    .where(eq(usersTable.id, payload!.id))
    .limit(1)
    .then(([user]) => {
      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      if (user.isBlocked) {
        res.status(403).json({ error: "Your account has been suspended. Please contact support.", blocked: true });
        return;
      }
      req.user = payload;
      next();
    })
    .catch(() => {
      // DB failure — fail closed: deny access rather than risk letting a blocked user through
      res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
    });
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, () => {
    if ((req as AuthRequest).user?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

export function requireArtist(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, () => {
    const role = (req as AuthRequest).user?.role;
    if (role !== "verified_artist" && role !== "admin") {
      res.status(403).json({ error: "Verified artist access required" });
      return;
    }
    next();
  });
}

export function requireModerator(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, () => {
    const role = (req as AuthRequest).user?.role;
    if (role !== "moderator" && role !== "admin") {
      res.status(403).json({ error: "Moderator access required" });
      return;
    }
    next();
  });
}
