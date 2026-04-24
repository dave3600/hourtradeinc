"use client";

import { splitCoin } from "@/lib/ledger/coin-engine";
import { activeCoinsHeldByUser } from "@/lib/ledger/coin-ownership";
import { resolveRecipient } from "@/lib/recipients/resolve-recipient";
import { firebaseAuth } from "@/lib/firebase/client";
import { saveStore } from "@/lib/storage";
import { useHourtradeStore } from "@/lib/use-hourtrade-store";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CoinLifecyclePanel() {
  const router = useRouter();
  const store = useHourtradeStore();
  const [recipientInput, setRecipientInput] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [milliseconds, setMilliseconds] = useState("");
  const [selectedCoinIds, setSelectedCoinIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const user = store.users.find((u) => u.id === store.currentUserId);
  const myCoins = user ? activeCoinsHeldByUser(store.coins, user) : [];
  const senderPendingTransfers = store.transfers.filter((tx) => tx.status === "pending" && user && tx.senderId === user.id);
  const recipientPendingTransfers = store.transfers.filter(
    (tx) => tx.status === "pending" && user && tx.recipientWallet.toLowerCase() === user.walletAddress.toLowerCase(),
  );
  const reviewedTransfers = store.transfers.filter(
    (tx) =>
      tx.status !== "pending" &&
      user &&
      (tx.recipientWallet.toLowerCase() === user.walletAddress.toLowerCase() || tx.senderId === user.id),
  );
  const selectedCoins = myCoins.filter((coin) => selectedCoinIds.includes(coin.id));
  const selectableCoins = selectedCoins.length > 0 ? selectedCoins : myCoins;
  const selectedTotalMs = selectableCoins.reduce((sum, coin) => sum + coin.amountMs, 0);
  const sendAmountMs = Math.max(
    0,
    (Number(hours) || 0) * 60 * 60 * 1000 +
      (Number(minutes) || 0) * 60 * 1000 +
      (Number(seconds) || 0) * 1000 +
      (Number(milliseconds) || 0),
  );

  const formatDuration = (valueMs: number) => {
    const totalSeconds = valueMs / 1000;
    const wholeHours = Math.floor(totalSeconds / 3600);
    const wholeMinutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const parts: string[] = [];
    if (wholeHours > 0) parts.push(`${wholeHours}hr`);
    if (wholeMinutes > 0) parts.push(`${wholeMinutes}min`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs.toFixed(2)}sec`);
    return parts.join(" \u2003|\u2003 ");
  };

  const send = async () => {
    if (!user) return;
    setError(null);
    const idToken = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken().catch(() => null) : null;
    const resolved = await resolveRecipient(recipientInput, store, user.walletAddress, idToken);
    if (!resolved) {
      setError(
        "Enter another user's user id, email, username, or wallet address (0x + 40 hex). You cannot send to yourself.",
      );
      return;
    }
    const recipientWallet = resolved.walletAddress;
    if (sendAmountMs <= 0) {
      setError("Enter a send amount greater than zero.");
      return;
    }
    if (sendAmountMs > selectedTotalMs) {
      setError("Send amount is greater than selected coin value.");
      return;
    }

    let remainingMs = sendAmountMs;
    const workingCoins = [...store.coins];
    const createdTransfers = [];
    const transferCalls: Array<{ transferId: string; sourceCoinId: string; amountMs: number }> = [];

    for (const selected of selectableCoins) {
      if (remainingMs <= 0) break;
      const sourceCoin = workingCoins.find((c) => c.id === selected.id);
      if (!sourceCoin || sourceCoin.status !== "active") continue;
      const amountFromCoin = Math.min(remainingMs, sourceCoin.amountMs);
      const { parentNext, child, transfer } = splitCoin(
        sourceCoin,
        recipientWallet,
        amountFromCoin,
        user.id,
        resolved.userId,
      );
      const sourceIdx = workingCoins.findIndex((c) => c.id === sourceCoin.id);
      if (sourceIdx >= 0) {
        workingCoins[sourceIdx] = parentNext;
      }
      workingCoins.push(child);
      createdTransfers.push(transfer);
      transferCalls.push({
        transferId: transfer.id,
        sourceCoinId: sourceCoin.id,
        amountMs: amountFromCoin,
      });
      remainingMs -= amountFromCoin;
    }

    if (remainingMs > 0) {
      setError("Unable to complete send from selected coins.");
      return;
    }

    const nextStore = {
      ...store,
      coins: workingCoins,
      transfers: [...store.transfers, ...createdTransfers],
    };
    saveStore(nextStore);
    setSelectedCoinIds([]);
    setRecipientInput("");
    setHours("");
    setMinutes("");
    setSeconds("");
    setMilliseconds("");
    transferCalls.forEach((call) => {
      void fetch("/api/coins/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: call.transferId,
          senderWallet: user.walletAddress,
          recipientWallet,
          amountMs: call.amountMs,
          sourceCoinId: call.sourceCoinId,
        }),
      });
    });
  };

  const updateTransferStatus = (id: string, status: "accepted" | "denied" | "cancelled") => {
    const nextTransfers = store.transfers.map((t) =>
      t.id === id
        ? { ...t, status }
        : t,
    );
    const tx = nextTransfers.find((t) => t.id === id);
    let nextCoins = store.coins;
    if (tx) {
      nextCoins = store.coins.map((c) => {
        if (c.id === tx.childCoinId) {
          return { ...c, status: status === "accepted" ? "active" : "cancelled" };
        }
        // Refund sender if transfer is denied/cancelled.
        if ((status === "denied" || status === "cancelled") && tx.sourceCoinIds.includes(c.id)) {
          return { ...c, amountMs: c.amountMs + tx.amountMs };
        }
        return c;
      });
    }
    const nextStore = { ...store, transfers: nextTransfers, coins: nextCoins };
    saveStore(nextStore);
    void fetch("/api/coins/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferId: id, status }),
    });
  };

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded border border-slate-700 p-3">
        <h3 className="font-semibold">Send / Split Coins</h3>
        <input
          id="recipientWallet"
          name="recipientWallet"
          className="w-full rounded bg-slate-800 p-2 text-sm"
          placeholder="Recipient: user id, email, username, or wallet (0x...40 hex)"
          value={recipientInput}
          onChange={(e) => setRecipientInput(e.target.value)}
        />
        <div className="grid grid-cols-4 gap-2">
          <input
            id="transferHours"
            name="transferHours"
            className="rounded bg-slate-800 p-2 text-sm"
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="hrs"
          />
          <input
            id="transferMinutes"
            name="transferMinutes"
            className="rounded bg-slate-800 p-2 text-sm"
            type="number"
            min={0}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="mins"
          />
          <input
            id="transferSeconds"
            name="transferSeconds"
            className="rounded bg-slate-800 p-2 text-sm"
            type="number"
            min={0}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            placeholder="secs"
          />
          <input
            id="transferMilliseconds"
            name="transferMilliseconds"
            className="rounded bg-slate-800 p-2 text-sm"
            type="number"
            min={0}
            value={milliseconds}
            onChange={(e) => setMilliseconds(e.target.value)}
            placeholder="ms"
          />
        </div>
        <div className="rounded bg-slate-800/60 p-2 text-xs text-slate-200">
          Send amount: <span className="font-semibold">{formatDuration(sendAmountMs)}</span>
        </div>
        <div className="space-y-2 rounded border border-slate-700 p-2">
          <p className="text-xs text-slate-300">Select coins to send</p>
          {myCoins.map((coin) => (
            <div key={coin.id} className="grid grid-cols-2 overflow-hidden rounded bg-slate-800 text-xs">
              <label className="flex cursor-pointer items-center gap-2 p-2">
                <input
                  type="checkbox"
                  checked={selectedCoinIds.includes(coin.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCoinIds((prev) => [...prev, coin.id]);
                    } else {
                      setSelectedCoinIds((prev) => prev.filter((id) => id !== coin.id));
                    }
                  }}
                />
                <span>{coin.id.slice(0, 12)}... ({formatDuration(coin.amountMs)})</span>
              </label>
              <button
                className="border-l border-slate-700 bg-slate-700/60 p-2 text-cyan-300 hover:bg-slate-700"
                onClick={() =>
                  router.push(`/coin-review?coinId=${encodeURIComponent(coin.id)}&jobId=${encodeURIComponent(coin.sourceJobId)}`)
                }
              >
                Review
              </button>
            </div>
          ))}
          {myCoins.length === 0 && <p className="text-xs text-slate-400">No active coins available.</p>}
          <p className="text-xs text-cyan-300">
            Selected total: <span className="font-semibold">{formatDuration(selectedTotalMs)}</span>
          </p>
          {selectedCoins.length === 0 && myCoins.length > 0 && (
            <p className="text-xs text-amber-300">
              No coins checked: system will use any of your active coins to fulfill the send amount.
            </p>
          )}
        </div>
        {error && <p className="rounded bg-red-500/20 p-2 text-xs text-red-200">{error}</p>}
        <button className="rounded bg-cyan-500 px-4 py-2 text-black" onClick={() => void send()}>
          Send Time
        </button>
      </section>

      <section className="space-y-2 rounded border border-slate-700 p-3">
        <h3 className="font-semibold">Coin Transfer Review</h3>
        {senderPendingTransfers.map((tx) => (
          <div key={tx.id} className="rounded bg-slate-800 p-2 text-xs">
            <div>{tx.amountMs} ms {"->"} {tx.recipientWallet}</div>
            <div>Status: {tx.status}</div>
            <div className="mt-2 flex gap-2">
              <button className="rounded bg-red-600 px-2 py-1" onClick={() => updateTransferStatus(tx.id, "cancelled")}>
                Cancel
              </button>
            </div>
          </div>
        ))}
        {recipientPendingTransfers.map((tx) => (
          <div key={tx.id} className="rounded bg-slate-800 p-2 text-xs">
            <div>{tx.amountMs} ms {"->"} {tx.recipientWallet}</div>
            <div>Status: {tx.status}</div>
            <div className="mt-2 flex gap-2">
              <button className="rounded bg-green-600 px-2 py-1" onClick={() => updateTransferStatus(tx.id, "accepted")}>
                Accept
              </button>
              <button className="rounded bg-red-600 px-2 py-1" onClick={() => updateTransferStatus(tx.id, "denied")}>
                Deny
              </button>
            </div>
          </div>
        ))}
        {senderPendingTransfers.length === 0 && recipientPendingTransfers.length === 0 && (
          <p className="text-xs text-slate-400">No pending transfers.</p>
        )}

        {reviewedTransfers.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
            <p className="text-xs text-slate-300">Reviewed Transfers</p>
            {reviewedTransfers.map((tx) => (
              <div key={tx.id} className="rounded bg-slate-800 p-2 text-xs">
                <div>{tx.amountMs} ms {"->"} {tx.recipientWallet}</div>
                <div>Status: {tx.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
