"use client";

import { CoinLifecyclePanel } from "@/components/coin/CoinLifecyclePanel";
import { saveStore } from "@/lib/storage";
import { useHourtradeStore } from "@/lib/use-hourtrade-store";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WalletPage() {
  const router = useRouter();
  const store = useHourtradeStore();
  const [scannedWallet, setScannedWallet] = useState("");
  const user = store.users.find((u) => u.id === store.currentUserId);
  const myCoins = store.coins.filter((c) => c.ownerId === user?.id);
  const total = myCoins.reduce((sum, c) => sum + c.amountMs, 0);

  if (!user) {
    return <main className="p-6">Sign in first.</main>;
  }

  return (
    <main className="min-h-screen space-y-4 bg-slate-950 p-4 text-white">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <p className="text-sm">Wallet address: {user.walletAddress}</p>
      <p className="text-sm">Total value: {total} ms</p>
      <CoinLifecyclePanel />
      <div className="space-y-2 rounded border border-slate-700 p-3">
        <p className="text-xs text-slate-300">Scan simulation / paste wallet</p>
        <input
          id="scannedWallet"
          name="scannedWallet"
          className="w-full rounded bg-slate-800 p-2 text-sm"
          value={scannedWallet}
          onChange={(e) => setScannedWallet(e.target.value)}
          placeholder="Scanned wallet address"
        />
        <div className="flex gap-2 text-xs">
          <Link href={`/profile?wallet=${encodeURIComponent(scannedWallet)}`} className="rounded bg-slate-800 px-2 py-1">View Profile</Link>
          <Link href={`/messages?wallet=${encodeURIComponent(scannedWallet)}`} className="rounded bg-slate-800 px-2 py-1">Send Message</Link>
          <Link href={`/wallet?payTo=${encodeURIComponent(scannedWallet)}`} className="rounded bg-slate-800 px-2 py-1">Pay User</Link>
        </div>
      </div>
      <div className="rounded bg-white p-3 text-black">
        <QRCodeSVG value={user.walletAddress} />
      </div>
      <section className="space-y-2 rounded border border-slate-700 p-3">
        <h3 className="text-sm font-semibold">Coin Voting</h3>
        {myCoins.map((coin) => (
          <div
            key={coin.id}
            className="cursor-pointer rounded bg-slate-800 p-2 text-xs hover:bg-slate-700"
            onClick={() =>
              router.push(`/coin-review?coinId=${encodeURIComponent(coin.id)}&jobId=${encodeURIComponent(coin.sourceJobId)}`)
            }
          >
            <div>{coin.id.slice(0, 12)}... ({coin.amountMs} ms)</div>
            <div className="mt-1 text-[10px] text-cyan-300">Click coin to open smart contract details</div>
            <div className="mt-1 flex gap-2">
              <button
                className="rounded bg-green-700 px-2 py-1"
                onClick={(event) => {
                  event.stopPropagation();
                  const coins = store.coins.map((c) =>
                    c.id === coin.id ? { ...c, votesWork: (c.votesWork ?? 0) + 1 } : c,
                  );
                  const next = { ...store, coins };
                  saveStore(next);
                }}
              >
                Green Star {(coin.votesWork ?? 0).toLocaleString()}
              </button>
              <button
                className="rounded bg-red-700 px-2 py-1"
                onClick={(event) => {
                  event.stopPropagation();
                  const coins = store.coins.map((c) =>
                    c.id === coin.id ? { ...c, votesNoWork: (c.votesNoWork ?? 0) + 1 } : c,
                  );
                  const next = { ...store, coins };
                  saveStore(next);
                }}
              >
                Red Star {(coin.votesNoWork ?? 0).toLocaleString()}
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
