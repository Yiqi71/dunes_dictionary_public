const CACHE_VERSION = 'dunes-v13';
const PRECACHE_URLS = [
  '/',
  '/analytics.js',
  '/assets/css/floatingPanel.css',
  '/assets/css/fonts.css',
  '/assets/css/invite-gate.css',
  '/assets/css/menu.css',
  '/assets/css/mobile.css',
  '/assets/css/resetCSS.css',
  '/assets/css/saved.css',
  '/assets/css/style.css',
  '/assets/css/zoom.css',
  '/assets/data/land-50m.json',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-Black.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-BlackItalic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-Bold.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-BoldItalic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-ExtraBold.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-ExtraBoldItalic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-ExtraLight.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-ExtraLightItalic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-Italic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-Light.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-LightItalic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-Medium.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-MediumItalic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-Regular.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-SemiBold.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-SemiBoldItalic.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-Thin.ttf',
  '/assets/fonts/Barlow_Condensed/BarlowCondensed-ThinItalic.ttf',
  '/assets/fonts/Barlow_Condensed/OFL.txt',
  '/assets/fonts/Chilldin/ChillDINGothic_Bold.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_ConBold.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_ConMedium.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_ConRegular.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_ConSemiBold.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_Light.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_Medium.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_Regular.otf',
  '/assets/fonts/Chilldin/ChillDINGothic_SemiBold.otf',
  '/assets/fonts/Noto_Sans_Duployan/NotoSansDuployan-Bold.ttf',
  '/assets/fonts/Noto_Sans_Duployan/NotoSansDuployan-Regular.ttf',
  '/assets/fonts/Noto_Sans_Duployan/OFL.txt',
  '/assets/fonts/Stint_Ultra_Condensed/OFL.txt',
  '/assets/fonts/Stint_Ultra_Condensed/StintUltraCondensed-Regular.ttf',
  '/assets/images/chosen.svg',
  '/assets/images/icons/apple-touch-icon.png',
  '/assets/images/icons/icon-192.png',
  '/assets/images/icons/icon-512.png',
  '/assets/images/language.svg',
  '/assets/images/left_arrow.svg',
  '/assets/images/left_arrow_dark.svg',
  '/assets/images/liked.svg',
  '/assets/images/max.svg',
  '/assets/images/min.svg',
  '/assets/images/right_arrow.svg',
  '/assets/images/right_arrow_dark.svg',
  '/assets/images/saved_big.png',
  '/assets/images/saved_big.svg',
  '/assets/images/saved_small.svg',
  '/assets/images/search.svg',
  '/assets/images/shuffle.svg',
  '/assets/images/unliked.svg',
  '/assets/images/unsaved.svg',
  '/assets/js/aboutPanel.js',
  '/assets/js/boot-startup-debug.js',
  '/assets/js/countryBoundingBoxes.js',
  '/assets/js/countryMapping.js',
  '/assets/js/detail.js',
  '/assets/js/device-id.js',
  '/assets/js/flythrough.js',
  '/assets/js/fontFallback.js',
  '/assets/js/invite-gate.js',
  '/assets/js/main.preview.js',
  '/assets/js/menu.js',
  '/assets/js/mobile-interactions.js',
  '/assets/js/mobile-panel.js',
  '/assets/js/oriDisplay.js',
  '/assets/js/panel-page.js',
  '/assets/js/particles.js',
  '/assets/js/relationManager.js',
  '/assets/js/saved.js',
  '/assets/js/state.js',
  '/assets/js/uni-canvas.js',
  '/assets/js/wordFocus.hotkey.rs.js',
  '/assets/js/wordFocus.js',
  '/assets/js/zoom.js',
  '/combined.html',
  '/content/data.json',
  '/content/devlog.json',
  '/content/images/Archive_Fever_aigc.jpg',
  '/content/images/Archive_Fever_diagram_1.jpg',
  '/content/images/Archive_Fever_diagram_2.jpg',
  '/content/images/Archive_Fever_proposer.jpg',
  '/content/images/Archive_Fever_source_cover.jpg',
  '/content/images/Ashore_aigc.jpg',
  '/content/images/Ashore_note1_1.jpg',
  '/content/images/Blase_Attitude_aigc.jpg',
  '/content/images/Blase_Attitude_proposer.jpg',
  '/content/images/Blase_Attitude_source_cover.jpg',
  '/content/images/Caring_Classes_aigc.jpg',
  '/content/images/Caring_Classes_proposer.jpg',
  '/content/images/Caring_Classes_source_cover.jpg',
  '/content/images/Contronym_aigc.jpg',
  '/content/images/Contronym_source_cover.jpg',
  '/content/images/Ghetto_aigc.jpg',
  '/content/images/Ghetto_diagram_1.jpg',
  '/content/images/Ghetto_note1_1.jpg',
  '/content/images/Ghetto_proposer.jpg',
  '/content/images/Ghetto_source_cover.jpg',
  '/content/images/Gig_Economy_aigc.jpg',
  '/content/images/Gig_Economy_note1_1.jpg',
  '/content/images/Gig_Economy_proposer.jpg',
  '/content/images/Gig_Economy_source_cover.jpg',
  '/content/images/Institution_aigc.jpg',
  '/content/images/Institution_proposer.jpg',
  '/content/images/Institution_source_cover.jpg',
  '/content/images/Interstitial_Living_proposer.jpg',
  '/content/images/Interstitial_Living_source_cover.jpg',
  '/content/images/Intersubjectivity_aigc.jpg',
  '/content/images/Intersubjectivity_diagram_1.jpg',
  '/content/images/Intersubjectivity_proposer.jpg',
  '/content/images/Intersubjectivity_source_cover.jpg',
  '/content/images/Surface_Reading_aigc.jpg',
  '/content/images/Surface_Reading_proposer.jpg',
  '/content/images/Surface_Reading_source_cover.jpg',
  '/content/images/Suspension_aigc.jpg',
  '/content/images/Suspension_proposer.jpg',
  '/content/images/Suspension_source_cover.jpg',
  '/content/images/Urban_Desiring_Machine_aigc.jpg',
  '/content/images/Urban_Desiring_Machine_proposer.jpg',
  '/content/images/Urban_Desiring_Machine_source_cover.jpg',
  '/echoes-panel.html',
  '/entry-panel.html',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Cache files individually so one missing/failed file doesn't abort the whole install.
      let failed = 0;
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            failed++;
            console.warn('[sw] failed to precache', url, err);
          })
        )
      ).then(() => ({ total: PRECACHE_URLS.length, failed }));
    }).then((result) => {
      return self.skipWaiting().then(() => result);
    }).then((result) => {
      // Tell every open page that offline caching is done, so the UI can
      // show a clear "ready for offline" signal instead of leaving it to guesswork.
      return self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'sw-precache-done', total: result.total, failed: result.failed });
        });
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache-first: always prefer the offline copy. Only hit the network if a
// resource was never precached (e.g. something added after install).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Opportunistically cache newly-seen same-origin GET responses.
        if (response && response.ok && event.request.url.startsWith(self.location.origin)) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
