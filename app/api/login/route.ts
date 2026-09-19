import { NextResponse } from "next/server";

const COOKIE = "mtav_session";

export async function POST(request: Request) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    return NextResponse.json({ ok: true });
  }

  const body = (await request.json().catch(() => ({}))) as {
    user?: string;
    password?: string;
  };
  if (body.user !== expectedUser || body.password !== expectedPassword) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }

  const token = btoa(`${expectedUser}:${expectedPassword}`);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
  });
  return response;
}
