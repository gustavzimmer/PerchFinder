import './App.scss';

import { Component } from 'solid-js';
import { Route, Router, type RouteSectionProps } from '@solidjs/router';
import HomePage from './pages/HomePage';
import Navigation from './components/Navigation';
import PersistentMap from './components/PersistentMap';
import RegisterWaterPage from './pages/RegisterWaterPage';
import WaterInfoPage from './pages/WaterInfoPage';
import RegisterUserPage from './pages/RegisterUserPage';
import LoginPage from './pages/LoginPage';
import AdminWaterRequestsPage from './pages/AdminWaterRequestsPage';
import ProfilePage from './pages/ProfilePage';
import { MapUiProvider } from './context/MapUiContext';

const Layout: Component<RouteSectionProps> = (props) => (
  <MapUiProvider>
    <div id="app">
      <Navigation />
      {props.children}
      <PersistentMap />
    </div>
  </MapUiProvider>
);

const App: Component = () => (
  <Router>
    <Route path="/" component={Layout}>
      <Route path="/" component={HomePage} />
      <Route path="/registrera-fiskevatten" component={RegisterWaterPage} />
      <Route path="/admin/vattenforfragan" component={AdminWaterRequestsPage} />
      <Route path="/vatten/:id" component={WaterInfoPage} />
      <Route path="/profil" component={ProfilePage} />
      <Route path="/skapa-konto" component={RegisterUserPage} />
      <Route path="/logga-in" component={LoginPage} />
    </Route>
  </Router>
);

export default App;
