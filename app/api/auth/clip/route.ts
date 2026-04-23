import { NextResponse } from "next/server";
import { generateMnemonic } from "bip39";
import { Wallet } from "ethers";
import { matchClipToUsers } from "@/lib/biometric/match-service";
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
  const { clip, users = [] } = await req.json();
  const result = matchClipToUsers(clip, users as UserProfile[]);

  let matchedUser = result.matchedUser;
  let created = false;
  if (!matchedUser) {
    matchedUser = {
      id: createUserId(),
      walletAddress: Wallet.createRandom().address,
      username: randomUsername(),
      seedPhrase: generateMnemonic(),
      createdAt: new Date().toISOString(),
      joinDate: new Date().toISOString(),
    };
    created = true;
  }

  if (adminDb) {
    await adminDb.collection("users").doc(matchedUser.id).set(matchedUser, { merge: true });
    await adminDb.collection("auth_signatures").doc(result.fingerprint).set(
      {
        userId: matchedUser.id,
        fingerprint: result.fingerprint,
        confidence: result.confidence,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  }

  return NextResponse.json({
    matchedUserId: matchedUser.id,
    user: matchedUser,
    created,
    confidence: result.confidence,
    fingerprint: result.fingerprint,
  });
}
