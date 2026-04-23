import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminApp, adminDb } from "@/lib/firebase/admin";

const COLLECTION = "userStores";

function bearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m?.[1]?.trim() || null;
}

async function verifyUid(req: Request): Promise<{ uid: string } | NextResponse> {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization: Bearer <idToken>" }, { status: 401 });
  }
  if (!adminApp || !adminDb) {
    return NextResponse.json(
      { error: "Server Firebase Admin is not configured (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)." },
      { status: 503 },
    );
  }
  try {
    const auth = getAuth(adminApp);
    const decoded = await auth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

/** Read `userStores/{uid}` for the signed-in user (Admin SDK — not subject to Firestore rules). */
export async function GET(req: Request) {
  const v = await verifyUid(req);
  if (v instanceof NextResponse) return v;
  const snap = await adminDb!.collection(COLLECTION).doc(v.uid).get();
  if (!snap.exists) {
    return NextResponse.json({ exists: false });
  }
  return NextResponse.json({ exists: true, data: snap.data() ?? {} });
}

/** Replace-merge `userStores/{uid}` for the signed-in user. */
export async function POST(req: Request) {
  const v = await verifyUid(req);
  if (v instanceof NextResponse) return v;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const slice = (body as { slice?: Record<string, unknown> }).slice;
  if (!slice || typeof slice !== "object") {
    return NextResponse.json({ error: "Body must include { slice: { ... } }" }, { status: 400 });
  }
  const payload = {
    ...slice,
    updatedAt: Date.now(),
  };
  await adminDb!.collection(COLLECTION).doc(v.uid).set(payload, { merge: true });
  return NextResponse.json({ ok: true });
}
