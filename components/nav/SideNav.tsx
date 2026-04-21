"use client";

import Link from "next/link";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SideNav({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <aside className="fixed inset-0 z-20 bg-black/50" onClick={onClose}>
      <nav
        className="h-full w-72 bg-slate-900 p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-bold">hOurTrade</h2>
        <div className="space-y-2 text-sm">
          <Link className="block rounded bg-slate-800 p-2" href="/camera">
            Camera + Job
          </Link>
          <Link className="block rounded bg-slate-800 p-2" href="/wallet">
            Wallet + Coins
          </Link>
          <Link className="block rounded bg-slate-800 p-2" href="/messages">
            Messages
          </Link>
          <Link className="block rounded bg-slate-800 p-2" href="/marketplace">
            Marketplace
          </Link>
          <Link className="block rounded bg-slate-800 p-2" href="/profile">
            Profile
          </Link>
        </div>
      </nav>
    </aside>
  );
}
