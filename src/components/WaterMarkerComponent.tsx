import { Accessor, Component, createEffect, onCleanup } from "solid-js";
import { importLibrary } from "@googlemaps/js-api-loader";
import { WaterLocation } from "../types/Map.types";
import LogoLight from "../assets/images/perchfinder_logo_light.png";

type MapsLib = Awaited<ReturnType<typeof importLibrary<"maps">>>;
type MarkerLib = Awaited<ReturnType<typeof importLibrary<"marker">>>;

type Props = {
  waters: Accessor<WaterLocation[] | null>;
  map: Accessor<InstanceType<MapsLib["Map"]> | null>;
  markerLib: Accessor<MarkerLib | null>;
};

const WaterMarkerComponent: Component<Props> = (props) => {
  
  type AdvancedMarker = InstanceType<MarkerLib["AdvancedMarkerElement"]>;
  type InfoWindowInstance = InstanceType<MapsLib["InfoWindow"]>;
  type MarkerEntry = {
    marker: AdvancedMarker;
    listener?: ReturnType<AdvancedMarker["addListener"]>;
  };

  let mapsLib: MapsLib | null = null;
  let mapsLibPromise: Promise<MapsLib | null> | null = null;
  let markers: MarkerEntry[] = [];
  let infoWindow: InfoWindowInstance | null = null;
  let runId = 0;

  const toMarkerPosition = (location: WaterLocation["location"]) => {
    if (!location || typeof location !== "object") return null;

    const latLng = location as unknown as {
      lat?: number | (() => number);
      lng?: number | (() => number);
      latitude?: number;
      longitude?: number;
    };

    const readNumber = (value: unknown) => {
      if (typeof value === "number") return value;
      if (typeof value === "function") {
        try {
          const next = value();
          return typeof next === "number" ? next : null;
        } catch {
          return null;
        }
      }
      return null;
    };

    const lat = readNumber(latLng.lat) ?? latLng.latitude ?? null;
    const lng = readNumber(latLng.lng) ?? latLng.longitude ?? null;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  };

  /* Kolla så google är initierat rätt */
  const ensureMapsLib = async (): Promise<MapsLib | null> => {
    if (mapsLib) return mapsLib;

    if (!mapsLibPromise) {
      mapsLibPromise = importLibrary("maps")
        .then((lib) => {
          mapsLib = lib as MapsLib;
          return mapsLib;
        })
        .catch((err) => {
          console.error("Kunde inte ladda Google Maps-biblioteket", err);
          return null;
        });
    }
    return mapsLibPromise;
  };

 
  

  /* Info window content */
  const waterInfoWindow = (water: WaterLocation) => {
    const container = document.createElement("div");
    container.className = "water-info-window";

    const title = document.createElement("h3");
    title.textContent = water.name;
    container.appendChild(title);

    const waterId = water._id ?? "";

    const link = document.createElement("a");
    link.textContent = "Visa vatten";
    link.href = waterId ? "/vatten/" + waterId : "#";
    link.className = "water-info-window__link";
    link.target = "_self";
    container.appendChild(link);

    return container;
  };


  createEffect(() => {
    const currentMap = props.map();
    const list = props.waters();
    const lib = props.markerLib();
    const currentRun = ++runId;

    markers.forEach(({ marker, listener }) => {
      listener?.remove?.();
      marker.map = null;
    });
    markers = [];

    if (!currentMap || !list || !lib) return;

    void (async () => {

      const loadedMapsLib = await ensureMapsLib();
      if (!loadedMapsLib) return;
      if (currentRun !== runId) return;

      infoWindow = infoWindow ?? new loadedMapsLib.InfoWindow();
      infoWindow.close();

      const { AdvancedMarkerElement } = lib;

      const nextMarkers: MarkerEntry[] = [];
      for (const water of list) {
        const position = toMarkerPosition(water.location);
        if (!position) continue;

        const markerEl = document.createElement("div");
        markerEl.className = "water-marker";

        const img = document.createElement("img");
        img.src = LogoLight;
        img.alt = "Perch Finder";
        img.width = 26;
        img.height = 26;
        markerEl.appendChild(img);

        const marker = new AdvancedMarkerElement({
          map: currentMap,
          position,
          title: water.name,
          content: markerEl,
        });

        const listener = marker.addListener("click", () => {

          if (!infoWindow) return;

          infoWindow.setContent(waterInfoWindow(water));
          infoWindow.open({ map: currentMap, anchor: marker });
        });

        nextMarkers.push({ marker, listener });
      }
      markers = nextMarkers;
    })();
  });

  onCleanup(() => {
    markers.forEach(({ marker, listener }) => {
      listener?.remove?.();
      marker.map = null;
    });
    infoWindow?.close();
  });

  return null;
};

export default WaterMarkerComponent;
