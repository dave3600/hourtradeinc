"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";
import { firebaseAuth } from "@/lib/firebase/client";
import { pullAndMergeCloudStore } from "@/lib/firebase/cloud-store";

/** Merges Firestore `userStores/{uid}` into localStorage when Firebase session is active. */
export function CrossDeviceSync() {
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user?.uid) return;
      void pullAndMergeCloudStore(user.uid);
    });
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const uid = firebaseAuth.currentUser?.uid;
      if (uid) void pullAndMergeCloudStore(uid);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubAuth();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
