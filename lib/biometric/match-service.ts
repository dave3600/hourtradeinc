import { createHash } from "crypto";
import type { UserProfile } from "../models";

export type MatchResult = {
  matchedUser?: UserProfile;
  confidence: number;
  fingerprint: string;
};

export function makeClipFingerprint(base64Clip: string) {
  return createHash("sha256").update(base64Clip).digest("hex");
}

function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let bits = 0;
  for (let i = 0; i < len; i += 1) {
    const av = parseInt(a[i], 16);
    const bv = parseInt(b[i], 16);
    if (Number.isNaN(av) || Number.isNaN(bv)) continue;
    let x = av ^ bv;
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  bits += Math.abs(a.length - b.length) * 4;
  return bits;
}

export function matchFaceHashToUsers(faceHash: string, users: UserProfile[]): MatchResult {
  if (!faceHash) {
    return { matchedUser: undefined, confidence: 0, fingerprint: "" };
  }
  let best: { user: UserProfile; distance: number } | null = null;
  for (const u of users) {
    const candidate = u.biometricFaceFingerprint || u.biometricFingerprint;
    if (!candidate) continue;
    const distance = hammingDistanceHex(faceHash, candidate);
    if (!best || distance < best.distance) {
      best = { user: u, distance };
    }
  }
  if (!best) return { matchedUser: undefined, confidence: 0, fingerprint: faceHash };
  // 64-hex hash -> 256 bits. Empirical loose threshold.
  const isMatch = best.distance <= 56;
  const confidence = isMatch ? Math.max(0.5, 1 - best.distance / 120) : 0;
  return {
    matchedUser: isMatch ? best.user : undefined,
    confidence,
    fingerprint: faceHash,
  };
}

export function matchClipToUsers(
  base64Clip: string,
  users: UserProfile[],
): MatchResult {
  const fingerprint = makeClipFingerprint(base64Clip);
  return matchFaceHashToUsers(fingerprint, users);
}
