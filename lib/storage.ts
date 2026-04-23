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

type Store = {
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

export function loadStore(): Store {
  if (typeof window === "undefined") return defaultStore;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return defaultStore;
  return JSON.parse(raw) as Store;
}

export function saveStore(next: Store) {
  if (typeof window === "undefined") return;
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
