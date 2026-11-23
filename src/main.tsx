import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter } from 'react-router';
import { App } from './app/App';
import { registerServiceWorker } from './app/serviceWorker';
import { routes } from './app/routes';
import './app/styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element in index.html.');
}

// Hash routing: deep links and reloads work on any static host (GitHub Pages
// included) without server-side rewrites.
const router = createHashRouter(routes);

createRoot(container).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
);

registerServiceWorker();
