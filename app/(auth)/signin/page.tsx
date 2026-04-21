"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStore, saveStore } from "@/lib/storage";

export default function SignInPage() {
  const router = useRouter();
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-white">
      <h1 className="text-3xl font-bold">Sign in / Sign up</h1>
      <p className="max-w-md text-center text-sm text-slate-300">
        Tap once to capture a 3-second audio/video signature. Existing match
        signs in, no match creates a new hOurTrade account.
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
      {status && <p className="text-xs text-slate-300">{status}</p>}
    </main>
  );
}
