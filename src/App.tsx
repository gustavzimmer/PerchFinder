import './App.scss';

import { Component, Suspense, lazy } from 'solid-js';
import { Route, Router, useLocation, type RouteSectionProps } from '@solidjs/router';
import Navigation from './components/Navigation';
import PersistentMap from './components/PersistentMap';
import { MapUiProvider } from './context/MapUiContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const RegisterWaterPage = lazy(() => import('./pages/RegisterWaterPage'));
const WaterInfoPage = lazy(() => import('./pages/WaterInfoPage'));
const RegisterUserPage = lazy(() => import('./pages/RegisterUserPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminWaterRequestsPage = lazy(() => import('./pages/AdminWaterRequestsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const DailyChallengePage = lazy(() => import('./pages/DailyChallengePage'));

const Layout: Component<RouteSectionProps> = (props) => {
  const location = useLocation();
  const isHomeRoute = () => location.pathname === "/";

  return (
    <MapUiProvider>
      <div id="app" class={`app-shell ${isHomeRoute() ? "route-home" : ""}`}>
        <Navigation />
        <Suspense fallback={<main class="page"><div>Laddar sida...</div></main>}>
          {props.children}
        </Suspense>
        <PersistentMap />
      </div>
    </MapUiProvider>
  );
};

const App: Component = () => (
  <Router>
    <Route path="/" component={Layout}>
      <Route path="/" component={HomePage} />
      <Route path="/registrera-fiskevatten" component={RegisterWaterPage} />
      <Route path="/admin/vattenforfragan" component={AdminWaterRequestsPage} />
      <Route path="/vatten/:id" component={WaterInfoPage} />
      <Route path="/profil" component={ProfilePage} />
      <Route path="/perchbuddy" component={DailyChallengePage} />
      <Route path="/skapa-konto" component={RegisterUserPage} />
      <Route path="/logga-in" component={LoginPage} />
    </Route>
  </Router>
);

export default App;
