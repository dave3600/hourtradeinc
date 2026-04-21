"use client";

const VAULT_KEY = "hourtrade-seed-vault";

function toBase64(data: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(data)));
}

export async function saveSeedPhraseWithWebAuthn(seedPhrase: string) {
  if (!("credentials" in navigator)) {
    throw new Error("WebAuthn is not supported on this device");
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "hOurTrade" },
      user: {
        id: userId,
        name: "hourtrade-user",
        displayName: "hOurTrade User",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60000,
      attestation: "none",
    },
  });
  localStorage.setItem(VAULT_KEY, seedPhrase);
}

export async function unlockSeedPhraseWithWebAuthn() {
  if (!("credentials" in navigator)) {
    throw new Error("WebAuthn is not supported on this device");
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      timeout: 60000,
      userVerification: "preferred",
    },
  });
  return localStorage.getItem(VAULT_KEY) ?? "";
}

export function makeIdempotencyKey(eventId: string) {
  return `${eventId}:${toBase64(crypto.getRandomValues(new Uint8Array(12)).buffer)}`;
}
