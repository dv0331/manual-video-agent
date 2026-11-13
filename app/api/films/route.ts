import { NextResponse } from "next/server";
import { listFilms } from "@/lib/agent/library";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listFilms());
}
