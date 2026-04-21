"use client";

import { createId, loadStore, saveStore } from "@/lib/storage";
import { useState } from "react";

export default function MarketplacePage() {
  const [store, setStore] = useState(() => loadStore());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceMs, setPriceMs] = useState(1000);
  const [location, setLocation] = useState("");
  const user = store.users.find((u) => u.id === store.currentUserId);
  if (!user) return <main className="p-6">Sign in first.</main>;

  const list = () => {
    const nextStore = {
      ...store,
      listings: [...store.listings, {
      id: createId("listing"),
      sellerWallet: user.walletAddress,
      title,
      description,
      priceMs,
      approxLocation: location,
      createdAt: Date.now(),
    }],
    };
    saveStore(nextStore);
    setStore(nextStore);
  };

  return (
    <main className="min-h-screen space-y-4 bg-slate-950 p-4 text-white">
      <h1 className="text-2xl font-bold">Marketplace</h1>
      <input className="w-full rounded bg-slate-800 p-2" placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
      <textarea className="w-full rounded bg-slate-800 p-2" placeholder="Description" value={description} onChange={(e)=>setDescription(e.target.value)} />
      <input className="w-full rounded bg-slate-800 p-2" type="number" value={priceMs} onChange={(e)=>setPriceMs(Number(e.target.value))} />
      <input className="w-full rounded bg-slate-800 p-2" placeholder="Approx location" value={location} onChange={(e)=>setLocation(e.target.value)} />
      <button className="rounded bg-cyan-500 px-4 py-2 text-black" onClick={list}>Post Listing</button>
      <div className="space-y-2">
        {store.listings.map((l) => (
          <div key={l.id} className="rounded bg-slate-800 p-2 text-xs">
            <div className="font-semibold">{l.title}</div>
            <div>{l.description}</div>
            <div>{l.priceMs} ms - {l.approxLocation}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
