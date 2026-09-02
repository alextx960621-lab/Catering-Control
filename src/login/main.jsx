import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './login.css';

// Blindaje de orden de carga: config.js y supabase-client.js son scripts
// globales clásicos con "defer", que en teoría ya corrieron cuando este
// módulo se ejecuta (los módulos ES también se difieren hasta después del
// parseo del HTML). Aun así, para no depender de esa sutileza entre
// navegadores, se espera explícitamente a que ambos existan antes de armar
// React — igual que en la versión anterior sin build.
function boot() {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
}

if (window.APP_CONFIG && window.SupabaseDB) {
  boot();
} else {
  const waitForDeps = setInterval(() => {
    if (window.APP_CONFIG && window.SupabaseDB) {
      clearInterval(waitForDeps);
      boot();
    }
  }, 20);
}
