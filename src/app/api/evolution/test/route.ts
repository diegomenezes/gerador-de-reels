import { NextResponse } from "next/server";
import { testEvolutionConnection } from "@/lib/evolution";

export async function POST() {
  const result = await testEvolutionConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
