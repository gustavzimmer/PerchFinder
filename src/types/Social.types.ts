export type DailyBucket = "30" | "35" | "40" | "45" | "50+";

export interface SocialProfile {
  uid: string;
  displayName: string;
  displayNameLower: string;
  photoURL?: string | null;
  friends?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FriendRequest {
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL?: string | null;
  toUid: string;
  toDisplayName: string;
  createdAtMs: number;
  createdAt?: unknown;
}

export interface DailyCatchEvent {
  userId: string;
  userDisplayName: string;
  userPhotoURL?: string | null;
  bucket: DailyBucket;
  delta: 1 | -1;
  createdAtMs: number;
  expiresAtMs: number;
  createdAt?: unknown;
}

export interface UsernameIndex {
  uid: string;
  displayName: string;
  displayNameLower: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminProfile {
  uid: string;
  email?: string | null;
  createdAt?: unknown;
}
