import { Component, onCleanup, onMount } from 'solid-js';
import { useMapUi } from '../context/MapUiContext';

const HomePage: Component = () => {
  const { setMode, setSelectedLocation } = useMapUi();

  onMount(() => {
    setMode("browse");
    setSelectedLocation(null);
  });

  onCleanup(() => {
    setMode("hidden");
  });

  return (
    <main class="page">
      <h1>Perch Finder</h1>
      <p class="lead">Utforska fiskevatten i kartan nedan.</p>
    </main>
  );
};

export default HomePage
