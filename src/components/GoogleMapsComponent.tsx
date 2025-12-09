import { Component, createEffect, createSignal, onMount } from "solid-js";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { geoLocation } from "../types/Map.types";

type MapsLib = Awaited<ReturnType<typeof importLibrary<"maps">>>;
type GeocodingLib = Awaited<ReturnType<typeof importLibrary<"geocoding">>>;
type PlacesLib = Awaited<ReturnType<typeof importLibrary<"places">>>;

const ApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
let hasConfiguredLoader = false;

interface Props {
  userLocation: geoLocation | null;
}

const GoogleMap: Component<Props> = (props) => {
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [query, setQuery] = createSignal("");
  const [searchError, setSearchError] = createSignal<string | null>(null);

  let mapContainer!: HTMLDivElement;
  type MapInstance = InstanceType<MapsLib["Map"]>;
  let map: MapInstance | null = null;
  let geocoder: InstanceType<GeocodingLib["Geocoder"]> | null = null;
  let autocomplete: InstanceType<PlacesLib["Autocomplete"]> | null = null;
  let searchInput!: HTMLInputElement;
  const defaultCenter = { lat: 59.3293, lng: 18.0686 }; // Stockholm

  const initializeMap = async () => {
    if (!ApiKey) {
      setError("Saknar GOOGLE_MAPS_API_KEY i miljövariablerna.");
      setIsLoading(false);
      return;
    }

    try {
        /* JS api loader settings */
      if (!hasConfiguredLoader) {
        setOptions({
          key: ApiKey,
          v: "weekly",
          language: "sv",
          libraries: ["geocoding", "places"],
        });
        hasConfiguredLoader = true;
      }

      const [{ Map }, { Geocoder }, { Autocomplete }] = await Promise.all([
        importLibrary("maps") as Promise<MapsLib>,
        importLibrary("geocoding") as Promise<GeocodingLib>,
        importLibrary("places") as Promise<PlacesLib>,
      ]);
      /* Map settings */
      map = new Map(mapContainer, {
        center: props.userLocation ?? defaultCenter,
        zoom: 9,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        gestureHandling: "greedy",
      });

      geocoder = new Geocoder();
      if (searchInput) {
        autocomplete = new Autocomplete(searchInput, {
          fields: ["geometry", "formatted_address", "name"],
          types: ["geocode"],
        });

        autocomplete.addListener("place_changed", () => {
          const currentMap = map;
          if (!autocomplete || !currentMap) return;
          const place = autocomplete.getPlace();
          const loc = place.geometry?.location;

          if (loc) {
            currentMap.setCenter({ lat: loc.lat(), lng: loc.lng() });
            currentMap.setZoom(13);
            setQuery(place.formatted_address || place.name || "");
            setSearchError(null);
          } else {
            setSearchError("Hittade ingen plats för den sökningen.");
          }
        });
      }
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

  createEffect(() => {
    const loc = props.userLocation;
    const currentMap = map;
    if (currentMap && loc) {
      currentMap.setCenter(loc);
      currentMap.setZoom(13);
    }
  });

  const searchAndCenter = (event: Event) => {
    event.preventDefault();
    const value = query().trim();
    const currentMap = map;
    if (!value || !currentMap || !geocoder) return;
    setSearchError(null);

    geocoder.geocode({ address: value }, (results, status) => {
      if (status === "OK" && results && results[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        currentMap.setCenter({ lat: loc.lat(), lng: loc.lng() });
        currentMap.setZoom(13);
      } else {
        setSearchError("Hittade ingen plats för den sökningen.");
      }
    });
  };

  return (
    <section class="map-shell">
        {/* Searchbar */}
      <form class="map-search" onSubmit={searchAndCenter}>
        <input
          type="search"
          placeholder={'Sök plats, t.ex. "Stockholm"'}
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          ref={searchInput}
        />
        <button type="submit">Sök</button>
      </form>
      {searchError() && <div class="map-search__error">{searchError()}</div>}

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
