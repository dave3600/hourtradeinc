"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { createId, loadStore, randomUsername, saveStore, walletId } from "@/lib/storage";
import { generateMnemonic } from "bip39";
import { firebaseAuth } from "@/lib/firebase/client";
import { persistFirebaseEmailProfile, resolveFirebaseEmailProfile } from "@/lib/firebase/email-profile";

export default function SignInPage() {
  const router = useRouter();
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<"clip" | "seed" | "email">("clip");
  const [seedInput, setSeedInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailForgot, setEmailForgot] = useState(false);
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);
  const [clipCountdown, setClipCountdown] = useState<number | null>(null);
  const [clipPhase, setClipPhase] = useState<"idle" | "face">("idle");

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

  const recordClip = async (opts: { prompt: string }) => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play();
      }
      const mimeType = "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      await new Promise<void>((resolve) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => resolve();
        setStatus(opts.prompt);
        setClipPhase("face");
        setClipCountdown(3);
        const countdownInterval = window.setInterval(() => {
          setClipCountdown((prev) => {
            if (!prev || prev <= 1) {
              window.clearInterval(countdownInterval);
              return null;
            }
            return prev - 1;
          });
        }, 1000);
        recorder.start();
        window.setTimeout(() => recorder.stop(), 3000);
      });
      const blob = new Blob(chunks, { type: mimeType });
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = (reader.result as string) ?? "";
          resolve(result.split(",")[1] ?? "");
        };
        reader.readAsDataURL(blob);
      });
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (previewRef.current) previewRef.current.srcObject = null;
    }
  };

  const handleClipAuth = async () => {
    if (recording) return;
    setRecording(true);
    const existing = loadStore();
    let faceClip = "";
    try {
      faceClip = await recordClip({
        prompt: "Face step: look straight at camera with neutral expression.",
      });
    } catch {
      faceClip = btoa(`${Date.now()}-${Math.random()}-face`);
    }

    setStatus("Matching face...");
    const res = await fetch("/api/auth/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faceClip, users: existing.users }),
    });
    const data = await res.json();

    const store = loadStore();
    const incomingUser = data.user;
    if (incomingUser) {
      window.alert(data?.matched ? "Match" : "No match - account created");
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
      setStatus(data?.matched ? "Face matched. Authenticated." : "No match found. New account created and authenticated.");
      setRecording(false);
      setClipCountdown(null);
      setClipPhase("idle");
      router.push("/camera");
      return;
    }
    window.alert("No match");
    setStatus("No face match found.");
    setRecording(false);
    setClipCountdown(null);
    setClipPhase("idle");
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

  const firebaseEmailReady = () =>
    Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    );

  const firebaseAuthErrorMessage = (code: string | undefined) => {
    switch (code) {
      case "auth/invalid-email":
        return "That email address is not valid.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/user-not-found":
        return "No account found for that email.";
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Incorrect email or password.";
      case "auth/email-already-in-use":
        return "That email is already registered. Try signing in instead.";
      case "auth/weak-password":
        return "Password is too weak. Use at least 6 characters.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again later.";
      default:
        return code ? `Authentication error (${code}).` : "Authentication failed.";
    }
  };

  const handleEmailAuth = async () => {
    setStatus("");
    if (!navigator.onLine) {
      setStatus("Email sign-in requires an internet connection.");
      return;
    }
    if (!firebaseEmailReady()) {
      setStatus("Email sign-in is not configured (missing NEXT_PUBLIC_FIREBASE_* env vars).");
      return;
    }

    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setStatus("Enter a valid email address.");
      return;
    }
    if (!emailPassword.trim()) {
      setStatus("Enter your password.");
      return;
    }
    if (emailPassword.length < 6) {
      setStatus("Password must be at least 6 characters (Firebase requirement).");
      return;
    }

    try {
      const methods = await fetchSignInMethodsForEmail(firebaseAuth, normalizedEmail);
      if (methods.length > 0 && !methods.includes("password")) {
        setStatus("This email is registered with a different sign-in provider. Use that method or a different email.");
        return;
      }

      let cred;
      let createdAccount = false;
      if (methods.includes("password")) {
        cred = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, emailPassword);
      } else {
        try {
          cred = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, emailPassword);
          createdAccount = true;
        } catch (createErr: unknown) {
          const c = createErr as { code?: string };
          if (c.code === "auth/email-already-in-use") {
            cred = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, emailPassword);
          } else {
            throw createErr;
          }
        }
      }

      const uid = cred.user.uid;
      const profile = await resolveFirebaseEmailProfile(uid, cred.user.email);
      await persistFirebaseEmailProfile(profile);
      completeAuth(profile, createdAccount);
    } catch (e: unknown) {
      const err = e as { code?: string };
      setStatus(firebaseAuthErrorMessage(err.code));
    }
  };

  const clearEmailForgotFields = () => {
    setEmailForgot(false);
  };

  const handleEmailForgotSend = async () => {
    setStatus("");
    if (!navigator.onLine) {
      setStatus("Password reset requires an internet connection.");
      return;
    }
    if (!firebaseEmailReady()) {
      setStatus("Email recovery is not configured (missing NEXT_PUBLIC_FIREBASE_* env vars).");
      return;
    }
    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setStatus("Enter a valid email address.");
      return;
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, normalizedEmail);
      setStatus("If an account exists for that email, Firebase sent a reset link. Check your inbox.");
      clearEmailForgotFields();
    } catch (e: unknown) {
      const err = e as { code?: string };
      setStatus(firebaseAuthErrorMessage(err.code));
    }
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
          Sign in / Sign up (Face)
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
            Face-only match mode: if your face matches an existing account, you sign in. If not, you'll see "No match."
          </p>
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200">
            <p>1) Look directly at the camera lens (neutral expression, good lighting).</p>
            <p>2) Keep still during the 3-second capture.</p>
            <p>3) You will get a popup: Match or No match.</p>
            {clipPhase !== "idle" && <p className="mt-2 text-center text-cyan-300">Current step: {clipPhase.toUpperCase()}</p>}
            {clipCountdown !== null && (
              <p className="mt-2 text-center text-lg font-bold text-cyan-300">Recording in {clipCountdown}</p>
            )}
          </div>
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
            {recording ? "Capturing face..." : "Sign In / Sign Up (Face)"}
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
                Email sign-in uses Firebase and requires an internet connection. Same form signs in existing accounts or creates a
                new one.
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
                Enter the email for your account. Firebase will send a password reset link if that address is registered. Requires
                internet.
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
              <button
                className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
                onClick={() => void handleEmailForgotSend()}
              >
                Send reset email
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
