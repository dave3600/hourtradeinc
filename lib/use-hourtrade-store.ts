"use client";

import { useSyncExternalStore } from "react";
import { loadStore, subscribeHourtradeStore, type Store } from "@/lib/storage";

/** Re-renders when `saveStore` runs (local edits or cross-device Firestore pull). */
export function useHourtradeStore(): Store {
  return useSyncExternalStore(subscribeHourtradeStore, loadStore, loadStore);
}
