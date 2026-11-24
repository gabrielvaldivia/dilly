import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { watchSpine } from './lib/spine.js';
import './theme.css';

watchSpine();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
