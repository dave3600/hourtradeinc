"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";
import { firebaseAuth } from "@/lib/firebase/client";
import { flushCloudPushNow, pullAndMergeCloudStore } from "@/lib/firebase/cloud-store";

/** Merges Firestore `userStores/{uid}` into localStorage when Firebase session is active. */
export function CrossDeviceSync() {
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user?.uid) return;
      void (async () => {
        await pullAndMergeCloudStore(user.uid);
        await flushCloudPushNow(user.uid);
      })();
    });
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const uid = firebaseAuth.currentUser?.uid;
      if (uid)
        void (async () => {
          await pullAndMergeCloudStore(uid);
          await flushCloudPushNow(uid);
        })();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      const uid = firebaseAuth.currentUser?.uid;
      if (uid && document.visibilityState === "visible")
        void (async () => {
          await pullAndMergeCloudStore(uid);
          await flushCloudPushNow(uid);
        })();
    }, 45_000);
    return () => {
      unsubAuth();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
