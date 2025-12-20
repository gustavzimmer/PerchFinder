export interface Catch {
  id?: string;
  waterId: string;
  weightG?: number | null;
  lengthCm?: number | null;
  notes?: string | null;
  photoUrl?: string | null;
  weatherCode: number | null;
  weatherSummary?: string | null;
  temperatureC: number | null;
  pressureHpa: number | null;
  caughtAt: string; 
  createdAt?: unknown;
  userId?: string | null;
}

export type CatchInput = Omit<Catch, "id" | "createdAt">;
