import { NextResponse, type NextRequest } from "next/server";
import { requestIsHttps } from "@/lib/https";
import { SESSION_COOKIE, sameSecret, sessionToken, siteCredentials } from "@/lib/session";

function wantsHtml(request: NextRequest) {
  return (request.headers.get("accept") ?? "").includes("text/html");
}

function loginUrl(request: NextRequest) {
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = next && next !== "/login" ? `?next=${encodeURIComponent(next)}` : "";
  return url;
}

export async function proxy(request: NextRequest) {
  const credentials = siteCredentials();
  if (!credentials) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/login") {
    return NextResponse.next();
  }

  const token = await sessionToken(credentials.user, credentials.password);
  if (sameSecret(request.cookies.get(SESSION_COOKIE)?.value, token)) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  const basic = btoa(`${credentials.user}:${credentials.password}`);
  if (header?.startsWith("Basic ") && sameSecret(header.slice(6), basic)) {
    const response = NextResponse.next();
    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: requestIsHttps(request),
      path: "/",
    });
    return response;
  }

  if (wantsHtml(request)) {
    return NextResponse.redirect(loginUrl(request));
  }

  return NextResponse.json(
    { error: "Sign in required" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
