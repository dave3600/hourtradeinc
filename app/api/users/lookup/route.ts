import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminApp, adminDb } from "@/lib/firebase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function bearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m?.[1]?.trim() || null;
}

function payloadFromDoc(docId: string, d: Record<string, unknown>) {
  const walletAddress = typeof d.walletAddress === "string" ? d.walletAddress : "";
  if (!walletAddress) return null;
  return { found: true as const, walletAddress, userId: docId };
}

export async function GET(req: Request) {
  const token = bearerToken(req);
  if (!token || !adminApp || !adminDb) {
    return NextResponse.json({ found: false, reason: "admin_or_auth" }, { status: 503 });
  }
  try {
    await getAuth(adminApp).verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ found: false });
  }

  const db = adminDb;
  const qs = q.toLowerCase();

  if (EMAIL_RE.test(q)) {
    const snap = await db.collection("users").where("email", "==", qs).limit(5).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const out = payloadFromDoc(doc.id, doc.data() as Record<string, unknown>);
      if (out) return NextResponse.json(out);
    }
    return NextResponse.json({ found: false });
  }

  if (/^0x[a-fA-F0-9]{40}$/i.test(q)) {
    const ql = q.toLowerCase();
    let snap = await db.collection("users").where("walletAddress", "==", ql).limit(1).get();
    if (snap.empty) {
      snap = await db.collection("users").where("walletLower", "==", ql).limit(1).get();
    }
    if (!snap.empty) {
      const doc = snap.docs[0];
      const out = payloadFromDoc(doc.id, doc.data() as Record<string, unknown>);
      if (out) return NextResponse.json(out);
    }
    return NextResponse.json({ found: false });
  }

  let snap = await db.collection("users").where("usernameLower", "==", qs).limit(1).get();
  if (snap.empty) {
    snap = await db.collection("users").where("username", "==", q).limit(1).get();
  }
  if (!snap.empty) {
    const doc = snap.docs[0];
    const out = payloadFromDoc(doc.id, doc.data() as Record<string, unknown>);
    if (out) return NextResponse.json(out);
  }

  return NextResponse.json({ found: false });
}

