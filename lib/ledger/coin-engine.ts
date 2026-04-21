import { createId } from "../storage";
import type { Coin, CoinTransfer } from "../models";

export function mintCoinFromJob(input: {
  ownerId: string;
  ownerWallet: string;
  amountMs: number;
  sourceJobId: string;
  photoIds: string[];
  offlineOrigin?: boolean;
}): Coin {
  return {
    id: createId("coin"),
    ownerId: input.ownerId,
    ownerWallet: input.ownerWallet,
    amountMs: input.amountMs,
    bornAt: Date.now(),
    sourceJobId: input.sourceJobId,
    photoIds: input.photoIds,
    status: "active",
    offlineOrigin: input.offlineOrigin,
  };
}

export function splitCoin(
  parent: Coin,
  recipientWallet: string,
  amountMs: number,
  senderId: string,
): { parentNext: Coin; child: Coin; transfer: CoinTransfer } {
  if (amountMs <= 0 || amountMs > parent.amountMs) {
    throw new Error("Invalid transfer amount");
  }
  const child: Coin = {
    ...parent,
    id: createId("coin"),
    ownerId: senderId,
    ownerWallet: recipientWallet,
    amountMs,
    parentCoinId: parent.id,
    status: "pending_review",
  };
  const parentNext: Coin = {
    ...parent,
    amountMs: parent.amountMs - amountMs,
  };
  const transfer: CoinTransfer = {
    id: createId("tx"),
    senderId,
    recipientWallet,
    sourceCoinIds: [parent.id],
    childCoinId: child.id,
    amountMs,
    status: "pending",
    createdAt: Date.now(),
  };
  return { parentNext, child, transfer };
}
