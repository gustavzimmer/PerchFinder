import './App.scss';

import { Component } from 'solid-js';
import { Route, Router, type RouteSectionProps } from '@solidjs/router';
import HomePage from './pages/HomePage';
import Navigation from './components/Navigation';
import RegisterWaterPage from './pages/RegisterWaterPage';
import WaterInfoPage from './pages/WaterInfoPage';

const Layout: Component<RouteSectionProps> = (props) => (
  <div id="app">
    <Navigation />
    {props.children}
  </div>
);

const App: Component = () => (
  <Router>
    <Route path="/" component={Layout}>
      <Route path="/" component={HomePage} />
      <Route path="/registrera-fiskevatten" component={RegisterWaterPage} />
      <Route path="/vatten/:id" component={WaterInfoPage} />
    </Route>
  </Router>
);

export default App;
