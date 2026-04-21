"use client";

import { openDB } from "idb";
import type { OfflineEvent } from "../models";

const DB_NAME = "hourtrade-offline";
const STORE = "events";

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
}

export async function enqueueOfflineEvent(event: OfflineEvent) {
  const database = await db();
  await database.put(STORE, event);
}

export async function dequeueAllEvents() {
  const database = await db();
  const all = await database.getAll(STORE);
  await database.clear(STORE);
  return all as OfflineEvent[];
}
