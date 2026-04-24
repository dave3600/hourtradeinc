import { NextResponse } from "next/server";
import { generateMnemonic } from "bip39";
import { Wallet } from "ethers";
import { makeClipFingerprint, matchClipToUsers, matchFaceHashToUsers } from "@/lib/biometric/match-service";
import { adminDb } from "@/lib/firebase/admin";
import type { UserProfile } from "@/lib/models";

function createUserId() {
  return `user_${crypto.randomUUID().replaceAll("-", "")}`;
}

function randomUsername() {
  const words = ["Green", "Sky", "Iron", "Nova", "River", "Seed", "Solar"];
  const animals = ["Falcon", "Otter", "Wolf", "Fox", "Whale", "Tiger"];
  return `${words[Math.floor(Math.random() * words.length)]}${animals[Math.floor(Math.random() * animals.length)]}${Math.floor(Math.random() * 1000)}`;
}

export async function POST(req: Request) {
  const { clip, faceClip, faceHash, users = [] } = await req.json();
  const faceSource = faceClip || clip || "";
  const normalizedFaceHash = typeof faceHash === "string" && faceHash.trim() ? faceHash.trim().toLowerCase() : "";
  const fallbackHash = makeClipFingerprint(faceSource);
  const faceFingerprint = normalizedFaceHash || fallbackHash;
  const result = normalizedFaceHash
    ? matchFaceHashToUsers(faceFingerprint, users as UserProfile[])
    : matchClipToUsers(faceSource, users as UserProfile[]);

  let matchedUser = result.matchedUser;
  let created = false;
  if (!matchedUser && adminDb) {
    const signatureSnap = await adminDb.collection("auth_signatures").doc(faceFingerprint).get();
    const signatureUserId = signatureSnap.exists ? (signatureSnap.data()?.userId as string | undefined) : undefined;
    if (signatureUserId) {
      const serverUser = await adminDb.collection("users").doc(signatureUserId).get();
      if (serverUser.exists) {
        matchedUser = serverUser.data() as UserProfile;
      }
    }
  }

  if (!matchedUser) {
    matchedUser = {
      id: createUserId(),
      walletAddress: Wallet.createRandom().address,
      username: randomUsername(),
      seedPhrase: generateMnemonic(),
      biometricFingerprint: faceFingerprint,
      biometricFaceFingerprint: faceFingerprint,
      createdAt: new Date().toISOString(),
      joinDate: new Date().toISOString(),
    };
    created = true;
  }

  matchedUser = {
    ...matchedUser,
    biometricFingerprint: faceFingerprint,
    biometricFaceFingerprint: faceFingerprint,
  };

  if (adminDb) {
    await adminDb.collection("users").doc(matchedUser.id).set(matchedUser, { merge: true });
    await adminDb.collection("auth_signatures").doc(faceFingerprint).set(
      {
        userId: matchedUser.id,
        fingerprint: faceFingerprint,
        confidence: result.confidence,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  }

  return NextResponse.json({
    matched: !created,
    matchedUserId: matchedUser.id,
    user: matchedUser,
    created,
    confidence: result.confidence,
    fingerprint: faceFingerprint,
  });
}
