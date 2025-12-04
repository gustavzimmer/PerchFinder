import './App.scss';

import { Component } from 'solid-js';
import { Route, Router} from '@solidjs/router'
import HomePage from './pages/HomePage';

const App: Component = () => {

  return (
    <Router>
        <Route path="/" component={HomePage} />
    </Router>
  );
};

export default App;
