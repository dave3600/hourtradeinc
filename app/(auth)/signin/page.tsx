"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createId, loadStore, randomUsername, saveStore, walletId } from "@/lib/storage";
import { generateMnemonic } from "bip39";

export default function SignInPage() {
  const router = useRouter();
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<"clip" | "seed" | "email">("clip");
  const [seedInput, setSeedInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailForgot, setEmailForgot] = useState(false);
  const [forgotSeed, setForgotSeed] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);

  const normalizeSeedPhrase = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  const completeAuth = (user: ReturnType<typeof loadStore>["users"][number], created: boolean) => {
    const store = loadStore();
    const exists = store.users.some((u) => u.id === user.id);
    const users = exists
      ? store.users.map((u) => (u.id === user.id ? user : u))
      : [...store.users, user];
    const nextStore = {
      ...store,
      users,
      currentUserId: user.id,
    };
    saveStore(nextStore);
    setStatus(created ? "Account created and authenticated." : "Authenticated.");
    router.push("/camera");
  };

  const handleClipAuth = async () => {
    if (recording) return;
    setRecording(true);
    setStatus("Recording 3-second biometric clip...");
    const existing = loadStore();
    let clip = "";
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play();
      }
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: BlobPart[] = [];
      await new Promise<void>((resolve) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onstop = () => resolve();
        recorder.start();
        window.setTimeout(() => recorder.stop(), 3000);
      });
      const blob = new Blob(chunks, { type: "video/webm" });
      clip = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = (reader.result as string) ?? "";
          resolve(result.split(",")[1] ?? "");
        };
        reader.readAsDataURL(blob);
      });
    } catch {
      clip = btoa(`${Date.now()}-${Math.random()}`);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (previewRef.current) {
        previewRef.current.srcObject = null;
      }
    }

    setStatus("Matching signature...");
    const res = await fetch("/api/auth/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clip, users: existing.users }),
    });
    const data = await res.json();

    const store = loadStore();
    const incomingUser = data.user;
    if (incomingUser) {
      const exists = store.users.some((u) => u.id === incomingUser.id);
      const users = exists
        ? store.users.map((u) => (u.id === incomingUser.id ? incomingUser : u))
        : [...store.users, incomingUser];
      const nextStore = {
        ...store,
        users,
        currentUserId: incomingUser.id,
      };
      saveStore(nextStore);
      setStatus("Authenticated.");
      setRecording(false);
      router.push("/camera");
      return;
    }
    setRecording(false);
    setStatus("Authentication failed. Try again.");
  };

  const handleSeedAuth = () => {
    const normalizedSeed = normalizeSeedPhrase(seedInput);
    if (!normalizedSeed) {
      setStatus("Enter your seed phrase.");
      return;
    }
    const store = loadStore();
    const existingUser = store.users.find((u) => normalizeSeedPhrase(u.seedPhrase) === normalizedSeed);
    if (existingUser) {
      completeAuth(existingUser, false);
      return;
    }
    const newUser = {
      id: createId("user"),
      walletAddress: walletId(),
      username: randomUsername(),
      seedPhrase: normalizedSeed,
      createdAt: new Date().toISOString(),
      joinDate: new Date().toISOString(),
    };
    completeAuth(newUser, true);
  };

  const emailPasswordDigest = async (email: string, password: string) => {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${email}|${password}`));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const handleEmailAuth = async () => {
    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setStatus("Enter a valid email address.");
      return;
    }
    if (!emailPassword.trim()) {
      setStatus("Enter your password.");
      return;
    }
    if (emailPassword.length < 4) {
      setStatus("Password must be at least 4 characters.");
      return;
    }

    const digest = await emailPasswordDigest(normalizedEmail, emailPassword);
    const store = loadStore();
    const existingUser = store.users.find((u) => (u.email ?? "").toLowerCase() === normalizedEmail);

    if (existingUser) {
      if (existingUser.emailPasswordDigest) {
        if (existingUser.emailPasswordDigest !== digest) {
          setStatus("Incorrect password.");
          return;
        }
      } else {
        const updated = { ...existingUser, emailPasswordDigest: digest };
        completeAuth(updated, false);
        return;
      }
      completeAuth(existingUser, false);
      return;
    }

    const newUser = {
      id: createId("user"),
      walletAddress: walletId(),
      username: randomUsername(),
      seedPhrase: generateMnemonic(),
      email: normalizedEmail,
      emailPasswordDigest: digest,
      createdAt: new Date().toISOString(),
      joinDate: new Date().toISOString(),
    };
    completeAuth(newUser, true);
  };

  const clearEmailForgotFields = () => {
    setEmailForgot(false);
    setForgotSeed("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
  };

  const handleEmailForgotReset = async () => {
    setStatus("");
    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setStatus("Enter a valid email address.");
      return;
    }
    const normalizedSeed = normalizeSeedPhrase(forgotSeed);
    if (!normalizedSeed) {
      setStatus("Enter your 12-word seed phrase.");
      return;
    }
    if (!forgotNewPassword.trim()) {
      setStatus("Enter a new password.");
      return;
    }
    if (forgotNewPassword.length < 4) {
      setStatus("New password must be at least 4 characters.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setStatus("New passwords do not match.");
      return;
    }

    const store = loadStore();
    const user = store.users.find((u) => (u.email ?? "").toLowerCase() === normalizedEmail);
    if (!user) {
      setStatus("No account found for that email.");
      return;
    }
    if (normalizeSeedPhrase(user.seedPhrase) !== normalizedSeed) {
      setStatus("Seed phrase does not match this account.");
      return;
    }

    const digest = await emailPasswordDigest(normalizedEmail, forgotNewPassword);
    const updated = { ...user, emailPasswordDigest: digest };
    clearEmailForgotFields();
    completeAuth(updated, false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-white">
      <h1 className="text-3xl font-bold">Sign in / Sign up</h1>
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        <button
          className={`rounded px-3 py-2 ${mode === "clip" ? "bg-cyan-500 text-black" : "bg-slate-800 text-white"}`}
          onClick={() => {
            setMode("clip");
            setEmailPassword("");
            clearEmailForgotFields();
          }}
        >
          Sign in / Sign up (3s Clip)
        </button>
        <button
          className={`rounded px-3 py-2 ${mode === "seed" ? "bg-cyan-500 text-black" : "bg-slate-800 text-white"}`}
          onClick={() => {
            setMode("seed");
            setEmailPassword("");
            clearEmailForgotFields();
          }}
        >
          Sign in / Sign up (Seed Phrase)
        </button>
        <button
          className={`rounded px-3 py-2 ${mode === "email" ? "bg-cyan-500 text-black" : "bg-slate-800 text-white"}`}
          onClick={() => {
            setMode("email");
            clearEmailForgotFields();
          }}
        >
          Sign in / Sign up (Email)
        </button>
      </div>

      {mode === "clip" && (
        <>
          <p className="max-w-md text-center text-sm text-slate-300">
            Tap once to capture a 3-second audio/video signature. Existing match signs in, no match creates a new hOurTrade account.
          </p>
          <video
            ref={previewRef}
            muted
            playsInline
            className="h-44 w-72 rounded-lg border border-slate-700 bg-black object-cover"
          />
          <button
            className="rounded-full bg-cyan-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-60"
            onClick={handleClipAuth}
            disabled={recording}
          >
            {recording ? "Recording..." : "Sign In / Sign Up (3s Clip)"}
          </button>
        </>
      )}

      {mode === "seed" && (
        <div className="w-full max-w-md space-y-2">
          <p className="text-center text-sm text-slate-300">Enter your 12-word seed phrase. Existing phrase signs in; unknown phrase creates an account.</p>
          <textarea
            id="seedPhraseAuth"
            name="seedPhraseAuth"
            className="h-28 w-full rounded bg-slate-800 p-3 text-sm"
            placeholder="Enter seed phrase"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
          />
          <button className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950" onClick={handleSeedAuth}>
            Continue with Seed Phrase
          </button>
        </div>
      )}

      {mode === "email" && (
        <div className="w-full max-w-md space-y-2">
          {!emailForgot ? (
            <>
              <p className="text-center text-sm text-slate-300">
                Enter your email and password. Existing account signs in; new email creates an account.
              </p>
              <input
                id="emailAuth"
                name="emailAuth"
                type="email"
                className="w-full rounded bg-slate-800 p-3 text-sm"
                placeholder="Enter email address"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <input
                id="emailPasswordAuth"
                name="emailPasswordAuth"
                type="password"
                autoComplete="current-password"
                className="w-full rounded bg-slate-800 p-3 text-sm"
                placeholder="Enter password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
              />
              <button className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950" onClick={() => void handleEmailAuth()}>
                Continue with Email
              </button>
              <button
                type="button"
                className="w-full text-center text-sm text-cyan-400 underline decoration-cyan-400/50 underline-offset-2 hover:text-cyan-300"
                onClick={() => {
                  setStatus("");
                  setEmailForgot(true);
                }}
              >
                Forgot password?
              </button>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-slate-300">
                Reset your email password using the same email and your 12-word seed from when you created the account. We do not
                send email—your seed proves you own the wallet.
              </p>
              <input
                id="emailForgotEmail"
                name="emailForgotEmail"
                type="email"
                className="w-full rounded bg-slate-800 p-3 text-sm"
                placeholder="Account email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <textarea
                id="emailForgotSeed"
                name="emailForgotSeed"
                className="h-24 w-full rounded bg-slate-800 p-3 text-sm"
                placeholder="12-word seed phrase"
                value={forgotSeed}
                onChange={(e) => setForgotSeed(e.target.value)}
              />
              <input
                id="emailForgotNew"
                name="emailForgotNew"
                type="password"
                autoComplete="new-password"
                className="w-full rounded bg-slate-800 p-3 text-sm"
                placeholder="New password"
                value={forgotNewPassword}
                onChange={(e) => setForgotNewPassword(e.target.value)}
              />
              <input
                id="emailForgotConfirm"
                name="emailForgotConfirm"
                type="password"
                autoComplete="new-password"
                className="w-full rounded bg-slate-800 p-3 text-sm"
                placeholder="Confirm new password"
                value={forgotConfirmPassword}
                onChange={(e) => setForgotConfirmPassword(e.target.value)}
              />
              <button
                className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
                onClick={() => void handleEmailForgotReset()}
              >
                Reset password &amp; sign in
              </button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-400 underline decoration-slate-500 underline-offset-2 hover:text-slate-300"
                onClick={() => {
                  setStatus("");
                  clearEmailForgotFields();
                }}
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      )}
      {status && <p className="text-xs text-slate-300">{status}</p>}
    </main>
  );
}
