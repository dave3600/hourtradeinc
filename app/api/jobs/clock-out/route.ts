import { NextResponse } from "next/server";
import { mintCoinFromJob } from "@/lib/ledger/coin-engine";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const { userId, wallet, job } = await req.json();
  const coin = mintCoinFromJob({
    ownerId: userId,
    ownerWallet: wallet,
    amountMs: job.elapsedMs,
    sourceJobId: job.id,
    photoIds: job.photoIds,
    offlineOrigin: Boolean(job.offlineOrigin),
  });
  if (adminDb) {
    await adminDb.collection("jobs").doc(job.id).set(
      {
        ...job,
        active: false,
        endedAt: Date.now(),
        locationEnd: job.locationEnd ?? "unknown",
      },
      { merge: true },
    );
    await adminDb.collection("coins").doc(coin.id).set(coin);
  }
  return NextResponse.json({ coin });
}
