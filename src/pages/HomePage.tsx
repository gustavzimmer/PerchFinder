import { Component, createEffect, createSignal } from 'solid-js';
import GoogleMapsComponent from '../components/GoogleMapsComponent';
import { geoLocation } from '../types/Map.types';

const HomePage: Component = () => {
  const [userLocation, setUserLocation] = createSignal<geoLocation | null>(null)

  createEffect(() => {
    if(navigator.geolocation) {
      navigator.geolocation.getCurrentPosition( async (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      }, (err) => {
        console.error("GeoLocation not supported: ", err)
      })
    }
  })
  return (
    <main class="page">
      <h1>Perch Finder</h1>
      <GoogleMapsComponent userLocation={userLocation()} />
    </main>
  );
};

export default HomePage
