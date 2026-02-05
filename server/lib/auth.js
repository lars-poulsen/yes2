import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getDb } from "../db.js";

const db = getDb();

const DEFAULT_JWT_SECRET = "dev-secret";
let jwtSecret = (process.env.JWT_SECRET ?? "").trim();
if (!jwtSecret) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "JWT_SECRET is required in production. Set JWT_SECRET to a secure value and restart."
    );
    throw new Error("Missing JWT_SECRET in production");
  } else {
    jwtSecret = DEFAULT_JWT_SECRET;
  }
}
const COOKIE_NAME = process.env.COOKIE_NAME ?? "yes_auth";
const COOKIE_SECURE =
  process.env.AUTH_COOKIE_SECURE === "true" ||
  process.env.NODE_ENV === "production";

export const authCookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  path: "/",
  maxAge: 1000 * 60 * 60 * 24 * 7,
};

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: "7d" });

export const getCurrentUser = async (req) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (!payload?.sub) {
      return null;
    }
    const user = await db.get(
      "SELECT id, email, role, created_at, blocked_at FROM users WHERE id = ?",
      payload.sub
    );
    return user ?? null;
  } catch {
    return null;
  }
};

export const requireUser = async (req, res, next) => {
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Missing or invalid authorization" });
  }
  if (user.blocked_at) {
    return res.status(403).json({ error: "Bruger er blokeret" });
  }
  req.user = user;
  req.userId = user.id;
  req.userRole = user.role;
  return next();
};

export const requireAdmin = async (req, res, next) => {
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Missing or invalid authorization" });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin adgang kræves" });
  }
  req.user = user;
  req.userId = user.id;
  req.userRole = user.role;
  return next();
};

export const getCookieName = () => COOKIE_NAME;
