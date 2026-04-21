import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const payload = await req.json();
  if (adminDb && payload.transferId) {
    await adminDb.collection("coin_transfers").doc(payload.transferId).set(
      {
        ...payload,
        reviewedAt: Date.now(),
      },
      { merge: true },
    );
  }
  return NextResponse.json({ ok: true, review: payload });
}
