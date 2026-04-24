import type { Coin, UserProfile } from "@/lib/models";

/** True if this coin is held by the user (by id or by wallet address on the coin). */
export function coinHeldByUser(coin: Coin, user: UserProfile): boolean {
  const w = user.walletAddress.toLowerCase();
  return coin.ownerId === user.id || (coin.ownerWallet?.toLowerCase() ?? "") === w;
}

export function activeCoinsHeldByUser(coins: Coin[], user: UserProfile): Coin[] {
  return coins.filter((c) => c.status === "active" && coinHeldByUser(c, user));
}
