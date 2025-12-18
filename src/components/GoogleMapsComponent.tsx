import { Component, createEffect, createSignal, onMount } from "solid-js";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { geoLocation, WaterLocation } from "../types/Map.types";
import useGetWaters from "../hooks/useGetWaters";
import WaterMarkerComponent from "./WaterMarkerComponent";

type MapsLib = Awaited<ReturnType<typeof importLibrary<"maps">>>;
type GeocodingLib = Awaited<ReturnType<typeof importLibrary<"geocoding">>>;
type PlacesLib = Awaited<ReturnType<typeof importLibrary<"places">>>;
type MarkerLib = Awaited<ReturnType<typeof importLibrary<"marker">>>;

const ApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
let hasConfiguredLoader = false;

interface Props {
  userLocation: geoLocation | null;
}

const GoogleMap: Component<Props> = (props) => {
  const [waters, setWaters] = createSignal<WaterLocation[] | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [query, setQuery] = createSignal("");
  const [searchError, setSearchError] = createSignal<string | null>(null);

  const watersData = useGetWaters();
  let mapContainer!: HTMLDivElement;
  type MapInstance = InstanceType<MapsLib["Map"]>;
  const [mapRef, setMapRef] = createSignal<MapInstance | null>(null);
  let geocoder: InstanceType<GeocodingLib["Geocoder"]> | null = null;
  let autocomplete: InstanceType<PlacesLib["Autocomplete"]> | null = null;
  let searchInput!: HTMLInputElement;
  const defaultCenter = { lat: 59.3293, lng: 18.0686 }; // Stockholm
  const [markerLib, setMarkerLib] = createSignal<MarkerLib | null>(null);

  createEffect(() => {
    const fetchedWaters = watersData.data();
    if (fetchedWaters) {
      setWaters(fetchedWaters);
    }
  });

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
          libraries: ["geocoding", "places", "marker"],
        });
        hasConfiguredLoader = true;
      }

      const [{ Map }, { Geocoder }, { Autocomplete }, markerLibrary] = await Promise.all([
        importLibrary("maps") as Promise<MapsLib>,
        importLibrary("geocoding") as Promise<GeocodingLib>,
        importLibrary("places") as Promise<PlacesLib>,
        importLibrary("marker") as Promise<MarkerLib>,
      ]);
      setMarkerLib(markerLibrary);

      /* Map settings */
      const mapInstance = new Map(mapContainer, {
        center: props.userLocation ?? defaultCenter,
        zoom: 9,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        mapId: MapId,
        gestureHandling: "greedy",
      });
      setMapRef(mapInstance);

      geocoder = new Geocoder();
      if (searchInput) {
        autocomplete = new Autocomplete(searchInput, {
          fields: ["geometry", "formatted_address", "name"],
          types: ["geocode"],
        });

        autocomplete.addListener("place_changed", () => {
          const currentMap = mapInstance;
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
    const currentMap = mapRef();
    if (currentMap && loc) {
      currentMap.setCenter(loc);
      currentMap.setZoom(13);
    }
  });

  const searchAndCenter = (event: Event) => {
    event.preventDefault();
    const value = query().trim();
    const currentMap = mapRef();
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
        <WaterMarkerComponent map={mapRef} markerLib={markerLib} waters={waters} />
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
