import { Accessor, Component, createEffect, onCleanup } from "solid-js";
import { importLibrary } from "@googlemaps/js-api-loader";
import { WaterLocation } from "../types/Map.types";

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
    console.log(water);
    
    const container = document.createElement("div");
    container.className = "water-info-window";

    const title = document.createElement("h3");
    title.textContent = water.name;
    container.appendChild(title);

    const waterId = water._id ?? "";

    const catches = document.createElement("p");
    const count = water.catchCount ?? 0;
    catches.textContent = `Registrerade fångster: ${count}`;
    container.appendChild(catches);

    const link = document.createElement("a");
    link.textContent = "Visa vatten";
    link.href = waterId ? "/vatten/" + waterId : "#";
    link.className = "water-info-window__link";
    if (!water.detailPath || !waterId) {
      link.setAttribute("aria-disabled", "true");
    }
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

      markers = list.map((water) => {
        const marker = new AdvancedMarkerElement({
          map: currentMap,
          position: water.location,
          title: water.name,
        });

        const listener = marker.addListener("click", () => {

          if (!infoWindow) return;

          infoWindow.setContent(waterInfoWindow(water));
          infoWindow.open({ map: currentMap, anchor: marker });
        });

        return { marker, listener };
      });
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
