import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const a = Buffer.from(key, "hex"),
    b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function secretHash(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export async function sessionUser() {
  const token = (await cookies()).get("aquatrace_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: secretHash(token) },
    include: { user: true },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function createSession(userId: string, remember: boolean) {
  const token = randomBytes(32).toString("base64url");
  const seconds = remember ? 30 * 86400 : 12 * 3600;
  await db.session.create({
    data: {
      id: secretHash(token),
      userId,
      expiresAt: new Date(Date.now() + seconds * 1000),
    },
  });
  (await cookies()).set("aquatrace_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://") ?? false,
    path: "/",
    maxAge: seconds,
  });
}
