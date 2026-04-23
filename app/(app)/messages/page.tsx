"use client";

import { createId, saveStore } from "@/lib/storage";
import { useHourtradeStore } from "@/lib/use-hourtrade-store";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function MessagesContent() {
  const params = useSearchParams();
  const prefillWallet = params.get("wallet") ?? "";
  const [toWallet, setToWallet] = useState("");
  const [body, setBody] = useState("");
  const store = useHourtradeStore();
  const user = store.users.find((u) => u.id === store.currentUserId);
  if (!user) return <main className="p-6">Sign in first.</main>;

  const targetWallet = toWallet || prefillWallet;

  const send = () => {
    const nextStore = {
      ...store,
      messages: [...store.messages, {
      id: createId("msg"),
      fromWallet: user.walletAddress,
      toWallet: targetWallet,
      body,
      createdAt: Date.now(),
    }],
    };
    saveStore(nextStore);
    setBody("");
  };

  return (
    <main className="min-h-screen space-y-4 bg-slate-950 p-4 text-white">
      <h1 className="text-2xl font-bold">Message Center</h1>
      <input id="toWallet" name="toWallet" className="w-full rounded bg-slate-800 p-2" placeholder="To wallet" value={toWallet} onChange={(e)=>setToWallet(e.target.value)} />
      <textarea id="messageBody" name="messageBody" className="w-full rounded bg-slate-800 p-2" placeholder="Message" value={body} onChange={(e)=>setBody(e.target.value)} />
      <button className="rounded bg-cyan-500 px-4 py-2 text-black" onClick={send}>Send</button>
      {prefillWallet && <p className="text-xs text-cyan-300">Prefilled from QR: {targetWallet}</p>}
      <div className="space-y-2">
        {store.messages.map((m) => (
          <div key={m.id} className="rounded bg-slate-800 p-2 text-xs">
            <div>{m.fromWallet} {"->"} {m.toWallet}</div>
            <div>{m.body}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950 p-4 text-white">Loading…</main>}>
      <MessagesContent />
    </Suspense>
  );
}
