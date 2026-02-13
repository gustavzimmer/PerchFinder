export interface LureOption {
  id: string;
  name: string;
  type: string;
  brand: string;
  size: string;
  color: string;
}

export interface Catch {
  _id?: string;
  id?: string;
  waterId: string;
  weightG?: number | null;
  lengthCm?: number | null;
  notes?: string | null;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
  lure?: LureOption | null;
  weatherCode: number | null;
  weatherSummary?: string | null;
  temperatureC: number | null;
  pressureHpa: number | null;
  caughtAt: string; 
  createdAt?: unknown;
  userId?: string | null;
  userEmail?: string | null;
}

export type CatchInput = Omit<Catch, "id" | "createdAt">;
