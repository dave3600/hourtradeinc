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
  const match = users.find((u) => u.id.slice(-8) === fingerprint.slice(-8));
  return {
    matchedUser: match,
    confidence: match ? 0.91 : 0.0,
    fingerprint,
  };
}
