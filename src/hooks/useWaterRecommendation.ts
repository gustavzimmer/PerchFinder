import { createSignal } from "solid-js";

export type WaterStatsPayload = {
  waterName: string;
  totalCatches: number;
  general: {
    topLures: string[];
    topLureTypes: string[];
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
    topLureTypes: string[];
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
      const res = await fetch("https://getwaterrecommendation-bcdwkmqjia-uc.a.run.app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats }),
      });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const json = await res.json();
      const nextRecommendation = json.recommendation ?? "";
      setRecommendation(nextRecommendation);
      return nextRecommendation as string;
    } catch (err) {
      console.error("AI recommendation error", err);
      setError("Kunde inte hämta rekommendation just nu.");
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
