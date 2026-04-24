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
  // Primary match is exact fingerprint equality (when previously stored locally).
  const match = users.find((u) => (u as UserProfile & { biometricFingerprint?: string }).biometricFingerprint === fingerprint);
  return {
    matchedUser: match,
    confidence: match ? 0.91 : 0.0,
    fingerprint,
  };
}
