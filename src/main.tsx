import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { registerServiceWorker } from './lib/pwa';
import './styles/global.css';

/*
 * Two guards before anything renders.
 *
 * Both exist because the desktop app runs the same bundle inside a Tauri
 * WebView, where the origin is a custom scheme rather than https. Several web
 * APIs that are always present in a browser tab are missing or throw there, and
 * a throw at this level blanks the whole window with no message.
 */

/*
 * A stable id, without assuming crypto.randomUUID exists.
 *
 * It requires a secure context. A Tauri WebView usually qualifies, but "usually"
 * is not good enough for a call that runs on mount: if it is absent the whole
 * card unmounts and the window goes blank. The fallback is not
 * cryptographically strong and does not need to be — it identifies one install
 * inside one room.
 */
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }) as `${string}-${string}-${string}-${string}-${string}`,
  });
}

/*
 * Surface anything that escapes React.
 *
 * Promise rejections and errors in event handlers never reach an error
 * boundary, so without this they are invisible in a packaged build.
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
