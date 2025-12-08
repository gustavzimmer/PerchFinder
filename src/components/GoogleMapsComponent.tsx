import { Component, createSignal, onMount } from "solid-js";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type MapsLib = Awaited<ReturnType<typeof importLibrary<"maps">>>;

const ApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
let hasConfiguredLoader = false;

const GoogleMap: Component = () => {
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);

  let mapContainer!: HTMLDivElement;

  const initializeMap = async () => {
    if (!ApiKey) {
      setError("Saknar VITE_GOOGLE_MAPS_API_KEY i miljövariablerna.");
      setIsLoading(false);
      return;
    }

    try {
      if (!hasConfiguredLoader) {
        setOptions({
          key: ApiKey,
          v: "weekly",
          language: "sv",
        });
        hasConfiguredLoader = true;
      }

      const { Map } = (await importLibrary("maps")) as MapsLib;

      new Map(mapContainer, {
        center: { lat: 59.3293, lng: 18.0686 },
        zoom: 9,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        gestureHandling: "greedy",
      });
    } catch (err) {
      console.error("Google Maps kunde inte laddas", err);
      setError("Kartan kunde inte laddas just nu. Försök igen senare.");
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    initializeMap();
  });

  return (
    <section class="map-shell">
      <div class="map-frame">
        <div ref={mapContainer} class="map-canvas" />

        {isLoading() && <div class="map-overlay">Laddar karta...</div>}

        {error() && (
          <div class="map-overlay">
            <div class="map-error">{error()}</div>
          </div>
        )}
      </div>
    </section>
  );
};

export default GoogleMap;
