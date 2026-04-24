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

export function matchClipToUsers(
  base64Clip: string,
  users: UserProfile[],
): MatchResult {
  const fingerprint = makeClipFingerprint(base64Clip);
  // Primary match: exact face fingerprint equality (fallback to legacy single fingerprint).
  const match = users.find((u) => {
    const user = u as UserProfile & { biometricFaceFingerprint?: string; biometricFingerprint?: string };
    return user.biometricFaceFingerprint === fingerprint || user.biometricFingerprint === fingerprint;
  });
  return {
    matchedUser: match,
    confidence: match ? 0.91 : 0.0,
    fingerprint,
  };
}
