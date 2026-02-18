import { Component, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import useGetCatches from "../hooks/useGetCatches";
import useWaterRecommendation, { WaterStatsPayload } from "../hooks/useWaterRecommendation";
import type { Catch } from "../types/Catch.types";
import type { geoLocation } from "../types/Map.types";

type Props = {
  waterId: string;
  waterName?: string;
  waterLocation?: geoLocation;
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

const average = (values: number[]) => {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const incrementCount = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] || 0) + 1;
};

const topLabels = (map: Record<string, number>, limit = 3) =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label]) => label);

const lureLabel = (item: Catch) => {
  if (!item.lure) return null;
  const parts = [item.lure.brand, item.lure.name, item.lure.color].filter(Boolean);
  return parts.join(" ").trim() || "Okänt bete";
};

const lureCategoryLabel = (item: Catch) => {
  const category = item.lure?.category?.trim();
  if (category) return category;
  const legacyType = item.lure?.type?.trim();
  return legacyType || null;
};

const normalizeMethod = (item: Catch) => {
  const method = item.method?.trim();
  return method ? method : null;
};

const isJigLure = (item: Catch) => {
  const category = item.lure?.category?.toLowerCase() ?? "";
  const type = item.lure?.type?.toLowerCase() ?? "";
  return category.includes("jigg") || type.includes("jigg");
};

const fetchCurrentConditions = async (location: geoLocation) => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lng}&current=temperature_2m,weather_code,surface_pressure&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Current weather request failed");
  const json = await res.json();
  const current = json.current ?? json.current_weather;
  if (!current) return null;

  const weatherCode =
    typeof current.weather_code === "number"
      ? current.weather_code
      : typeof current.weathercode === "number"
        ? current.weathercode
        : null;
  const observedAtIso = typeof current.time === "string" ? current.time : new Date().toISOString();

  return {
    observedAtIso,
    weatherSummary: mapWeatherCode(weatherCode),
    weatherCode,
    temperatureC:
      typeof current.temperature_2m === "number"
        ? current.temperature_2m
        : typeof current.temperature === "number"
          ? current.temperature
          : null,
    pressureHpa: typeof current.surface_pressure === "number" ? current.surface_pressure : null,
    timeOfDay: timeBucket(observedAtIso),
  };
};

const buildSimilarWhenLikeNow = (
  list: Catch[],
  currentConditions: NonNullable<WaterStatsPayload["currentConditions"]> | null
): WaterStatsPayload["similarWhenLikeNow"] => {
  if (!currentConditions) return null;

  const comparable = list.filter(
    (item) =>
      item.temperatureC !== null ||
      item.pressureHpa !== null ||
      item.weatherCode !== null
  );
  if (comparable.length === 0) {
    return {
      comparedCatchCount: 0,
      matchedCatchCount: 0,
      topLures: [],
      topLureCategories: [],
      topMethods: [],
      topJigMethods: [],
      topTimesOfDay: [],
      commonWeather: null,
      avgTempC: null,
      avgPressureHpa: null,
    };
  }

  const scored = comparable.map((item) => {
    const tempDelta =
      currentConditions.temperatureC !== null && item.temperatureC !== null
        ? Math.abs(item.temperatureC - currentConditions.temperatureC)
        : 6;
    const pressureDelta =
      currentConditions.pressureHpa !== null && item.pressureHpa !== null
        ? Math.abs(item.pressureHpa - currentConditions.pressureHpa)
        : 16;
    const weatherPenalty =
      currentConditions.weatherCode !== null &&
      item.weatherCode !== null &&
      currentConditions.weatherCode !== item.weatherCode
        ? 8
        : 0;
    const timePenalty = timeBucket(item.caughtAt) === currentConditions.timeOfDay ? 0 : 4;
    const score = tempDelta + pressureDelta / 4 + weatherPenalty + timePenalty;
    return { item, score };
  });

  const matched = scored
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.min(12, Math.max(5, Math.ceil(comparable.length * 0.35))))
    .map((entry) => entry.item);

  const lureCount: Record<string, number> = {};
  const lureCategoryCount: Record<string, number> = {};
  const methodCount: Record<string, number> = {};
  const jigMethodCount: Record<string, number> = {};
  const timeCount: Record<string, number> = {};
  const weatherCount: Record<string, number> = {};
  const temps: number[] = [];
  const pressures: number[] = [];

  matched.forEach((item) => {
    const lure = lureLabel(item);
    if (lure) incrementCount(lureCount, lure);
    const lureCategory = lureCategoryLabel(item);
    if (lureCategory) incrementCount(lureCategoryCount, lureCategory);

    const method = normalizeMethod(item);
    if (method) {
      incrementCount(methodCount, method);
      if (isJigLure(item)) {
        incrementCount(jigMethodCount, method);
      }
    }

    incrementCount(timeCount, timeBucket(item.caughtAt));

    const weather = item.weatherSummary || mapWeatherCode(item.weatherCode);
    if (weather) incrementCount(weatherCount, weather);

    if (item.temperatureC !== null && item.temperatureC !== undefined) temps.push(item.temperatureC);
    if (item.pressureHpa !== null && item.pressureHpa !== undefined) pressures.push(item.pressureHpa);
  });

  const avgTemp = average(temps);
  const avgPressure = average(pressures);

  return {
    comparedCatchCount: comparable.length,
    matchedCatchCount: matched.length,
      topLures: topLabels(lureCount, 3),
      topLureCategories: topLabels(lureCategoryCount, 3),
      topMethods: topLabels(methodCount, 3),
      topJigMethods: topLabels(jigMethodCount, 3),
      topTimesOfDay: topLabels(timeCount, 2),
      commonWeather: topLabels(weatherCount, 1)[0] ?? null,
      avgTempC: avgTemp === null ? null : Number(avgTemp.toFixed(1)),
    avgPressureHpa: avgPressure === null ? null : Number(avgPressure.toFixed(0)),
  };
};

const WaterRecommendationsComponent: Component<Props> = (props) => {
  const catches = useGetCatches(() => props.waterId ?? "");
  const [hasCachedRecommendation, setHasCachedRecommendation] = createSignal(false);

  const stats = createMemo<WaterStatsPayload | null | undefined>(() => {
    const list = catches.data();
    if (!list) return undefined;
    if (list.length === 0) return null;

    const lureCount: Record<string, number> = {};
    const lureCategoryCount: Record<string, number> = {};
    const methodCount: Record<string, number> = {};
    const jigMethodCount: Record<string, number> = {};
    const timeCount: Record<string, number> = {};
    const weatherCount: Record<string, number> = {};
    const temps: number[] = [];
    const pressures: number[] = [];

    list.forEach((item) => {
      const lure = lureLabel(item);
      if (lure) incrementCount(lureCount, lure);
      const lureCategory = lureCategoryLabel(item);
      if (lureCategory) incrementCount(lureCategoryCount, lureCategory);

      const method = normalizeMethod(item);
      if (method) {
        incrementCount(methodCount, method);
        if (isJigLure(item)) {
          incrementCount(jigMethodCount, method);
        }
      }

      incrementCount(timeCount, timeBucket(item.caughtAt));

      const weather =
        item.weatherSummary ||
        mapWeatherCode(item.weatherCode) ||
        (item.weatherCode !== null && item.weatherCode !== undefined
          ? `Kod ${item.weatherCode}`
          : "Okänt");
      incrementCount(weatherCount, weather);

      if (item.temperatureC !== null && item.temperatureC !== undefined) temps.push(item.temperatureC);
      if (item.pressureHpa !== null && item.pressureHpa !== undefined) pressures.push(item.pressureHpa);
    });

    const avgTemp = average(temps);
    const avgPressure = average(pressures);
    const bestTimeOfDay = topLabels(timeCount, 1)[0] ?? "okänt";
    const commonWeather = topLabels(weatherCount, 1)[0] ?? null;

    return {
      waterName: props.waterName || "Okänt vatten",
      totalCatches: list.length,
      general: {
        topLures: topLabels(lureCount, 4),
        topLureCategories: topLabels(lureCategoryCount, 4),
        topMethods: topLabels(methodCount, 4),
        topJigMethods: topLabels(jigMethodCount, 4),
        bestTimeOfDay,
        avgTempC: avgTemp === null ? null : Number(avgTemp.toFixed(1)),
        commonWeather,
        avgPressureHpa: avgPressure === null ? null : Number(avgPressure.toFixed(0)),
      },
      currentConditions: null,
      similarWhenLikeNow: null,
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
    window.addEventListener("perchfinder:catch-saved", handler);
    onCleanup(() => {
      window.removeEventListener("perchfinder:catch-saved", handler);
    });
  });

  const canRequest = () => {
    const currentStats = stats();
    return !!currentStats && !hasCachedRecommendation();
  };

  const handleRequestRecommendation = async () => {
    if (!canRequest()) return;
    const baseStats = stats();
    const signature = statsSignature();
    if (!baseStats || !signature) return;

    let payload: WaterStatsPayload = baseStats;

    if (props.waterLocation) {
      try {
        const currentConditions = await fetchCurrentConditions(props.waterLocation);
        payload = {
          ...baseStats,
          currentConditions,
          similarWhenLikeNow: buildSimilarWhenLikeNow(catches.data() ?? [], currentConditions),
        };
      } catch (err) {
        console.warn("Kunde inte hämta aktuellt väder för rekommendation", err);
      }
    }

    const nextRecommendation = await fetchRecommendation(payload);
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
      <Show
        when={catches.isLoading()}
        fallback={
          <Show
            when={stats()}
            fallback={<div class="ai-reco-summary">Registrera en fångst för att få rekommendation.</div>}
          >
            <div class="ai-reco-summary">Baserat på {stats()!.totalCatches} fångster.</div>
          </Show>
        }
      >
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
      <div class="ai-reco__box">{recommendationText()}</div>
    </section>
  );
};

export default WaterRecommendationsComponent;
