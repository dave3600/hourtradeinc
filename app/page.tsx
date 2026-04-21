import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white">
      <h1 className="text-4xl font-bold tracking-tight">hOurTrade</h1>
      <p className="max-w-lg text-center text-sm text-slate-300">
        Save-the-world proof-of-work social wallet. Clock in, capture proof,
        mint time coins, and trade by verified effort.
      </p>
      <Link
        className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
        href="/signin"
      >
        Enter App
      </Link>
    </main>
  );
}
