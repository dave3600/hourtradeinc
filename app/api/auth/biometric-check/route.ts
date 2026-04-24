import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { UserProfile } from "@/lib/models";

type Body = {
  userId?: string;
  faceHash?: string;
  voiceHash?: string;
  faceImageDataUrl?: string;
  faceDetected?: boolean;
  voiceDetected?: boolean;
  faceBox?: { x: number; y: number; width: number; height: number } | null;
  voiceModulation?: number;
  users?: UserProfile[];
};

function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let bits = 0;
  for (let i = 0; i < len; i += 1) {
    const av = parseInt(a[i] ?? "0", 16);
    const bv = parseInt(b[i] ?? "0", 16);
    let x = (Number.isNaN(av) ? 0 : av) ^ (Number.isNaN(bv) ? 0 : bv);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  bits += Math.abs(a.length - b.length) * 4;
  return bits;
}

function matchesAny(hash: string, known: string[], threshold: number): boolean {
  if (!hash || known.length === 0) return false;
  return known.some((k) => hammingDistanceHex(hash, k) <= threshold);
}

function uniqueRecent(values: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...values].reverse()) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out.reverse();
}

export async function POST(req: Request) {
  const {
    userId,
    faceHash = "",
    voiceHash = "",
    faceImageDataUrl = "",
    faceDetected = false,
    voiceDetected = false,
    faceBox = null,
    voiceModulation = 0,
    users = [],
  } = (await req.json()) as Body;
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  let currentUser: UserProfile | null = users.find((u) => u.id === userId) ?? null;
  const otherUsers: UserProfile[] = users.filter((u) => u.id !== userId);

  if (adminDb) {
    const doc = await adminDb.collection("users").doc(userId).get();
    if (doc.exists) {
      currentUser = doc.data() as UserProfile;
    }
    // Cross-account check for possible duplicate human.
    const snap = await adminDb.collection("users").limit(200).get();
    for (const d of snap.docs) {
      if (d.id === userId) continue;
      const other = d.data() as UserProfile;
      otherUsers.push(other);
    }
  }

  if (!currentUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const knownFace = uniqueRecent([
    ...(currentUser.biometricFaceHashes ?? []),
    currentUser.biometricFaceFingerprint ?? "",
    currentUser.biometricFingerprint ?? "",
  ]);
  const knownVoice = uniqueRecent([
    ...(currentUser.biometricVoiceHashes ?? []),
    currentUser.biometricVoiceFingerprint ?? "",
  ]);

  // User-scoped matching only.
  const faceMatch = faceDetected ? matchesAny(faceHash, knownFace, 56) : false;
  const voiceMatch = voiceDetected ? matchesAny(voiceHash, knownVoice, 24) : false;

  // Save latest samples to this account regardless of match result.
  const nextFace = faceDetected ? uniqueRecent([...knownFace, faceHash]) : knownFace;
  const nextVoice = voiceDetected ? uniqueRecent([...knownVoice, voiceHash]) : knownVoice;

  let possibleDuplicateUsername: string | null = null;
  let possibleDuplicateUserId: string | null = null;

  for (const other of otherUsers) {
    const otherFace = uniqueRecent([
      ...(other.biometricFaceHashes ?? []),
      other.biometricFaceFingerprint ?? "",
      other.biometricFingerprint ?? "",
    ]);
    if (faceDetected && matchesAny(faceHash, otherFace, 44)) {
      possibleDuplicateUsername = other.username;
      possibleDuplicateUserId = other.id;
      break;
    }
  }

  const updatedUser: UserProfile = {
    ...currentUser,
    biometricFaceFingerprint: faceDetected ? faceHash : currentUser.biometricFaceFingerprint,
    biometricVoiceFingerprint: voiceDetected ? voiceHash : currentUser.biometricVoiceFingerprint,
    biometricFaceHashes: nextFace,
    biometricVoiceHashes: nextVoice,
    biometricFacePhotos: faceDetected
      ? uniqueRecent([...(currentUser.biometricFacePhotos ?? []), faceImageDataUrl], 8)
      : (currentUser.biometricFacePhotos ?? []),
    biometricLastFaceBox: faceBox ?? currentUser.biometricLastFaceBox,
    biometricLastVoiceModulation: voiceDetected ? voiceModulation : currentUser.biometricLastVoiceModulation,
  };

  if (adminDb) {
    await adminDb.collection("users").doc(userId).set(updatedUser, { merge: true });
  }

  return NextResponse.json({
    ok: true,
    faceDetected,
    voiceDetected,
    faceMatch,
    voiceMatch,
    possibleDuplicateUsername,
    possibleDuplicateUserId,
    user: updatedUser,
  });
}
