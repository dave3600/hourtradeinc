export type UserProfile = {
  id: string;
  walletAddress: string;
  username: string;
  email?: string;
  /** Firebase Auth UID when this profile was created or linked via email (online). */
  firebaseUid?: string;
  /** Legacy single clip fingerprint from previous biometric flow. */
  biometricFingerprint?: string;
  /** Face fingerprint used as biometric account identifier (user id side). */
  biometricFaceFingerprint?: string;
  /** Recent face hashes for tolerance-based matching on this account. */
  biometricFaceHashes?: string[];
  /** Voice fingerprint used as biometric password (second factor). */
  biometricVoiceFingerprint?: string;
  /** Recent voice hashes for tolerance-based matching on this account. */
  biometricVoiceHashes?: string[];
  /** Manual password digest used with face-id sign-in mode. */
  biometricPasswordDigest?: string;
  /** Legacy: local-only email password digest. New email accounts use Firebase Auth instead. */
  emailPasswordDigest?: string;
  seedPhrase: string;
  createdAt: string;
  bio?: string;
  skills?: string;
  materials?: string;
  joinDate: string;
};

export type JobPhoto = {
  id: string;
  jobId: string;
  userId: string;
  timestamp: number;
  elapsedMs: number;
  dataUrl: string;
  storagePath?: string;
  storageUrl?: string;
  signedUrlExpiresAt?: number;
  hash: string;
  location?: string;
};

export type Job = {
  id: string;
  userId: string;
  startedAt: number;
  endedAt?: number;
  locationStart?: string;
  locationEnd?: string;
  elapsedMs: number;
  active: boolean;
  photoIds: string[];
};

export type Coin = {
  id: string;
  ownerId: string;
  ownerWallet: string;
  amountMs: number;
  bornAt: number;
  parentCoinId?: string;
  sourceJobId: string;
  photoIds: string[];
  status: "active" | "pending_review" | "transferred" | "cancelled";
  offlineOrigin?: boolean;
  votesWork?: number;
  votesNoWork?: number;
};

export type CoinTransfer = {
  id: string;
  senderId: string;
  recipientWallet: string;
  sourceCoinIds: string[];
  childCoinId: string;
  amountMs: number;
  status: "pending" | "accepted" | "denied" | "cancelled";
  createdAt: number;
};

export type Message = {
  id: string;
  fromWallet: string;
  toWallet: string;
  body: string;
  createdAt: number;
};

export type MarketplaceListing = {
  id: string;
  sellerWallet: string;
  title: string;
  description: string;
  priceMs: number;
  approxLocation: string;
  image?: string;
  createdAt: number;
};

export type OfflineEvent = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
};
