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
  const [emailBiometricStep, setEmailBiometricStep] = useState<"idle" | "face" | "voice">("idle");
  const [promptMessage, setPromptMessage] = useState<string | null>(null);
  const promptResolverRef = useRef<(() => void) | null>(null);

  const normalizeSeedPhrase = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  const openUserCamera = async () => {
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false },
    ];
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };

  const showBlockingPrompt = (message: string) =>
    new Promise<void>((resolve) => {
      setPromptMessage(message);
      promptResolverRef.current = resolve;
    });

  const acknowledgePrompt = () => {
    const resolve = promptResolverRef.current;
    promptResolverRef.current = null;
    setPromptMessage(null);
    resolve?.();
  };

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

  const hammingHexFromFrame = (video: HTMLVideoElement) => {
    const w = 16;
    const h = 16;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h).data;
    const gray: number[] = [];
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i] ?? 0;
      const g = img[i + 1] ?? 0;
      const b = img[i + 2] ?? 0;
      gray.push(Math.round(r * 0.299 + g * 0.587 + b * 0.114));
    }
    const avg = gray.reduce((sum, v) => sum + v, 0) / gray.length;
    let bits = "";
    for (const v of gray) bits += v >= avg ? "1" : "0";
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  };

  const faceImageFromFrame = (video: HTMLVideoElement) => {
    const w = 192;
    const h = Math.max(180, Math.floor((video.videoHeight / Math.max(1, video.videoWidth)) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.6);
  };

  const voiceHashFromAudioBlob = async (blob: Blob) => {
    try {
      const arr = await blob.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arr.slice(0));
      const pcm = decoded.getChannelData(0);
      const bins = 64;
      const step = Math.max(1, Math.floor(pcm.length / bins));
      const energies: number[] = [];
      for (let i = 0; i < bins; i += 1) {
        let sum = 0;
        for (let j = 0; j < step; j += 1) {
          const idx = i * step + j;
          if (idx >= pcm.length) break;
          sum += Math.abs(pcm[idx] ?? 0);
        }
        energies.push(sum / step);
      }
      const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
      let bits = "";
      for (const e of energies) bits += e >= mean ? "1" : "0";
      let hex = "";
      for (let i = 0; i < bits.length; i += 4) {
        hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
      }
      void ctx.close();
      return hex;
    } catch {
      return "";
    }
  };

  const detectFaceBox = async (video: HTMLVideoElement): Promise<{ x: number; y: number; width: number; height: number } | null> => {
    try {
      if ("FaceDetector" in window) {
        const Detector = (window as unknown as { FaceDetector?: new () => { detect(input: CanvasImageSource): Promise<any[]> } }).FaceDetector;
        if (Detector) {
          const detector = new Detector();
          const faces = await detector.detect(video);
          if (faces.length) {
            const b = faces[0]?.boundingBox;
            if (b) return { x: b.x, y: b.y, width: b.width, height: b.height };
          }
        }
      }

      // Fallback heuristic for browsers without FaceDetector:
      // use center-frame luminance/contrast activity to infer likely face presence.
      const w = 64;
      const h = 64;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const lum: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        lum.push(0.299 * r + 0.587 * g + 0.114 * b);
      }
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      const variance = lum.reduce((acc, v) => acc + (v - mean) ** 2, 0) / lum.length;
      const std = Math.sqrt(variance);

      // very dark/flat frames are treated as no-face.
      if (mean < 25 || std < 12) return null;

      // Center crop as approximate face box when heuristic passes.
      return {
        x: w * 0.25,
        y: h * 0.18,
        width: w * 0.5,
        height: h * 0.64,
      };
    } catch {
      return null;
    }
  };

  const voiceModulationFromAudioBlob = async (blob: Blob) => {
    try {
      const arr = await blob.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arr.slice(0));
      const pcm = decoded.getChannelData(0);
      const bins = 80;
      const step = Math.max(1, Math.floor(pcm.length / bins));
      const energies: number[] = [];
      for (let i = 0; i < bins; i += 1) {
        let sum = 0;
        for (let j = 0; j < step; j += 1) {
          const idx = i * step + j;
          if (idx >= pcm.length) break;
          sum += Math.abs(pcm[idx] ?? 0);
        }
        energies.push(sum / step);
      }
      const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
      const variance = energies.reduce((acc, e) => acc + (e - mean) ** 2, 0) / energies.length;
      void ctx.close();
      return Math.sqrt(variance);
    } catch {
      return 0;
    }
  };

  const runEmailBiometricCheck = async (userId: string) => {
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

      setEmailBiometricStep("face");
      setStatus("Face check: look at camera.");
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      const faceHash = previewRef.current ? hammingHexFromFrame(previewRef.current) : "";
      const faceImageDataUrl = previewRef.current ? faceImageFromFrame(previewRef.current) : "";
      const faceBox = previewRef.current ? await detectFaceBox(previewRef.current) : null;
      const faceDetected = Boolean(faceBox && faceBox.width > 20 && faceBox.height > 20);

      setEmailBiometricStep("voice");
      setStatus('Voice check: say "open sesame".');
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];
      await new Promise<void>((resolve) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => resolve();
        recorder.start();
        window.setTimeout(() => recorder.stop(), 2500);
      });
      const voiceBlob = new Blob(chunks, { type: "audio/webm" });
      const voiceHash = await voiceHashFromAudioBlob(voiceBlob);
      const voiceModulation = await voiceModulationFromAudioBlob(voiceBlob);
      const voiceDetected = voiceModulation > 0.008;

      const store = loadStore();
      const res = await fetch("/api/auth/biometric-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          faceHash,
          faceImageDataUrl,
          voiceHash,
          faceDetected,
          voiceDetected,
          faceBox,
          voiceModulation,
          users: store.users,
        }),
      });
      const data = await res.json();
      await showBlockingPrompt(data.faceDetected ? (data.faceMatch ? "Face match" : "Face no match") : "No face detected");
      await showBlockingPrompt(data.voiceDetected ? (data.voiceMatch ? "Voice match" : "Voice no match") : "No voice detected");
      if (data.possibleDuplicateUsername) {
        setStatus(`u look like ${data.possibleDuplicateUsername}`);
      }
    } catch {
      setStatus("Authenticated. Biometric prompt unavailable.");
    } finally {
      setEmailBiometricStep("idle");
      stream?.getTracks().forEach((t) => t.stop());
      if (previewRef.current) previewRef.current.srcObject = null;
    }
  };

  const computeFaceHash = (video: HTMLVideoElement): string => {
    const w = 16;
    const h = 16;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h).data;
    const gray: number[] = [];
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i] ?? 0;
      const g = img[i + 1] ?? 0;
      const b = img[i + 2] ?? 0;
      gray.push(Math.round(r * 0.299 + g * 0.587 + b * 0.114));
    }
    const avg = gray.reduce((sum, v) => sum + v, 0) / gray.length;
    let bits = "";
    for (const v of gray) {
      bits += v >= avg ? "1" : "0";
    }
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      const nibble = bits.slice(i, i + 4);
      hex += parseInt(nibble, 2).toString(16);
    }
    return hex;
  };

  const recordClip = async (opts: { prompt: string }) => {
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported in this browser.");
      }
      stream = await openUserCamera();
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play();
      }
      const sampleHash = previewRef.current ? computeFaceHash(previewRef.current) : "";
      const sampleImage = previewRef.current ? faceImageFromFrame(previewRef.current) : "";
      const preferredType = "video/webm";
      const mediaRecorderOptions =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(preferredType) ? { mimeType: preferredType } : undefined;
      const recorder = mediaRecorderOptions ? new MediaRecorder(stream, mediaRecorderOptions) : new MediaRecorder(stream);
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
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const clip = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = (reader.result as string) ?? "";
          resolve(result.split(",")[1] ?? "");
        };
        reader.readAsDataURL(blob);
      });
      return { clip, faceHash: sampleHash, faceImageDataUrl: sampleImage };
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
    let faceHash = "";
    let faceImageDataUrl = "";
    try {
      const recorded = await recordClip({
        prompt: "Face step: look straight at camera with neutral expression.",
      });
      faceClip = recorded.clip;
      faceHash = recorded.faceHash;
      faceImageDataUrl = recorded.faceImageDataUrl;
    } catch {
      faceClip = btoa(`${Date.now()}-${Math.random()}-face`);
    }

    try {
      setStatus("Matching face...");
      const res = await fetch("/api/auth/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceClip, faceHash, faceImageDataUrl, users: existing.users }),
      });
      if (!res.ok) {
        throw new Error(`Face auth request failed (${res.status})`);
      }
      const data = await res.json();

      const store = loadStore();
      const incomingUser = data.user;
      if (incomingUser) {
        await showBlockingPrompt(data?.matched ? "Match" : "No match - account created");
        const withPhoto =
          faceImageDataUrl && !incomingUser.biometricFacePhotos?.includes(faceImageDataUrl)
            ? {
                ...incomingUser,
                biometricFacePhotos: [...(incomingUser.biometricFacePhotos ?? []), faceImageDataUrl].slice(-8),
              }
            : incomingUser;
        const exists = store.users.some((u) => u.id === withPhoto.id);
        const users = exists
          ? store.users.map((u) => (u.id === withPhoto.id ? withPhoto : u))
          : [...store.users, withPhoto];
        const nextStore = {
          ...store,
          users,
          currentUserId: withPhoto.id,
        };
        saveStore(nextStore);
        setStatus(data?.matched ? "Face matched. Authenticated." : "No match found. New account created and authenticated.");
        router.push("/camera");
        return;
      }
      await showBlockingPrompt("No match");
      setStatus("No face match found.");
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name === "NotAllowedError") {
        setStatus("Camera permission denied. Please allow camera access in browser settings.");
      } else if (err.name === "NotFoundError") {
        setStatus("No camera found on this device.");
      } else if (err.name === "NotReadableError") {
        setStatus("Camera is busy in another app/tab. Close other camera apps and try again.");
      } else {
        setStatus(err.message || "Camera sign-in failed. Please allow camera access and try again.");
      }
    } finally {
      setRecording(false);
      setClipCountdown(null);
      setClipPhase("idle");
    }
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
      await runEmailBiometricCheck(profile.id);
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
          {emailBiometricStep !== "idle" && (
            <div className="space-y-2 rounded border border-slate-700 bg-slate-900/60 p-3">
              <p className="text-center text-xs text-slate-300">
                {emailBiometricStep === "face" ? "Checking face..." : 'Listening for "open sesame"...'}
              </p>
              <video
                ref={previewRef}
                muted
                playsInline
                className="h-40 w-full rounded border border-slate-700 bg-black object-cover"
              />
            </div>
          )}
        </div>
      )}
      {status && <p className="text-xs text-slate-300">{status}</p>}
      {promptMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-4 text-white shadow-xl">
            <p className="text-sm">{promptMessage}</p>
            <button
              type="button"
              className="mt-4 w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
              onClick={acknowledgePrompt}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
