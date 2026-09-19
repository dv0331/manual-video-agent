import { NextResponse } from "next/server";
import { listSamples } from "@/lib/sample-manual/catalog";

export async function GET() {
  return NextResponse.json(listSamples());
}
