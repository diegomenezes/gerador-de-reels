import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "gr_session";
const SESSION_TTL = "7d";

function getSecret() {
  const secret = process.env.APP_PASSWORD;
  if (!secret) {
    throw new Error("APP_PASSWORD não configurada");
  }
  return new TextEncoder().encode(`gerador-reels:${secret}`);
}

export async function createSession() {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return password === expected;
}

export { COOKIE_NAME };
