import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { adminStorage } from "@/lib/firebase/admin";

export async function POST(req: Request) {
  const { userId, jobId, elapsedMs, imageDataUrl, location } = await req.json().catch(() => ({}));
  const dataUrl =
    imageDataUrl ??
    ("data:image/svg+xml;base64," +
      Buffer.from(
        `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='100%' height='100%' fill='#0f172a'/><text x='20' y='90' fill='#22d3ee'>hOurTrade capture ${Date.now()}</text></svg>`,
      ).toString("base64"));
  const hash = createHash("sha256").update(dataUrl).digest("hex");
  const id = `photo_${Date.now()}`;
  let storagePath: string | null = null;
  let storageUrl: string | null = null;
  let signedUrlExpiresAt: number | null = null;

  if (adminStorage && dataUrl.startsWith("data:image/")) {
    const [meta, encoded] = dataUrl.split(",");
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mimeType = mimeMatch?.[1] ?? "image/jpeg";
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const path = `jobPhotos/${jobId ?? "unknown"}/${id}.${ext}`;
    const file = adminStorage.bucket().file(path);
    await file.save(Buffer.from(encoded, "base64"), {
      contentType: mimeType,
      resumable: false,
    });
    storagePath = path;
    signedUrlExpiresAt = Date.now() + 1000 * 60 * 60 * 6;
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: signedUrlExpiresAt,
    });
    storageUrl = signedUrl;
  }

  if (adminDb && userId && jobId) {
    await adminDb.collection("job_photos").doc(id).set({
      id,
      userId,
      jobId,
      elapsedMs: Number(elapsedMs ?? 0),
      hash,
      storagePath,
      storageUrl,
      signedUrlExpiresAt,
      location: location ?? "unknown",
      createdAt: Date.now(),
    });
  }
  return NextResponse.json({
    id,
    dataUrl,
    hash,
    storagePath,
    storageUrl,
    signedUrlExpiresAt,
  });
}
