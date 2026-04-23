"use client";

import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { loadStore } from "@/lib/storage";

function formatDuration(ms: number) {
  const totalSec = ms / 1000;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}hr`);
  if (minutes > 0) parts.push(`${minutes}min`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds.toFixed(2)}sec`);
  return parts.join(" \u2003|\u2003 ");
}

function CoinReviewContent() {
  const params = useSearchParams();
  const coinId = params.get("coinId") ?? "";
  const jobId = params.get("jobId") ?? "";
  const [flipped, setFlipped] = useState(false);
  const store = useMemo(() => loadStore(), []);
  const coin = store.coins.find((c) => c.id === coinId);
  const job = store.jobs.find((j) => j.id === jobId) ?? store.jobs.find((j) => j.id === coin?.sourceJobId);
  const mintedUser = store.users.find((u) => u.id === coin?.ownerId);
  const photos = store.photos.filter((p) => p.jobId === job?.id);

  const profilePath = `/profile?wallet=${encodeURIComponent(mintedUser?.walletAddress ?? coin?.ownerWallet ?? "")}`;
  const jobPath = `/jobs/${encodeURIComponent(job?.id ?? jobId)}`;
  const qrValue = typeof window === "undefined" ? profilePath : `${window.location.origin}${flipped ? jobPath : profilePath}`;
  const perimeterText = formatDuration(coin?.amountMs ?? 0);

  if (!coin || !job) {
    return (
      <main className="min-h-screen bg-slate-950 p-4 text-white">
        <p className="rounded bg-red-500/20 p-3 text-sm text-red-200">Coin review is unavailable for this record.</p>
        <Link href="/camera" className="mt-4 inline-block rounded bg-cyan-500 px-4 py-2 text-black">
          Back to Camera
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen space-y-4 bg-slate-950 p-4 text-white">
      <h1 className="text-2xl font-bold">Coin Review</h1>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="mx-auto w-full max-w-sm">
          <div
            className="relative mx-auto h-72 w-72 cursor-pointer [perspective:1000px]"
            onClick={() => setFlipped((prev) => !prev)}
            aria-label="Flip coin"
          >
            <div
              className={`relative h-full w-full rounded-full transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
            >
              <div className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-amber-300 bg-gradient-to-br from-amber-200 to-amber-500 text-black [backface-visibility:hidden]">
                <div className="overflow-hidden rounded-full border-2 border-black/30 bg-white p-2 shadow-lg">
                  <QRCodeSVG value={qrValue} size={120} />
                </div>
                <svg className="pointer-events-none absolute inset-0" viewBox="0 0 280 280">
                  <defs>
                    <path id="coinTextPathFront" d="M140,140 m-112,0 a112,112 0 1,1 224,0 a112,112 0 1,1 -224,0" />
                  </defs>
                  <text className="fill-black text-[14px] font-bold tracking-[2px]">
                    <textPath href="#coinTextPathFront" startOffset="0%">
                      {`${perimeterText} • ${perimeterText} • ${perimeterText} • `}
                    </textPath>
                  </text>
                </svg>
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-cyan-300 bg-gradient-to-br from-cyan-200 to-cyan-500 text-black [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <div className="overflow-hidden rounded-full border-2 border-black/30 bg-white p-2 shadow-lg">
                  <QRCodeSVG value={qrValue} size={120} />
                </div>
                <svg className="pointer-events-none absolute inset-0" viewBox="0 0 280 280">
                  <defs>
                    <path id="coinTextPathBack" d="M140,140 m-112,0 a112,112 0 1,1 224,0 a112,112 0 1,1 -224,0" />
                  </defs>
                  <text className="fill-black text-[14px] font-bold tracking-[2px]">
                    <textPath href="#coinTextPathBack" startOffset="0%">
                      {`${perimeterText} • ${perimeterText} • ${perimeterText} • `}
                    </textPath>
                  </text>
                </svg>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-300">
            Click coin to flip between profile QR and job QR.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
        <h2 className="mb-2 text-lg font-semibold">Job Details</h2>
        <div className="space-y-1 text-slate-200">
          <p>Coin value: {formatDuration(coin.amountMs)}</p>
          <p>Minted by: {mintedUser?.username ?? "Unknown user"}</p>
          <p>Wallet: {coin.ownerWallet}</p>
          <p>Created: {new Date(coin.bornAt).toLocaleString()}</p>
          <p>Location start: {job.locationStart ?? "unknown"}</p>
          <p>Location end: {job.locationEnd ?? "unknown"}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={profilePath} className="rounded bg-cyan-500 px-3 py-2 text-xs font-semibold text-black">
            Open Profile
          </Link>
          <Link href={jobPath} className="rounded bg-indigo-500 px-3 py-2 text-xs font-semibold text-white">
            Open Job Page
          </Link>
          <Link href="/wallet" className="rounded bg-slate-700 px-3 py-2 text-xs font-semibold text-white">
            Back to Wallet
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Captured Pictures</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded bg-slate-800 p-2 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="job proof"
                src={photo.dataUrl || photo.storageUrl || ""}
                className="h-24 w-full rounded object-cover"
              />
              <p className="mt-1">{new Date(photo.timestamp).toLocaleTimeString()}</p>
              <p>{photo.elapsedMs} ms</p>
            </div>
          ))}
          {photos.length === 0 && <p className="text-xs text-slate-400">No photos linked to this job yet.</p>}
        </div>
      </section>
    </main>
  );
}

export default function CoinReviewPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950 p-4 text-white">Loading review...</main>}>
      <CoinReviewContent />
    </Suspense>
  );
}

