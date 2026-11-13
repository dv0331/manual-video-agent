export const SESSION_COOKIE = "mtav_session";

/** The site's sign-in, or null when none is configured and the site is open. */
export function siteCredentials() {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  return user && password ? { user, password } : null;
}

let cached: { key: string; token: string } | null = null;

/** Session cookie value: a digest of the sign-in, so the cookie never holds the password. */
export async function sessionToken(user: string, password: string) {
  const key = `mtav-session\n${user}\n${password}`;
  if (cached?.key === key) return cached.token;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const token = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  cached = { key, token };
  return token;
}

/** Compare in constant time, so response timing does not reveal how much of a guess was right. */
export function sameSecret(given: string | null | undefined, expected: string) {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
