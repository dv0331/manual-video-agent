import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "mtav_session";

function expectedToken() {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return null;
  return btoa(`${user}:${password}`);
}

function credentialsMatch(header: string | null, token: string) {
  if (!header?.startsWith("Basic ")) return false;
  return header.slice(6) === token;
}

export function middleware(request: NextRequest) {
  const token = expectedToken();
  if (!token) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie === token) {
    return NextResponse.next();
  }

  if (credentialsMatch(request.headers.get("authorization"), token)) {
    const response = NextResponse.next();
    response.cookies.set({
      name: COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
    });
    return response;
  }

  return new NextResponse("Sign in required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Manuals to Assembly Video"',
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
