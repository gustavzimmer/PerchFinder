import { Component, createEffect, createMemo, createSignal, onMount } from "solid-js";
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

const LocateIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="5" fill="none" />
    <path d="M12 2v3" fill="none" />
    <path d="M12 19v3" fill="none" />
    <path d="M2 12h3" fill="none" />
    <path d="M19 12h3" fill="none" />
  </svg>
);

interface Props {
  userLocation?: geoLocation | null;
  selectionMode?: boolean;
  selectedLocation?: geoLocation | null;
  onSelectLocation?: (loc: geoLocation) => void;
  visible?: boolean;
  showSearch?: boolean;
}

const GoogleMap: Component<Props> = (props) => {
  const [waters, setWaters] = createSignal<WaterLocation[] | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [watersError, setWatersError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [query, setQuery] = createSignal("");
  const [searchError, setSearchError] = createSignal<string | null>(null);
  const [internalUserLocation, setInternalUserLocation] = createSignal<geoLocation | null>(null);
  const [isSelectionMode, setIsSelectionMode] = createSignal(!!props.selectionMode);

  const watersData = useGetWaters();
  let mapContainer!: HTMLDivElement;
  type MapInstance = InstanceType<MapsLib["Map"]>;
  const [mapRef, setMapRef] = createSignal<MapInstance | null>(null);
  let geocoder: InstanceType<GeocodingLib["Geocoder"]> | null = null;
  let autocomplete: InstanceType<PlacesLib["Autocomplete"]> | null = null;
  let searchInput!: HTMLInputElement;
  const defaultCenter = { lat: 59.3293, lng: 18.0686 }; // Stockholm
  const [markerLib, setMarkerLib] = createSignal<MarkerLib | null>(null);
  type AdvancedMarker = InstanceType<MarkerLib["AdvancedMarkerElement"]>;
  let selectionMarker: AdvancedMarker | null = null;
  let userLocationMarker: AdvancedMarker | null = null;
  let hasInitialized = false;

  const effectiveUserLocation = createMemo(() => props.userLocation ?? internalUserLocation());
  const isVisible = createMemo(() => props.visible !== false);
  const shouldShowSearch = createMemo(() => props.showSearch !== false);

  createEffect(() => {
    const fetchedWaters = watersData.data();
    if (fetchedWaters) {
      setWaters(fetchedWaters);
    }
  });

  createEffect(() => {
    if (!watersData.error()) {
      setWatersError(null);
      return;
    }
    if (watersData.error() === "permission-denied") {
      setWatersError(
        "Firestore nekar läsning av vatten för denna användare. Sätt 'allow read: if true' på FiskeVatten."
      );
      return;
    }
    setWatersError(
      "Kunde inte hämta vatten från Firebase. Kontrollera Firestore-regler (read för FiskeVatten)."
    );
  });

  createEffect(() => {
    setIsSelectionMode(!!props.selectionMode);
    if (!props.selectionMode) {
      if (selectionMarker) {
        selectionMarker.map = null;
        selectionMarker = null;
      }
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
        center: effectiveUserLocation() ?? defaultCenter,
        zoom: 9,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        cameraControl: false,
        clickableIcons: false,
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

      mapInstance.addListener("click", (e: { latLng: { lat: () => number; lng: () => number } | null }) => {
        if (!isSelectionMode()) return;
        if (!e.latLng) return;
        const nextPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        props.onSelectLocation?.(nextPos);
      });
    } catch (err) {
      console.error("Google Maps kunde inte laddas", err);
      setError("Kartan kunde inte laddas just nu. Försök igen senare.");
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    if (!props.userLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setInternalUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          console.warn("GeoLocation not supported: ", err);
        }
      );
    }
  });

  createEffect(() => {
    if (!isVisible() || hasInitialized) return;
    hasInitialized = true;
    void initializeMap();
  });

  createEffect(() => {
    const loc = effectiveUserLocation();
    const currentMap = mapRef();
    if (currentMap && loc) {
      currentMap.setCenter(loc);
      currentMap.setZoom(13);
    }
  });

  createEffect(() => {
    const currentMap = mapRef();
    const currentMarkerLib = markerLib();
    const loc = props.selectedLocation ?? null;

    if (!currentMap || !currentMarkerLib) return;
    if (!isSelectionMode()) return;

    if (!loc) {
      if (selectionMarker) {
        selectionMarker.map = null;
        selectionMarker = null;
      }
      return;
    }

    if (!selectionMarker) {
      const { AdvancedMarkerElement } = currentMarkerLib;
      selectionMarker = new AdvancedMarkerElement({
        map: currentMap,
        position: loc,
        title: "Vald plats",
      });
    } else {
      selectionMarker.position = loc;
      selectionMarker.map = currentMap;
    }
  });

  createEffect(() => {
    const currentMap = mapRef();
    const currentMarkerLib = markerLib();
    const loc = effectiveUserLocation();

    if (!currentMap || !currentMarkerLib) return;

    if (!loc) {
      if (userLocationMarker) {
        userLocationMarker.map = null;
        userLocationMarker = null;
      }
      return;
    }

    if (!userLocationMarker) {
      const { AdvancedMarkerElement } = currentMarkerLib;
      const markerContent = document.createElement("div");
      markerContent.className = "map-user-marker";

      userLocationMarker = new AdvancedMarkerElement({
        map: currentMap,
        position: loc,
        title: "Din position",
        content: markerContent,
      });
      return;
    }

    userLocationMarker.position = loc;
    userLocationMarker.map = currentMap;
  });

  createEffect(() => {
    if (!isVisible()) return;
    const currentMap = mapRef();
    if (!currentMap) return;
    const center = currentMap.getCenter();
    if (center) {
      currentMap.setCenter(center);
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

  const centerToUserLocation = () => {
    const currentMap = mapRef();
    if (!currentMap) return;

    const knownLocation = effectiveUserLocation();
    if (knownLocation) {
      currentMap.setCenter(knownLocation);
      currentMap.setZoom(13);
      setSearchError(null);
      return;
    }

    if (!navigator.geolocation) {
      setSearchError("Din enhet saknar stöd för platsdelning.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setInternalUserLocation(loc);
        currentMap.setCenter(loc);
        currentMap.setZoom(13);
        setSearchError(null);
      },
      () => {
        setSearchError("Kunde inte hämta din position.");
      }
    );
  };

  return (
    <section class={`map-shell ${isVisible() ? "" : "is-hidden"}`}>
        {/* Searchbar */}
      {shouldShowSearch() && (
        <div class="map-search-wrap">
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
        </div>
      )}

      <div class="map-frame">
        <WaterMarkerComponent map={mapRef} markerLib={markerLib} waters={waters} />
        <div ref={mapContainer} class="map-canvas" />
        <button
          type="button"
          class="map-locate-btn"
          onClick={centerToUserLocation}
          aria-label="Centrera på min position"
        >
          <LocateIcon />
        </button>

        {isLoading() && <div class="map-overlay">Laddar karta...</div>}

        {(error() || watersError()) && (
          <div class="map-overlay">
            <div class="map-error">{error() ?? watersError()}</div>
          </div>
        )}
      </div>
    </section>
  );
};

export default GoogleMap;
