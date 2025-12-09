import { Component, createEffect, createSignal, onMount } from "solid-js";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { geoLocation } from "../types/Map.types";

type MapsLib = Awaited<ReturnType<typeof importLibrary<"maps">>>;
type MarkerLib = Awaited<ReturnType<typeof importLibrary<"marker">>>;

const ApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
let hasConfiguredLoader = false;

const RegisterWaterPage: Component = () => {
  const [name, setName] = createSignal("");
  const [selectedLocation, setSelectedLocation] = createSignal<geoLocation | null>(null);
  const [userLocation, setUserLocation] = createSignal<geoLocation | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [status, setStatus] = createSignal<string | null>(null);

  let mapContainer!: HTMLDivElement;
  type MapInstance = InstanceType<MapsLib["Map"]>;
  type MapClickEvent = {
    latLng: { lat: () => number; lng: () => number } | null;
  };
  let map: MapInstance | null = null;
  let marker: InstanceType<MarkerLib["Marker"]> | null = null;
  const defaultCenter = { lat: 59.3293, lng: 18.0686 }; // Stockholm

  const initializeMap = async () => {
    if (!ApiKey) {
      setError("Saknar GOOGLE_MAPS_API_KEY i miljövariablerna.");
      setIsLoading(false);
      return;
    }

    try {
      if (!hasConfiguredLoader) {
        setOptions({
          key: ApiKey,
          v: "weekly",
          language: "sv",
          libraries: ["marker"],
        });
        hasConfiguredLoader = true;
      }

      const [{ Map }, { Marker }] = await Promise.all([
        importLibrary("maps") as Promise<MapsLib>,
        importLibrary("marker") as Promise<MarkerLib>,
      ]);

      map = new Map(mapContainer, {
        center: userLocation() ?? defaultCenter,
        zoom: 7,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        gestureHandling: "greedy",
      });

      map.addListener("click", (e: MapClickEvent) => {
        const latLng = e.latLng;
        const currentMap = map;
        if (!latLng || !currentMap) return;

        const nextPos = { lat: latLng.lat(), lng: latLng.lng() };
        setSelectedLocation(nextPos);

        if (!marker) {
          marker = new Marker({
            map: currentMap,
            position: nextPos,
            title: "Vald plats",
          });
        } else {
          marker.setPosition(nextPos);
        }

        currentMap.panTo(nextPos);
      });
    } catch (err) {
      console.error("Kartan kunde inte laddas", err);
      setError("Kartan kunde inte laddas just nu. Försök igen senare.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    setStatus(null);

    if (!name().trim() || !selectedLocation()) {
      setStatus("Fyll i namn och markera en plats på kartan.");
      return;
    }

    // Här kan du spara till backend/API. Vi mockar bara ett OK-meddelande.
    setStatus(`"${name().trim()}" sparades med position ${selectedLocation()!.lat.toFixed(5)}, ${selectedLocation()!.lng.toFixed(5)}.`);
  };

  onMount(() => {
    void initializeMap();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          console.warn("Geolocation nekad/otillgänglig", err);
        }
      );
    }
  });

  createEffect(() => {
    const loc = userLocation();
    const currentMap = map;
    if (currentMap && loc && !selectedLocation()) {
      currentMap.setCenter(loc);
      currentMap.setZoom(12);
    }
  });

  return (
    <main class="page">
      <h1>Registrera fiskevatten</h1>
      <p class="lead">Namnge vattnet och klicka på kartan för att markera var det ligger.</p>

      <form class="register-form" onSubmit={handleSubmit}>
        <label>
          <span>Vattnets namn</span>
          <input
            type="text"
            placeholder="Ex. Brunnsviken"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            required
          />
        </label>

        <div class="field-help">
          Klicka på kartan för att sätta en position. Koordinater:
          {selectedLocation() ? (
            <strong>
              {" "}
              {selectedLocation()!.lat.toFixed(5)}, {selectedLocation()!.lng.toFixed(5)}
            </strong>
          ) : (
            <em> inte vald ännu</em>
          )}
        </div>

        <button type="submit" class="primary-button">Spara vatten</button>
        {status() && <div class="form-status">{status()}</div>}
      </form>

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
    </main>
  );
};

export default RegisterWaterPage;
