/** True inside the desktop app's WebView rather than a normal browser tab. */
function isDesktopShell(): boolean {
  if ('__TAURI__' in window) return true;
  // The custom scheme is the reliable tell even before the Tauri globals load.
  return !window.location.protocol.startsWith('http');
}

/*
 * Kept only to deliver the tombstone in `public/sw.js`.
 *
 * Sidq ships as a signed .dmg and the site has no offline story, so there is
 * nothing here worth a service worker. There is, however, an old one still
 * registered in every browser that has visited sidq.tech, and the only way to
 * remove it is to let those browsers fetch the replacement that unregisters
 * itself. Stopping the registration now would strand them on the old worker
 * and its cache permanently.
 *
 * Delete this and `public/sw.js` together, once enough time has passed.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // the SW cache fights HMR

  /*
   * Never in the desktop app.
   *
   * Tauri serves from a custom scheme, where service worker registration is
   * either rejected or unsupported depending on the WebKit build. There is also
   * nothing to gain: the whole bundle is already local, so an offline cache of
   * local files is pure overhead and one more thing that can fail on startup.
   */
  if (isDesktopShell()) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is an enhancement. A registration failure is not worth
      // surfacing to someone who just wants to see their day.
    });
  });
}
