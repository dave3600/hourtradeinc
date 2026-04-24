"use client";

import { saveStore } from "@/lib/storage";
import { useHourtradeStore } from "@/lib/use-hourtrade-store";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  saveSeedPhraseWithWebAuthn,
  unlockSeedPhraseWithWebAuthn,
} from "@/lib/security/webauthn-vault";

function ProfileContent() {
  const params = useSearchParams();
  const viewedWallet = params.get("wallet");
  const store = useHourtradeStore();
  const user = store.users.find((u) => u.id === store.currentUserId);
  const [username, setUsername] = useState(user?.username ?? "");
  const [skills, setSkills] = useState(user?.skills ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [materials, setMaterials] = useState(user?.materials ?? "");
  const [vaultStatus, setVaultStatus] = useState("");

  useEffect(() => {
    if (!user) return;
    setUsername(user.username);
    setSkills(user.skills ?? "");
    setBio(user.bio ?? "");
    setMaterials(user.materials ?? "");
  }, [user?.id, user?.username, user?.skills, user?.bio, user?.materials]);

  if (!user) return <main className="p-6">Sign in first.</main>;

  const save = () => {
    const nextStore = {
      ...store,
      users: store.users.map((u) =>
        u.id === user.id ? { ...u, username, skills, bio, materials } : u,
      ),
    };
    saveStore(nextStore);
  };

  return (
    <main className="min-h-screen space-y-3 bg-slate-950 p-4 text-white">
      <h1 className="text-2xl font-bold">Profile</h1>
      {viewedWallet && <p className="text-xs text-cyan-300">Viewing wallet: {viewedWallet}</p>}
      <p className="text-xs text-slate-300">Email: {user.email ?? "not set"}</p>
      <p className="text-xs text-slate-300">Seed phrase: {user.seedPhrase}</p>
      <input id="profileUsername" name="profileUsername" className="w-full rounded bg-slate-800 p-2" value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username" />
      <textarea id="profileSkills" name="profileSkills" className="w-full rounded bg-slate-800 p-2" value={skills} onChange={(e)=>setSkills(e.target.value)} placeholder="Skills" />
      <textarea id="profileMaterials" name="profileMaterials" className="w-full rounded bg-slate-800 p-2" value={materials} onChange={(e)=>setMaterials(e.target.value)} placeholder="Materials" />
      <textarea id="profileBio" name="profileBio" className="w-full rounded bg-slate-800 p-2" value={bio} onChange={(e)=>setBio(e.target.value)} placeholder="Bio" />
      <button className="rounded bg-cyan-500 px-4 py-2 text-black" onClick={save}>Save Profile</button>
      <div className="flex gap-2">
        <button
          className="rounded bg-indigo-500 px-3 py-2 text-xs text-white"
          onClick={async () => {
            try {
              await saveSeedPhraseWithWebAuthn(user.seedPhrase);
              setVaultStatus("Seed phrase protected with WebAuthn.");
            } catch (error) {
              setVaultStatus((error as Error).message);
            }
          }}
        >
          Protect Seed
        </button>
        <button
          className="rounded bg-violet-500 px-3 py-2 text-xs text-white"
          onClick={async () => {
            try {
              const unlocked = await unlockSeedPhraseWithWebAuthn();
              setVaultStatus(unlocked ? `Recovered: ${unlocked}` : "No seed in vault.");
            } catch (error) {
              setVaultStatus((error as Error).message);
            }
          }}
        >
          Recover Seed
        </button>
      </div>
      {vaultStatus && <p className="text-xs text-slate-300">{vaultStatus}</p>}
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950 p-4 text-white">Loading…</main>}>
      <ProfileContent />
    </Suspense>
  );
}
