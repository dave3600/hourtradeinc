"use client";

import { useHourtradeStore } from "@/lib/use-hourtrade-store";

export default function PhotoIdPage() {
  const store = useHourtradeStore();
  const user = store.users.find((u) => u.id === store.currentUserId);

  if (!user) return <main className="p-6">Sign in first.</main>;

  const photos = user.biometricFacePhotos ?? [];

  return (
    <main className="min-h-screen space-y-4 bg-slate-950 p-4 text-white">
      <h1 className="text-2xl font-bold">Photo ID</h1>
      <p className="text-xs text-slate-300">
        Sign-in face photos for comparison ({photos.length} saved).
      </p>
      {photos.length === 0 ? (
        <p className="rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
          No sign-in photos captured yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((src, idx) => (
            <div key={`${idx}-${src.slice(0, 32)}`} className="overflow-hidden rounded border border-slate-700 bg-slate-900">
              <img src={src} alt={`Sign-in face ${idx + 1}`} className="h-40 w-full object-cover" />
              <p className="p-2 text-[11px] text-slate-400">Capture #{idx + 1}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
