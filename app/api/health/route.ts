import { NextResponse } from "next/server";

/**
 * Health check endpoint for Docker container health monitoring
 */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
