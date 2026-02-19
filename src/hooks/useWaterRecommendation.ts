import { createSignal } from "solid-js";
import { auth } from "../firebase";

export type WaterStatsPayload = {
  waterName: string;
  totalCatches: number;
  general: {
    topLures: string[];
    topLureCategories: string[];
    topMethods: string[];
    topJigMethods: string[];
    bestTimeOfDay: string;
    avgTempC: number | null;
    commonWeather: string | null;
    avgPressureHpa: number | null;
  };
  currentConditions?: {
    observedAtIso: string;
    weatherSummary: string | null;
    weatherCode: number | null;
    temperatureC: number | null;
    pressureHpa: number | null;
    timeOfDay: string;
  } | null;
  similarWhenLikeNow?: {
    comparedCatchCount: number;
    matchedCatchCount: number;
    topLures: string[];
    topLureCategories: string[];
    topMethods: string[];
    topJigMethods: string[];
    topTimesOfDay: string[];
    commonWeather: string | null;
    avgTempC: number | null;
    avgPressureHpa: number | null;
  } | null;
};

const useWaterRecommendation = () => {
  const [recommendation, setRecommendation] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const fetchRecommendation = async (stats: WaterStatsPayload) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("unauthenticated");
      }
      const idToken = await user.getIdToken();

      const res = await fetch("https://getwaterrecommendation-bcdwkmqjia-uc.a.run.app", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ stats }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("unauthenticated");
        }
        if (res.status === 429) {
          throw new Error("rate-limit");
        }
        throw new Error(`Request failed: ${res.status}`);
      }
      const json = await res.json();
      const nextRecommendation = json.recommendation ?? "";
      setRecommendation(nextRecommendation);
      return nextRecommendation as string;
    } catch (err) {
      console.error("AI recommendation error", err);
      const code = err instanceof Error ? err.message : "";
      if (code === "unauthenticated") {
        setError("Logga in för att hämta AI-rekommendation.");
      } else if (code === "rate-limit") {
        setError("För många AI-anrop just nu. Vänta en stund och försök igen.");
      } else {
        setError("Kunde inte hämta rekommendation just nu.");
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const setCachedRecommendation = (value: string | null) => {
    setRecommendation(value);
    setError(null);
  };

  const reset = () => {
    setRecommendation(null);
    setError(null);
  };

  return {
    recommendation,
    setCachedRecommendation,
    isLoading,
    error,
    fetchRecommendation,
    reset,
  };
};

export default useWaterRecommendation;
