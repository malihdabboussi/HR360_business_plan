// Admin session: an HMAC-signed expiry timestamp in an httpOnly cookie.
// Uses Web Crypto so the same code runs in the Edge middleware and in Node route handlers.

export const SESSION_COOKIE = "hr360_admin";
const SESSION_HOURS = 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set to a random string of at least 16 characters");
  return s;
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionValue(): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const sig = await hmac(`admin:${exp}`);
  return { value: `${exp}.${sig}`, maxAge: SESSION_HOURS * 3600 };
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const expected = await hmac(`admin:${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return false;
  if (expected.length !== candidate.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  return diff === 0;
}
