import { NextResponse } from "next/server";
import { generateMnemonic } from "bip39";
import { Wallet } from "ethers";
import { matchClipToUsers } from "@/lib/biometric/match-service";
import { adminDb } from "@/lib/firebase/admin";
import { createId, randomUsername } from "@/lib/storage";
import type { UserProfile } from "@/lib/models";

export async function POST(req: Request) {
  const { clip, users = [] } = await req.json();
  const result = matchClipToUsers(clip, users as UserProfile[]);

  let matchedUser = result.matchedUser;
  let created = false;
  if (!matchedUser) {
    matchedUser = {
      id: createId("user"),
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
