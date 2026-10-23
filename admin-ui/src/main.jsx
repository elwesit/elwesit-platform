import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import { boot } from './data.js';

boot();
createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker?.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {});
}
