import { Component, createContext, createSignal, useContext, type Accessor, type Setter } from "solid-js";
import type { geoLocation } from "../types/Map.types";

export type MapMode = "hidden" | "browse" | "select";

type MapUiContextValue = {
  mode: Accessor<MapMode>;
  setMode: Setter<MapMode>;
  selectedLocation: Accessor<geoLocation | null>;
  setSelectedLocation: Setter<geoLocation | null>;
};

const MapUiContext = createContext<MapUiContextValue>();

export const MapUiProvider: Component<{ children: any }> = (props) => {
  const [mode, setMode] = createSignal<MapMode>("hidden");
  const [selectedLocation, setSelectedLocation] = createSignal<geoLocation | null>(null);

  return (
    <MapUiContext.Provider value={{ mode, setMode, selectedLocation, setSelectedLocation }}>
      {props.children}
    </MapUiContext.Provider>
  );
};

export const useMapUi = () => {
  const ctx = useContext(MapUiContext);
  if (!ctx) {
    throw new Error("useMapUi must be used within MapUiProvider");
  }
  return ctx;
};
