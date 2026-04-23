"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { loadStore } from "@/lib/storage";

export default function JobDetailsPage() {
  const params = useParams<{ jobId: string }>();
  const store = useMemo(() => loadStore(), []);
  const jobId = params?.jobId ?? "";
  const job = store.jobs.find((j) => j.id === jobId);
  const photos = store.photos.filter((p) => p.jobId === jobId);
  const relatedCoins = store.coins.filter((c) => c.sourceJobId === jobId);

  if (!job) {
    return (
      <main className="min-h-screen bg-slate-950 p-4 text-white">
        <p className="rounded bg-red-500/20 p-3 text-sm text-red-200">Job not found.</p>
        <Link href="/camera" className="mt-4 inline-block rounded bg-cyan-500 px-4 py-2 text-black">
          Back to Camera
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen space-y-4 bg-slate-950 p-4 text-white">
      <h1 className="text-2xl font-bold">Job Details</h1>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
        <p>Job ID: {job.id}</p>
        <p>Created: {new Date(job.startedAt).toLocaleString()}</p>
        <p>Ended: {job.endedAt ? new Date(job.endedAt).toLocaleString() : "Active"}</p>
        <p>Elapsed: {job.elapsedMs} ms</p>
        <p>Location start: {job.locationStart ?? "unknown"}</p>
        <p>Location end: {job.locationEnd ?? "unknown"}</p>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Pictures</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded bg-slate-800 p-2 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="job photo" src={photo.dataUrl || photo.storageUrl || ""} className="h-24 w-full rounded object-cover" />
              <p className="mt-1">{new Date(photo.timestamp).toLocaleTimeString()}</p>
              <p>{photo.elapsedMs} ms</p>
            </div>
          ))}
          {photos.length === 0 && <p className="text-xs text-slate-400">No photos yet.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Related Coins</h2>
        <div className="space-y-2 text-xs">
          {relatedCoins.map((coin) => (
            <div key={coin.id} className="rounded bg-slate-800 p-2">
              <p>{coin.id}</p>
              <p>{coin.amountMs} ms</p>
              <p>{coin.status}</p>
            </div>
          ))}
          {relatedCoins.length === 0 && <p className="text-slate-400">No coins minted yet.</p>}
        </div>
      </section>
    </main>
  );
}

