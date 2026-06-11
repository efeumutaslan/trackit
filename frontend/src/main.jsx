import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import { SettingsProvider } from './lib/settings.jsx';
import App from './App.jsx';
import { getThemePref, applyTheme, watchSystemTheme } from './lib/theme.js';
import './styles.css';

// Re-apply on boot (the inline script in index.html already did the
// first paint) and keep 'system' in sync with OS changes.
applyTheme(getThemePref());
watchSystemTheme();

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </AuthProvider>
  </BrowserRouter>
);
