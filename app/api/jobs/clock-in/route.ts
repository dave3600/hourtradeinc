import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const { userId, wallet, locationStart = "unknown" } = await req.json();
  const startedAt = Date.now();
  const job = {
    id: `job_${startedAt}`,
    userId,
    wallet,
    startedAt,
    elapsedMs: 0,
    active: true,
    photoIds: [],
    locationStart,
  };
  if (adminDb) {
    await adminDb.collection("jobs").doc(job.id).set(job);
  }
  return NextResponse.json({ ok: true, job });
}
