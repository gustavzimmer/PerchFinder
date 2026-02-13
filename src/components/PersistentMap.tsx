import { Component } from "solid-js";
import GoogleMapsComponent from "./GoogleMapsComponent";
import { useMapUi } from "../context/MapUiContext";

const PersistentMap: Component = () => {
  const { mode, selectedLocation, setSelectedLocation } = useMapUi();

  const isVisible = () => mode() !== "hidden";
  const isSelectionMode = () => mode() === "select";

  return (
    <div class={`page map-page ${isVisible() ? "" : "is-hidden"}`}>
      <GoogleMapsComponent
        visible={isVisible()}
        selectionMode={isSelectionMode()}
        selectedLocation={selectedLocation()}
        onSelectLocation={setSelectedLocation}
      />
    </div>
  );
};

export default PersistentMap;
