import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const payload = await req.json();
  const {
    eventId = `evt_${Date.now()}`,
    senderWallet,
    recipientWallet,
    amountMs,
    sourceCoinId,
  } = payload;

  if (adminDb) {
    const replayDoc = adminDb.collection("offline_events").doc(eventId);
    const replaySnap = await replayDoc.get();
    if (replaySnap.exists) {
      return NextResponse.json({ ok: true, replayed: true, transfer: replaySnap.data() });
    }

    if (sourceCoinId && senderWallet && recipientWallet && Number(amountMs) > 0) {
      await adminDb.runTransaction(async (tx) => {
        const coinRef = adminDb.collection("coins").doc(sourceCoinId);
        const coinSnap = await tx.get(coinRef);
        if (!coinSnap.exists) throw new Error("Source coin not found");
        const coin = coinSnap.data() as { amountMs: number; ownerWallet: string; status: string };
        if (coin.ownerWallet !== senderWallet) throw new Error("Sender does not own coin");
        if (coin.status !== "active") throw new Error("Coin not active");
        if (coin.amountMs < Number(amountMs)) throw new Error("Insufficient coin amount");

        tx.update(coinRef, { amountMs: coin.amountMs - Number(amountMs) });
        const childRef = adminDb.collection("coins").doc();
        tx.set(childRef, {
          ...coin,
          id: childRef.id,
          amountMs: Number(amountMs),
          ownerWallet: recipientWallet,
          parentCoinId: sourceCoinId,
          status: "pending_review",
          bornAt: Date.now(),
        });
        const transferRef = adminDb.collection("coin_transfers").doc();
        tx.set(transferRef, {
          id: transferRef.id,
          senderWallet,
          recipientWallet,
          amountMs: Number(amountMs),
          sourceCoinId,
          childCoinId: childRef.id,
          status: "pending",
          createdAt: Date.now(),
        });
      });
    }

    await replayDoc.set({ type: "coin_transfer", payload, createdAt: Date.now() });
  }
  return NextResponse.json({ ok: true, transfer: payload });
}
