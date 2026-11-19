// Mantém o aplicativo abrindo mesmo sem internet: guarda os arquivos do site no aparelho.
const V = 'attiva-1.5.1';
const ARQ = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/config.js', 'js/core.js', 'js/store.js', 'js/grid.js', 'js/mod-controle.js', 'js/mod-gestao.js', 'js/mod-admin.js', 'js/mod-plan.js', 'js/mod-audit.js', 'js/audit.js', 'vendor/fflate.min.js', 'vendor/firebase.js', 'vendor/xlsx.full.min.js', 'vendor/exceljs.min.js', 'manifest.webmanifest', 'icons/icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(ARQ)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Firebase fala direto com a rede
  e.respondWith(caches.open(V).then(async c => {
    const guardado = await c.match(e.request, { ignoreSearch: true });
    const rede = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => guardado || (e.request.mode === 'navigate' ? c.match('index.html') : Response.error()));
    return guardado || rede; // abre na hora com o que está guardado e atualiza em segundo plano
  }));
});
