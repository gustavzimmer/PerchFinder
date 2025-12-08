import { Component } from 'solid-js';
import GoogleMapsComponent from '../components/GoogleMapsComponent';

const HomePage: Component = () => {
  return (
    <main class="page">
      <h1>Perch Finder</h1>
      <GoogleMapsComponent />
    </main>
  );
};

export default HomePage
