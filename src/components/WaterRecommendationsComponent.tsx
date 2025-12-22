
import { Component, Show, createMemo } from "solid-js";
import useGetCatches from "../hooks/useGetCatches";
import useWaterRecommendation, { WaterStatsPayload } from "../hooks/useWaterRecommendation";

type Props = {
  waterId: string;
  waterName?: string;
};

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

  const stats = createMemo<WaterStatsPayload | null>(() => {
    const list = catches.data();
    if (!list || list.length === 0) return null;

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

  const { recommendation, isLoading, error } = useWaterRecommendation(() => stats());

  return (
    <section class="ai-recommendation">
      <h2>Rekommendation</h2>
      <Show
        when={catches.isLoading()}
        fallback={<div class="ai-reco-summary">Baserat på {stats()?.totalCatches ?? catches.data()?.length ?? 0} fångster.</div>}
      >
        <div>Laddar fångster...</div>
      </Show>
      {error() && <div class="form-status error">{error()}</div>}
      <div class="ai-reco__box">
        {isLoading() ? "Hämtar rekommendation..." : recommendation() || "Ingen rekommendation än."}
      </div>
    </section>
  );
};

export default WaterRecommendationsComponent;
