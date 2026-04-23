import { doc, getDoc, setDoc } from "firebase/firestore";
import type {
  Coin,
  CoinTransfer,
  Job,
  JobPhoto,
  MarketplaceListing,
  Message,
  UserProfile,
} from "@/lib/models";
import { firebaseAuth, firestore } from "@/lib/firebase/client";
import type { Store } from "@/lib/storage";

const COLLECTION = "userStores";

function deepStripUndefined<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((x) => deepStripUndefined(x)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = deepStripUndefined(v);
  }
  return out as T;
}

export type UserCloudSlice = {
  updatedAt: number;
  jobs: Job[];
  coins: Coin[];
  photos: JobPhoto[];
  transfers: CoinTransfer[];
  messages: Message[];
  listings: MarketplaceListing[];
};

function findSyncedUser(store: Store, firebaseUid: string): UserProfile | undefined {
  return store.users.find((u) => u.firebaseUid === firebaseUid || u.id === firebaseUid);
}

/** Shrink photos for Firestore 1 MiB doc limit: prefer storage refs over embedded data URLs. */
function photoForCloud(p: JobPhoto): JobPhoto {
  if (p.storagePath || p.storageUrl) {
    return { ...p, dataUrl: "" };
  }
  const cap = 8192;
  const d = p.dataUrl ?? "";
  return { ...p, dataUrl: d.length > cap ? `${d.slice(0, cap)}…` : d };
}

function mergeById<T extends { id: string }>(local: T[], remote: T[], prefer: (a: T, b: T) => T): T[] {
  const map = new Map<string, T>();
  for (const x of local) map.set(x.id, x);
  for (const r of remote) {
    const prev = map.get(r.id);
    map.set(r.id, prev ? prefer(prev, r) : r);
  }
  return [...map.values()];
}

function preferCoin(a: Coin, b: Coin): Coin {
  if (a.bornAt !== b.bornAt) return a.bornAt >= b.bornAt ? a : b;
  if ((a.amountMs ?? 0) !== (b.amountMs ?? 0)) return a.amountMs >= b.amountMs ? a : b;
  return b;
}

function preferJob(a: Job, b: Job): Job {
  const ta = a.endedAt ?? a.startedAt;
  const tb = b.endedAt ?? b.startedAt;
  return ta >= tb ? a : b;
}

function preferPhoto(a: JobPhoto, b: JobPhoto): JobPhoto {
  const la = (a.dataUrl ?? "").length;
  const lb = (b.dataUrl ?? "").length;
  if (lb !== la) return lb > la ? b : a;
  return a.timestamp >= b.timestamp ? a : b;
}

function preferTransfer(a: CoinTransfer, b: CoinTransfer): CoinTransfer {
  return a.createdAt >= b.createdAt ? a : b;
}

function preferMessage(a: Message, b: Message): Message {
  return a.createdAt >= b.createdAt ? a : b;
}

function preferListing(a: MarketplaceListing, b: MarketplaceListing): MarketplaceListing {
  return a.createdAt >= b.createdAt ? a : b;
}

export function buildUserCloudSlice(store: Store, firebaseUid: string): UserCloudSlice | null {
  const me = findSyncedUser(store, firebaseUid);
  if (!me) return null;
  const userId = me.id;
  const wallet = me.walletAddress;

  const jobs = store.jobs.filter((j) => j.userId === userId);
  const jobIds = new Set(jobs.map((j) => j.id));
  const photos = store.photos.filter((p) => p.userId === userId || jobIds.has(p.jobId));
  const coins = store.coins.filter((c) => c.ownerId === userId);
  const transfers = store.transfers.filter((t) => t.senderId === userId);
  const messages = store.messages.filter((m) => m.fromWallet === wallet || m.toWallet === wallet);
  const listings = store.listings.filter((l) => l.sellerWallet === wallet);

  return {
    updatedAt: Date.now(),
    jobs,
    coins,
    photos: photos.map(photoForCloud),
    transfers,
    messages,
    listings,
  };
}

function parseRemote(data: Record<string, unknown>): Partial<UserCloudSlice> | null {
  const pickArr = <T>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v as T[]) : undefined);
  return {
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Number(data.updatedAt) || 0,
    jobs: pickArr<Job>(data.jobs),
    coins: pickArr<Coin>(data.coins),
    photos: pickArr<JobPhoto>(data.photos),
    transfers: pickArr<CoinTransfer>(data.transfers),
    messages: pickArr<Message>(data.messages),
    listings: pickArr<MarketplaceListing>(data.listings),
  };
}

export function mergeCloudSliceIntoStore(store: Store, firebaseUid: string, remote: Partial<UserCloudSlice>): Store {
  const me = findSyncedUser(store, firebaseUid);
  if (!me) return store;
  const userId = me.id;
  const wallet = me.walletAddress;

  const rJobs = remote.jobs ?? [];
  const rCoins = remote.coins ?? [];
  const rPhotos = remote.photos ?? [];
  const rTransfers = remote.transfers ?? [];
  const rMessages = remote.messages ?? [];
  const rListings = remote.listings ?? [];

  const localJobs = store.jobs.filter((j) => j.userId === userId);
  const otherJobs = store.jobs.filter((j) => j.userId !== userId);
  const mergedUserJobs = mergeById(localJobs, rJobs, preferJob);

  const localCoins = store.coins.filter((c) => c.ownerId === userId);
  const otherCoins = store.coins.filter((c) => c.ownerId !== userId);
  const mergedUserCoins = mergeById(localCoins, rCoins, preferCoin);

  const userJobIdSet = new Set<string>([
    ...store.jobs.filter((j) => j.userId === userId).map((j) => j.id),
    ...rJobs.map((j) => j.id),
  ]);
  const localPhotos = store.photos.filter((p) => p.userId === userId || userJobIdSet.has(p.jobId));
  const otherPhotos = store.photos.filter((p) => !(p.userId === userId || userJobIdSet.has(p.jobId)));
  const mergedPhotos = mergeById(localPhotos, rPhotos, preferPhoto);

  const localTransfers = store.transfers.filter((t) => t.senderId === userId);
  const otherTransfers = store.transfers.filter((t) => t.senderId !== userId);
  const mergedTransfers = mergeById(localTransfers, rTransfers, preferTransfer);

  const localMessages = store.messages.filter((m) => m.fromWallet === wallet || m.toWallet === wallet);
  const otherMessages = store.messages.filter((m) => !(m.fromWallet === wallet || m.toWallet === wallet));
  const mergedMessages = mergeById(localMessages, rMessages, preferMessage);

  const localListings = store.listings.filter((l) => l.sellerWallet === wallet);
  const otherListings = store.listings.filter((l) => l.sellerWallet !== wallet);
  const mergedListings = mergeById(localListings, rListings, preferListing);

  return {
    ...store,
    jobs: [...otherJobs, ...mergedUserJobs],
    coins: [...otherCoins, ...mergedUserCoins],
    photos: [...otherPhotos, ...mergedPhotos],
    transfers: [...otherTransfers, ...mergedTransfers],
    messages: [...otherMessages, ...mergedMessages],
    listings: [...otherListings, ...mergedListings],
  };
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushSerialized = "";

export function scheduleCloudPush(store: Store, firebaseUid: string): void {
  if (typeof window === "undefined" || !navigator.onLine) return;
  if (!firebaseUid || firebaseAuth.currentUser?.uid !== firebaseUid) return;

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushUserCloudSliceNow(store, firebaseUid);
  }, 1200);
}

async function pushUserCloudSliceNow(store: Store, firebaseUid: string): Promise<void> {
  if (!navigator.onLine) return;
  if (firebaseAuth.currentUser?.uid !== firebaseUid) return;

  const slice = buildUserCloudSlice(store, firebaseUid);
  if (!slice) return;

  const serialized = JSON.stringify(slice);
  if (serialized === lastPushSerialized) return;
  lastPushSerialized = serialized;

  try {
    const payload = deepStripUndefined(slice) as unknown as Record<string, unknown>;
    await setDoc(doc(firestore, COLLECTION, firebaseUid), payload, { merge: true });
  } catch {
    lastPushSerialized = "";
  }
}

export async function pullAndMergeCloudStore(firebaseUid: string): Promise<Store | null> {
  if (typeof window === "undefined" || !navigator.onLine) return null;
  if (!firebaseUid || firebaseAuth.currentUser?.uid !== firebaseUid) return null;

  const snap = await getDoc(doc(firestore, COLLECTION, firebaseUid));
  if (!snap.exists()) return null;

  const raw = snap.data() as Record<string, unknown>;
  const remote = parseRemote(raw);
  if (!remote) return null;

  const { loadStore, saveStore } = await import("@/lib/storage");
  const store = loadStore();
  const merged = mergeCloudSliceIntoStore(store, firebaseUid, remote);
  saveStore(merged);
  return merged;
}
