export interface Catch {
  id?: string;
  waterId: string;
  weightG?: number | null;
  lengthCm?: number | null;
  notes?: string | null;
  photoUrl?: string | null;
  caughtAt: string; // ISO date string
  createdAt?: unknown; // Firestore timestamp when read back
  userId?: string | null;
}

export type CatchInput = Omit<Catch, "id" | "createdAt">;
