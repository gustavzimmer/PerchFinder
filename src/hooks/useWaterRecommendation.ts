import { Accessor, createEffect, createSignal } from "solid-js";

export type WaterStatsPayload = {
  waterName: string;
  totalCatches: number;
  commonLures: string[];
  bestTimeOfDay: string;
  avgTempC: number | null;
  commonWeather: string | null;
  avgPressureHpa: number | null;
};

const useWaterRecommendation = (stats: Accessor<WaterStatsPayload | null>) => {
  const [recommendation, setRecommendation] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let lastSignature = "";

  createEffect(() => {
    const s = stats();
    if (!s) return;

    const signature = JSON.stringify(s);
    if (signature === lastSignature) return;
    lastSignature = signature;

    const fetchRecommendation = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("https://getwaterrecommendation-bcdwkmqjia-uc.a.run.app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stats: s }),
        });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const json = await res.json();
        setRecommendation(json.recommendation ?? "");
      } catch (err) {
        console.error("AI recommendation error", err);
        setError("Kunde inte hämta rekommendation just nu.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecommendation();
  });

  return {
    recommendation,
    isLoading,
    error,
  };
};

export default useWaterRecommendation;
