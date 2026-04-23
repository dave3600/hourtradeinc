import { doc, getDoc, setDoc } from "firebase/firestore";
import type { UserProfile } from "@/lib/models";
import { firestore } from "@/lib/firebase/client";
import { generateMnemonic } from "bip39";
import { loadStore, randomUsername, walletId } from "@/lib/storage";

const USERS = "users";

function firestoreUserPayload(u: UserProfile): Record<string, string> {
  const out: Record<string, string> = {
    id: u.id,
    firebaseUid: u.firebaseUid ?? u.id,
    walletAddress: u.walletAddress,
    username: u.username,
    seedPhrase: u.seedPhrase,
    createdAt: u.createdAt,
    joinDate: u.joinDate,
  };
  if (u.email) out.email = u.email;
  if (u.bio) out.bio = u.bio;
  if (u.skills) out.skills = u.skills;
  if (u.materials) out.materials = u.materials;
  return out;
}

function docToUserProfile(uid: string, d: Record<string, unknown>, emailFromAuth: string | null): UserProfile {
  const email =
    (typeof emailFromAuth === "string" && emailFromAuth ? emailFromAuth.toLowerCase() : null) ??
    (typeof d.email === "string" ? d.email.toLowerCase() : undefined);
  const now = new Date().toISOString();
  return {
    id: uid,
    firebaseUid: uid,
    walletAddress: typeof d.walletAddress === "string" ? d.walletAddress : walletId(),
    username: typeof d.username === "string" ? d.username : randomUsername(),
    seedPhrase: typeof d.seedPhrase === "string" ? d.seedPhrase : generateMnemonic(),
    email: email || undefined,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : now,
    joinDate: typeof d.joinDate === "string" ? d.joinDate : typeof d.createdAt === "string" ? d.createdAt : now,
    bio: typeof d.bio === "string" ? d.bio : undefined,
    skills: typeof d.skills === "string" ? d.skills : undefined,
    materials: typeof d.materials === "string" ? d.materials : undefined,
  };
}

/** Load profile after Firebase sign-in: Firestore first, then local store, then new defaults. */
export async function resolveFirebaseEmailProfile(uid: string, emailFromAuth: string | null): Promise<UserProfile> {
  const snap = await getDoc(doc(firestore, USERS, uid));
  if (snap.exists()) {
    return docToUserProfile(uid, snap.data() as Record<string, unknown>, emailFromAuth);
  }
  const store = loadStore();
  const local = store.users.find((u) => u.firebaseUid === uid || u.id === uid);
  if (local) {
    const email =
      emailFromAuth?.trim().toLowerCase() ||
      local.email?.toLowerCase();
    return {
      ...local,
      id: uid,
      firebaseUid: uid,
      ...(email ? { email } : {}),
    };
  }
  const now = new Date().toISOString();
  return {
    id: uid,
    firebaseUid: uid,
    walletAddress: walletId(),
    username: randomUsername(),
    seedPhrase: generateMnemonic(),
    email: (emailFromAuth ?? "").toLowerCase() || undefined,
    createdAt: now,
    joinDate: now,
  };
}

export async function persistFirebaseEmailProfile(user: UserProfile): Promise<void> {
  const uid = user.firebaseUid ?? user.id;
  await setDoc(doc(firestore, USERS, uid), firestoreUserPayload({ ...user, id: uid, firebaseUid: uid }), {
    merge: true,
  });
}
