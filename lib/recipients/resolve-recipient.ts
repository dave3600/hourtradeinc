import type { Store } from "@/lib/storage";

export type ResolvedRecipient = {
  walletAddress: string;
  userId: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function normalizeWallet(input: string): string | null {
  const s = input.trim().toLowerCase();
  return WALLET_RE.test(s) ? s : null;
}

/** Resolve recipient from local store only (sync). */
export function resolveRecipientLocal(raw: string, store: Store, senderWallet: string): ResolvedRecipient | null {
  const normalized = raw.trim();
  if (!normalized) return null;

  const sw = senderWallet.toLowerCase();
  const byUserId = store.users.find((u) => u.id === normalized);
  if (byUserId) {
    const w = byUserId.walletAddress.toLowerCase();
    if (w === sw) return null;
    return { walletAddress: w, userId: byUserId.id };
  }

  const byEmail = store.users.find((u) => (u.email ?? "").toLowerCase() === normalized.toLowerCase());
  if (byEmail) {
    const w = byEmail.walletAddress.toLowerCase();
    if (w === sw) return null;
    return { walletAddress: w, userId: byEmail.id };
  }

  const byUsername = store.users.find((u) => u.username.toLowerCase() === normalized.toLowerCase());
  if (byUsername) {
    const w = byUsername.walletAddress.toLowerCase();
    if (w === sw) return null;
    return { walletAddress: w, userId: byUsername.id };
  }

  const byWallet = store.users.find((u) => u.walletAddress.toLowerCase() === normalized.toLowerCase());
  if (byWallet) {
    const w = byWallet.walletAddress.toLowerCase();
    if (w === sw) return null;
    return { walletAddress: w, userId: byWallet.id };
  }

  const asWallet = normalizeWallet(normalized);
  if (asWallet) {
    if (asWallet === sw) return null;
    return { walletAddress: asWallet, userId: null };
  }

  return null;
}

/** Firestore-backed lookup (requires signed-in user + Admin on server). */
export async function resolveRecipientRemote(
  raw: string,
  senderWallet: string,
  idToken: string | null,
): Promise<ResolvedRecipient | null> {
  if (!idToken) return null;
  const q = raw.trim();
  if (q.length < 2) return null;

  const res = await fetch(`/api/users/lookup?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { found?: boolean; walletAddress?: string; userId?: string };
  if (!data.found || !data.walletAddress) return null;
  const w = data.walletAddress.toLowerCase();
  if (w === senderWallet.toLowerCase()) return null;
  return { walletAddress: w, userId: data.userId ?? null };
}

/** Try local store first, then server lookup for user id/email/username/unknown wallet. */
export async function resolveRecipient(
  raw: string,
  store: Store,
  senderWallet: string,
  idToken: string | null,
): Promise<ResolvedRecipient | null> {
  const local = resolveRecipientLocal(raw, store, senderWallet);
  if (local) return local;
  return resolveRecipientRemote(raw, senderWallet, idToken);
}
