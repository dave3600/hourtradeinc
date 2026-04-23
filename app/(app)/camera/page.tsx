"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SideNav } from "@/components/nav/SideNav";
import { loadStore, saveStore } from "@/lib/storage";
import { dequeueAllEvents, enqueueOfflineEvent } from "@/lib/offline/event-queue";
import { makeIdempotencyKey } from "@/lib/security/webauthn-vault";
import { useRouter } from "next/navigation";

export default function CameraPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [store, setStore] = useState(() => loadStore());
  const [flip, setFlip] = useState(false);
  const [now, setNow] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const user = store.users.find((u) => u.id === store.currentUserId);
  const activeJob = useMemo(
    () => store.jobs.find((j) => j.userId === user?.id && j.active),
    [store.jobs, user?.id],
  );

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  useEffect(() => {
    let stream: MediaStream | null = null;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: flip ? "user" : "environment" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        // Keep placeholder UI if camera permission is denied.
      }
    }
    void startCamera();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [flip]);
  useEffect(() => {
    if (!isOnline) return;
    dequeueAllEvents().then((events) => {
      events.forEach((event) => {
        void fetch("/api/coins/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.id,
            idempotencyKey: makeIdempotencyKey(event.id),
            replayedFromOffline: true,
            ...((event.payload as Record<string, unknown>) ?? {}),
          }),
        });
      });
    });
  }, [isOnline]);
  useEffect(() => {
    if (!isOnline) return;
    const refreshSoonThresholdMs = 1000 * 60 * 10;
    const nowTs = Date.now();
    const expiring = store.photos.filter(
      (p) =>
        p.storagePath &&
        (!p.storageUrl ||
          !p.signedUrlExpiresAt ||
          p.signedUrlExpiresAt - nowTs < refreshSoonThresholdMs),
    );
    if (expiring.length === 0) return;

    Promise.all(
      expiring.map(async (photo) => {
        const res = await fetch("/api/photos/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storagePath: photo.storagePath }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { id: photo.id, ...data };
      }),
    ).then((updates) => {
      const map = new Map(
        updates
          .filter((u): u is { id: string; storageUrl: string; signedUrlExpiresAt: number } => Boolean(u?.id && u.storageUrl))
          .map((u) => [u.id, u]),
      );
      if (map.size === 0) return;
      const nextStore = {
        ...store,
        photos: store.photos.map((p) =>
          map.has(p.id)
            ? {
                ...p,
                storageUrl: map.get(p.id)?.storageUrl,
                signedUrlExpiresAt: map.get(p.id)?.signedUrlExpiresAt,
              }
            : p,
        ),
      };
      saveStore(nextStore);
      setStore(nextStore);
    });
  }, [isOnline, store]);
  const elapsed = activeJob ? now - activeJob.startedAt : 0;

  const getLocationString = async () =>
    new Promise<string>((resolve) => {
      if (!navigator.geolocation) {
        resolve("unknown");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
        () => resolve("unknown"),
        { enableHighAccuracy: false, timeout: 3000 },
      );
    });

  const clockIn = async () => {
    if (!user || activeJob) return;
    setError(null);
    const locationStart = await getLocationString();
    const clockInResponse = await fetch("/api/jobs/clock-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        wallet: user.walletAddress,
        locationStart,
      }),
    });
    if (!clockInResponse.ok) {
      setError("Clock in failed. Please try again.");
      return;
    }
    const data = await clockInResponse.json();
    const serverJob = data.job;
    const nextStore = {
      ...store,
      jobs: [
        ...store.jobs,
        serverJob,
      ],
    };
    saveStore(nextStore);
    setStore(nextStore);
  };

  const capture = async () => {
    if (!activeJob || !user) return;
    setError(null);
    const location = await getLocationString();
    const canvas = canvasRef.current;
    const video = videoRef.current;
    let imageDataUrl: string | undefined;
    let previewDataUrl: string | undefined;
    if (canvas && video && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        imageDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const previewCanvas = document.createElement("canvas");
        const previewWidth = 320;
        const previewHeight = Math.max(180, Math.floor((video.videoHeight / video.videoWidth) * previewWidth));
        previewCanvas.width = previewWidth;
        previewCanvas.height = previewHeight;
        const previewCtx = previewCanvas.getContext("2d");
        if (previewCtx) {
          previewCtx.drawImage(video, 0, 0, previewWidth, previewHeight);
          previewDataUrl = previewCanvas.toDataURL("image/jpeg", 0.5);
        }
      }
    }
    const res = await fetch("/api/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        jobId: activeJob.id,
        elapsedMs: elapsed,
        imageDataUrl,
        location,
      }),
    });
    if (!res.ok) {
      setError("Capture failed. Please try again.");
      return;
    }
    const data = await res.json();
    const nextPhotos = [...store.photos, {
      id: data.id,
      jobId: activeJob.id,
      userId: user.id,
      timestamp: Date.now(),
      elapsedMs: elapsed,
      dataUrl: previewDataUrl ?? imageDataUrl ?? data.dataUrl ?? "",
      storagePath: data.storagePath ?? undefined,
      storageUrl: data.storageUrl ?? undefined,
      signedUrlExpiresAt: data.signedUrlExpiresAt ?? undefined,
      hash: data.hash,
      location,
    }];
    const nextJobs = store.jobs.map((j) =>
      j.id === activeJob.id ? { ...j, photoIds: [...j.photoIds, data.id] } : j,
    );
    const nextStore = { ...store, photos: nextPhotos, jobs: nextJobs };
    saveStore(nextStore);
    setStore(nextStore);
  };

  const clockOut = async () => {
    if (!activeJob || !user) return;
    setError(null);
    const finalElapsed = Date.now() - activeJob.startedAt;
    const locationEnd = await getLocationString();
    const closedJob = {
      ...activeJob,
      endedAt: Date.now(),
      elapsedMs: finalElapsed,
      active: false,
      locationEnd,
    };
    const nextJobs = store.jobs.map((j) => (j.id === activeJob.id ? closedJob : j));
    await fetch("/api/jobs/clock-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, job: closedJob, wallet: user.walletAddress }),
    }).then(async (r) => {
      if (!r.ok) {
        setError("Clock out failed. Please try again.");
        return;
      }
      const data = await r.json();
      const nextStore = {
        ...store,
        jobs: nextJobs,
        coins: data.coin ? [...store.coins, data.coin] : store.coins,
      };
      saveStore(nextStore);
      setStore(nextStore);
      if (data.coin?.id) {
        router.push(`/coin-review?coinId=${encodeURIComponent(data.coin.id)}&jobId=${encodeURIComponent(closedJob.id)}`);
      }
    });
    if (!isOnline) {
      await enqueueOfflineEvent({
        id: `evt_${Date.now()}`,
        type: "clock_out",
        payload: {
          sourceCoinId: store.coins[0]?.id,
          senderWallet: user.walletAddress,
          recipientWallet: user.walletAddress,
          amountMs: Math.max(1, Math.floor(finalElapsed / 5)),
        },
        createdAt: Date.now(),
      });
    }
  };

  const latestJobId = [...store.jobs]
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))[0]?.id;
  const shownJobId = activeJob?.id ?? latestJobId;
  const photos = store.photos.filter((p) => p.jobId === shownJobId);
  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-950 p-4 text-white">
        Loading camera...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
      <section className="relative h-[70vh] border-b border-slate-700">
        <button
          className="absolute top-4 left-4 z-10 h-10 w-10 rounded-md bg-slate-800"
          onClick={() => setNavOpen(true)}
        >
          ≡
        </button>
        <button
          className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-slate-800"
          onClick={() => setFlip((f) => !f)}
        >
          ↺
        </button>
        <div className="flex h-full items-center justify-center bg-gradient-to-b from-cyan-900/30 to-slate-950">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <p className="absolute top-16 rounded bg-black/40 px-2 py-1 text-sm text-slate-200">
            Live camera ({flip ? "front" : "back"})
          </p>
          <button
            onClick={capture}
            className="absolute bottom-5 rounded-full border-2 border-yellow-300 bg-amber-500 px-7 py-3 font-bold text-black"
          >
            ★ Capture
          </button>
        </div>
      </section>
      <section className="space-y-3 p-4">
        {!isOnline && (
          <p className="rounded bg-amber-500/20 p-2 text-center text-xs text-amber-200">
            Offline mode: progress is cached and will sync when online.
          </p>
        )}
        {error && (
          <p className="rounded bg-red-500/20 p-2 text-center text-xs text-red-200">
            {error}
          </p>
        )}
        <p className="text-center text-2xl font-mono">{elapsed} ms</p>
        <div className="flex justify-center gap-3">
          <button className="rounded bg-green-500 px-4 py-2 font-semibold text-black" onClick={clockIn}>
            Clock In
          </button>
          <button className="rounded bg-red-500 px-4 py-2 font-semibold text-black" onClick={clockOut}>
            Clock Out
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pt-1">
          {photos.map((photo) => (
            <button
              key={photo.id}
              className="min-w-36 rounded bg-slate-800 p-2 text-left text-xs"
              onContextMenu={(e) => {
                e.preventDefault();
                const nextStore = {
                  ...store,
                  photos: store.photos.filter((p) => p.id !== photo.id),
                };
                saveStore(nextStore);
                setStore(nextStore);
              }}
            >
              {photo.storageUrl || photo.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="proof thumbnail"
                  src={photo.dataUrl || photo.storageUrl}
                  onError={(event) => {
                    const fallback = photo.storageUrl || photo.dataUrl || "";
                    const target = event.currentTarget;
                    if (fallback && target.src !== fallback) {
                      target.src = fallback;
                    }
                  }}
                  className="h-16 w-full rounded object-cover"
                />
              ) : (
                <div className="flex h-16 w-full items-center justify-center rounded bg-slate-700 text-[10px] text-slate-300">
                  placeholder
                </div>
              )}
              <div>{new Date(photo.timestamp).toLocaleTimeString()}</div>
              <div>{photo.elapsedMs} ms</div>
              <div className="truncate text-[10px] text-slate-400">{photo.location ?? "unknown"}</div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
