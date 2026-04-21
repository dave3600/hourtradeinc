export async function matchClip(data: { clipFingerprint: string }) {
  return { confidence: 0.9, clipFingerprint: data.clipFingerprint };
}
