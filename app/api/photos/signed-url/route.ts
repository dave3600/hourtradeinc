import { NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const { storagePath } = await req.json().catch(() => ({}));
  if (!storagePath || !adminStorage) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const expiresAt = Date.now() + 1000 * 60 * 60 * 6;
  const file = adminStorage.bucket().file(String(storagePath));
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: expiresAt,
  });

  return NextResponse.json({
    ok: true,
    storageUrl: signedUrl,
    signedUrlExpiresAt: expiresAt,
  });
}
