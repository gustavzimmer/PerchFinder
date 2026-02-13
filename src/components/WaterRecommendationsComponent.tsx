
import { Component, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import useGetCatches from "../hooks/useGetCatches";
import useWaterRecommendation, { WaterStatsPayload } from "../hooks/useWaterRecommendation";

type Props = {
  waterId: string;
  waterName?: string;
};

type CachedRecommendation = {
  signature: string;
  recommendation: string;
  savedAt: string;
};

const RECOMMENDATION_CACHE_PREFIX = "perchfinder:water-reco:";

const mapWeatherCode = (code: number | null | undefined) => {
  switch (code) {
    case 0:
      return "Klart";
    case 1:
    case 2:
      return "Mest klart";
    case 3:
      return "Molnigt";
    case 45:
    case 48:
      return "Dimmigt";
    case 51:
    case 53:
    case 55:
      return "Duggregn";
    case 56:
    case 57:
      return "Underkylt duggregn";
    case 61:
    case 63:
    case 65:
      return "Regn";
    case 66:
    case 67:
      return "Underkylt regn";
    case 71:
    case 73:
    case 75:
      return "Snöfall";
    case 77:
      return "Snökorn";
    case 80:
    case 81:
    case 82:
      return "Skurar";
    case 85:
    case 86:
      return "Snöbyar";
    case 95:
    case 96:
    case 99:
      return "Åska";
    default:
      return null;
  }
};

const timeBucket = (iso: string) => {
  const hour = new Date(iso).getHours();
  if (hour >= 5 && hour < 10) return "Morgon";
  if (hour >= 10 && hour < 16) return "Dag";
  if (hour >= 16 && hour < 22) return "Kväll";
  return "Natt";
};

const WaterRecommendationsComponent: Component<Props> = (props) => {
  const catches = useGetCatches(() => props.waterId ?? "");
  const [hasCachedRecommendation, setHasCachedRecommendation] = createSignal(false);

  const stats = createMemo<WaterStatsPayload | null | undefined>(() => {
    const list = catches.data();
    if (!list) return undefined;
    if (list.length === 0) return null;

    const totalCatches = list.length;

    const lureCount: Record<string, { label: string; count: number }> = {};
    list.forEach((item) => {
      if (item.lure) {
        const key = item.lure.id || `${item.lure.brand}-${item.lure.name}`;
        const label = `${item.lure.brand} ${item.lure.name} (${item.lure.color})`;
        if (!lureCount[key]) lureCount[key] = { label, count: 0 };
        lureCount[key].count += 1;
      }
    });
    const commonLures = Object.values(lureCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((l) => l.label);

    const timeCount: Record<string, number> = {};
    list.forEach((item) => {
      const bucket = timeBucket(item.caughtAt);
      timeCount[bucket] = (timeCount[bucket] || 0) + 1;
    });
    const bestTimeOfDay =
      Object.entries(timeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "okänt";

    const temps = list.map((c) => c.temperatureC).filter((t): t is number => t !== null && t !== undefined);
    const avgTempC = temps.length ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : null;

    const pressures = list
      .map((c) => c.pressureHpa)
      .filter((p): p is number => p !== null && p !== undefined);
    const avgPressureHpa = pressures.length
      ? Number((pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(0))
      : null;

    const weatherCount: Record<string, number> = {};
    list.forEach((item) => {
      const label =
        item.weatherSummary ||
        mapWeatherCode(item.weatherCode) ||
        (item.weatherCode !== null && item.weatherCode !== undefined
          ? `Kod ${item.weatherCode}`
          : "Okänt");
      weatherCount[label] = (weatherCount[label] || 0) + 1;
    });
    const commonWeather =
      Object.entries(weatherCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      waterName: props.waterName || "Okänt vatten",
      totalCatches,
      commonLures,
      bestTimeOfDay,
      avgTempC,
      commonWeather,
      avgPressureHpa,
    };
  });

  const {
    recommendation,
    setCachedRecommendation,
    isLoading,
    error,
    fetchRecommendation,
    reset,
  } = useWaterRecommendation();

  const statsSignature = createMemo<string | null>(() => {
    const currentStats = stats();
    if (currentStats === undefined) return null;
    if (currentStats === null) return "";
    return JSON.stringify(currentStats);
  });

  const getStorageKey = () => {
    if (!props.waterId) return "";
    return `${RECOMMENDATION_CACHE_PREFIX}${props.waterId}`;
  };

  const readCachedRecommendation = () => {
    if (typeof window === "undefined") return null;
    const key = getStorageKey();
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedRecommendation;
    } catch (err) {
      console.warn("Kunde inte läsa AI-rekommendation från cache", err);
      return null;
    }
  };

  const writeCachedRecommendation = (signature: string, recommendationText: string) => {
    if (typeof window === "undefined") return;
    const key = getStorageKey();
    if (!key) return;
    try {
      const payload: CachedRecommendation = {
        signature,
        recommendation: recommendationText,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (err) {
      console.warn("Kunde inte spara AI-rekommendation", err);
    }
  };

  const clearCachedRecommendation = () => {
    if (typeof window === "undefined") return;
    const key = getStorageKey();
    if (!key) return;
    window.localStorage.removeItem(key);
  };

  createEffect(() => {
    const signature = statsSignature();
    if (signature === null) return;

    if (!signature) {
      clearCachedRecommendation();
      setHasCachedRecommendation(false);
      reset();
      return;
    }

    const cached = readCachedRecommendation();
    if (cached && cached.signature === signature) {
      setCachedRecommendation(cached.recommendation);
      setHasCachedRecommendation(true);
      return;
    }

    clearCachedRecommendation();
    setHasCachedRecommendation(false);
    reset();
  });

  onMount(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ waterId?: string }>).detail;
      if (!detail?.waterId || detail.waterId !== props.waterId) return;
      clearCachedRecommendation();
      setHasCachedRecommendation(false);
      reset();
    };
    window.addEventListener("perchfinder:catch-saved", handler as EventListener);
    onCleanup(() => {
      window.removeEventListener("perchfinder:catch-saved", handler as EventListener);
    });
  });

  const canRequest = () => {
    const currentStats = stats();
    return !!currentStats && !hasCachedRecommendation();
  };

  const handleRequestRecommendation = async () => {
    if (!canRequest()) return;
    const currentStats = stats();
    const signature = statsSignature();
    if (!currentStats || !signature) return;
    const nextRecommendation = await fetchRecommendation(currentStats);
    if (nextRecommendation === null) return;
    writeCachedRecommendation(signature, nextRecommendation);
    setHasCachedRecommendation(true);
  };

  const recommendationText = createMemo(() => {
    if (isLoading()) return "Hämtar rekommendation...";
    const currentRecommendation = recommendation();
    if (currentRecommendation !== null) {
      return currentRecommendation || "Ingen rekommendation än.";
    }
    const currentStats = stats();
    if (currentStats === undefined) return "Väntar på fångster...";
    if (currentStats === null) return "Registrera en fångst för att få rekommendation.";
    return "Klicka på \"Få rekommendation!\" för att hämta en.";
  });

  return (
    <section class="ai-recommendation">
      <h2>Rekommendation</h2>
      <Show when={catches.isLoading()} fallback={
        <Show
          when={stats()}
          fallback={<div class="ai-reco-summary">Registrera en fångst för att få rekommendation.</div>}
        >
          <div class="ai-reco-summary">Baserat på {stats()!.totalCatches} fångster.</div>
        </Show>
      }>
        <div>Laddar fångster...</div>
      </Show>

      <Show when={canRequest()}>
        <button
          type="button"
          class="primary-button"
          onClick={handleRequestRecommendation}
          disabled={isLoading()}
        >
          {isLoading() ? "Hämtar..." : "Få rekommendation!"}
        </button>
      </Show>

      {error() && <div class="form-status error">{error()}</div>}
      <div class="ai-reco__box">
        {recommendationText()}
      </div>
    </section>
  );
};

export default WaterRecommendationsComponent;
