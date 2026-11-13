import { NextResponse } from "next/server";
import { requestIsHttps } from "@/lib/https";
import { SESSION_COOKIE, sameSecret, sessionToken, siteCredentials } from "@/lib/session";

export async function POST(request: Request) {
  const credentials = siteCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: true });
  }

  const body = (await request.json().catch(() => ({}))) as {
    user?: string;
    password?: string;
  };
  const userMatches = sameSecret(body.user, credentials.user);
  const passwordMatches = sameSecret(body.password, credentials.password);
  if (!userMatches || !passwordMatches) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await sessionToken(credentials.user, credentials.password),
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsHttps(request),
    path: "/",
  });
  return response;
}
