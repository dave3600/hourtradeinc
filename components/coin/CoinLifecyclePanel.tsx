"use client";

import { splitCoin } from "@/lib/ledger/coin-engine";
import { loadStore, saveStore } from "@/lib/storage";
import { useState } from "react";

export function CoinLifecyclePanel() {
  const [store, setStore] = useState(() => loadStore());
  const [recipientWallet, setRecipientWallet] = useState("");
  const [amount, setAmount] = useState(1000);
  const user = store.users.find((u) => u.id === store.currentUserId);
  const myCoins = store.coins.filter((c) => c.ownerId === user?.id && c.status === "active");

  const send = () => {
    if (!user || !myCoins[0]) return;
    const { parentNext, child, transfer } = splitCoin(
      myCoins[0],
      recipientWallet,
      amount,
      user.id,
    );
    const nextStore = {
      ...store,
      coins: [...store.coins.map((c) => (c.id === parentNext.id ? parentNext : c)), child],
      transfers: [...store.transfers, transfer],
    };
    saveStore(nextStore);
    setStore(nextStore);
    void fetch("/api/coins/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: transfer.id,
        senderWallet: myCoins[0].ownerWallet,
        recipientWallet,
        amountMs: amount,
        sourceCoinId: myCoins[0].id,
      }),
    });
  };

  const review = (id: string, accept: boolean) => {
    const nextTransfers = store.transfers.map((t) =>
      t.id === id ? { ...t, status: accept ? "accepted" : "denied" } : t,
    );
    const tx = nextTransfers.find((t) => t.id === id);
    let nextCoins = store.coins;
    if (tx) {
      nextCoins = store.coins.map((c) =>
        c.id === tx.childCoinId
          ? { ...c, status: accept ? "active" : "cancelled" }
          : c,
      );
    }
    const nextStore = { ...store, transfers: nextTransfers, coins: nextCoins };
    saveStore(nextStore);
    setStore(nextStore);
    void fetch("/api/coins/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferId: id, status: accept ? "accepted" : "denied" }),
    });
  };

  return (
    <section className="space-y-3 rounded border border-slate-700 p-3">
      <h3 className="font-semibold">Send / Split Coins</h3>
      <input
        className="w-full rounded bg-slate-800 p-2 text-sm"
        placeholder="Recipient wallet"
        value={recipientWallet}
        onChange={(e) => setRecipientWallet(e.target.value)}
      />
      <input
        className="w-full rounded bg-slate-800 p-2 text-sm"
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
      />
      <button className="rounded bg-cyan-500 px-4 py-2 text-black" onClick={send}>
        Send Time
      </button>
      <div className="space-y-2">
        {store.transfers.map((tx) => (
          <div key={tx.id} className="rounded bg-slate-800 p-2 text-xs">
            <div>{tx.amountMs} ms {"->"} {tx.recipientWallet}</div>
            <div>Status: {tx.status}</div>
            {tx.status === "pending" && (
              <div className="mt-2 flex gap-2">
                <button className="rounded bg-green-600 px-2 py-1" onClick={() => review(tx.id, true)}>
                  Accept
                </button>
                <button className="rounded bg-red-600 px-2 py-1" onClick={() => review(tx.id, false)}>
                  Deny
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
