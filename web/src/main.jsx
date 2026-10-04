import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary, { reportError } from './components/ErrorBoundary.jsx';
import './styles.css';

window.addEventListener('error', (e) => reportError(e.message, e.error?.stack));
window.addEventListener('unhandledrejection', (e) => reportError(`Unhandled promise: ${e.reason?.message || e.reason}`, e.reason?.stack));

createRoot(document.getElementById('root')).render(
  <ErrorBoundary name="App" big>
    <App />
  </ErrorBoundary>
);
