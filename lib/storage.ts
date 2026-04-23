"use client";

import { v4 as uuidv4 } from "uuid";
import type {
  Coin,
  CoinTransfer,
  Job,
  JobPhoto,
  MarketplaceListing,
  Message,
  UserProfile,
} from "./models";

export type Store = {
  currentUserId?: string;
  users: UserProfile[];
  jobs: Job[];
  photos: JobPhoto[];
  coins: Coin[];
  transfers: CoinTransfer[];
  messages: Message[];
  listings: MarketplaceListing[];
};

const KEY = "hourtrade-store-v1";

const defaultStore: Store = {
  users: [],
  jobs: [],
  photos: [],
  coins: [],
  transfers: [],
  messages: [],
  listings: [],
};

let cachedRaw: string | null = null;
let cachedStore: Store = defaultStore;

const storeListeners = new Set<() => void>();

/** Subscribe to localStorage store writes (including cross-device pull). */
export function subscribeHourtradeStore(listener: () => void) {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function emitHourtradeStore() {
  if (typeof window === "undefined") return;
  storeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function loadStore(): Store {
  if (typeof window === "undefined") return defaultStore;
  const raw = window.localStorage.getItem(KEY);
  if (raw === cachedRaw) return cachedStore;
  cachedRaw = raw;
  if (!raw) {
    cachedStore = { ...defaultStore };
    return cachedStore;
  }
  cachedStore = JSON.parse(raw) as Store;
  return cachedStore;
}

export function saveStore(next: Store) {
  if (typeof window === "undefined") return;
  cachedRaw = null;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Fall back to a slimmed payload if storage quota is exceeded.
    const slimmed: Store = {
      ...next,
      photos: next.photos.map((photo) => ({
        ...photo,
        dataUrl: photo.dataUrl ? photo.dataUrl.slice(0, 4096) : "",
      })),
    };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(slimmed));
    } catch {
      // Ignore final failure; in-memory state may still continue for this session.
    }
  }

  const current = next.currentUserId ? next.users.find((u) => u.id === next.currentUserId) : undefined;
  const firebaseUid = current?.firebaseUid;
  if (firebaseUid) {
    void import("@/lib/firebase/cloud-store").then(({ scheduleCloudPush }) => {
      scheduleCloudPush(next, firebaseUid);
    });
  }

  emitHourtradeStore();
}

export function randomUsername() {
  const words = ["Green", "Sky", "Iron", "Nova", "River", "Seed", "Solar"];
  const animals = ["Falcon", "Otter", "Wolf", "Fox", "Whale", "Tiger"];
  return `${words[Math.floor(Math.random() * words.length)]}${animals[Math.floor(Math.random() * animals.length)]}${Math.floor(Math.random() * 1000)}`;
}

export function walletId() {
  return `0x${uuidv4().replaceAll("-", "").slice(0, 40)}`;
}

export function createId(prefix: string) {
  return `${prefix}_${uuidv4().replaceAll("-", "")}`;
}
