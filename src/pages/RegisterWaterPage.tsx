import { Component, createEffect, createSignal, onMount } from "solid-js";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { geoLocation } from "../types/Map.types";
import {  waterCol } from "../firebase";

type MapsLib = Awaited<ReturnType<typeof importLibrary<"maps">>>;
type MarkerLib = Awaited<ReturnType<typeof importLibrary<"marker">>>;

const ApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
let hasConfiguredLoader = false;

const RegisterWaterPage: Component = () => {
  const [name, setName] = createSignal("");
  const [selectedLocation, setSelectedLocation] = createSignal<geoLocation | null>(null);
  const [userLocation, setUserLocation] = createSignal<geoLocation | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [isSaving, setIsSaving] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);

  let mapContainer!: HTMLDivElement;
  type MapInstance = InstanceType<MapsLib["Map"]>;
  type MapClickEvent = {
    latLng: { lat: () => number; lng: () => number } | null;
  };
  let map: MapInstance | null = null;
  let markerLib: MarkerLib | null = null;
  type AdvancedMarker = InstanceType<MarkerLib["AdvancedMarkerElement"]>;
  let marker: AdvancedMarker | null = null;
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

      const [{ Map }, markerLibrary] = await Promise.all([
        importLibrary("maps") as Promise<MapsLib>,
        importLibrary("marker") as Promise<MarkerLib>,
      ]);
      markerLib = markerLibrary;

      map = new Map(mapContainer, {
        center: userLocation() ?? defaultCenter,
        zoom: 7,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        mapId: MapId,
        gestureHandling: "greedy",
      });

      map.addListener("click", (e: MapClickEvent) => {
        const latLng = e.latLng;
        const currentMap = map;
        if (!latLng || !currentMap || !markerLib) return;

        const nextPos = { lat: latLng.lat(), lng: latLng.lng() };
        setSelectedLocation(nextPos);

        if (!marker) {
          const { AdvancedMarkerElement } = markerLib;
          marker = new AdvancedMarkerElement({
            map: currentMap,
            position: nextPos,
            title: "Vald plats",
          });
        } else {
          marker.position = nextPos;
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

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (!name().trim() || !selectedLocation()) {
      setStatus("Fyll i namn och markera en plats på kartan.");
      return;
    }

    try {
      setIsSaving(true);
      const loc = selectedLocation()!;
      await addDoc( waterCol , {
        name: name().trim(),
        location: loc,
        createdAt: serverTimestamp(),
      });
      setStatus(`"${name().trim()}" sparades!`);
    } catch (err) {
      console.error("Kunde inte spara vatten", err);
      setError("Det gick inte att spara vattnet just nu. Försök igen.");
    } finally {
      setIsSaving(false);
    }
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

        <button type="submit" class="primary-button" disabled={isSaving() || isLoading()}>
          {isSaving() ? "Sparar..." : "Spara vatten"}
        </button>
        {status() && <div class="form-status">{status()}</div>}
        {error() && <div class="map-error">{error()}</div>}
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
