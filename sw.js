const CACHE = 'taraz-b99a884856727691';
const FILES = ["./","./apple-touch-icon.png","./assets/index-BA1Cip7B.js","./assets/index-jxoge_E7.css","./assets/lib-D_C3zzOt.js","./assets/pdf-Bm2p5NBK.js","./assets/pdf.worker.min-EipBoiTd.js","./assets/pdf.worker.min-yatZIOMy.mjs","./assets/Vazirmatn-Variable-BeciDpKm.woff2","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./logo.svg","./manifest.webmanifest","./index.html","./k.json","./boot.js"];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE && k !== 'taraz-share') await caches.delete(k);
  await self.clients.claim();
})()));
let key = null;
function readKey() {
  return new Promise((res) => {
    const r = indexedDB.open('taraz-key', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => res(null);
    r.onsuccess = () => {
      const q = r.result.transaction('kv').objectStore('kv').get('key');
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    };
  });
}
async function getKey() {
  if (key) return key;
  const b = await readKey();
  if (!b) return null;
  key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(b), (c) => c.charCodeAt(0)), 'AES-GCM', false, ['decrypt']);
  return key;
}
self.addEventListener('message', (e) => { if (e.data === 'forget') key = null; });
const isSealed = (rel) => rel.startsWith('assets/') && ['js', 'mjs', 'css'].includes(rel.split('.').pop()) && !/worker/i.test(rel);
const LOADER = new Set(['', 'index.html', 'boot.js', 'k.json', 'manifest.webmanifest']);
async function fromCache(req) {
  return (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await caches.match('./') : undefined);
}
async function decrypt(res, rel) {
  if (!res || !res.ok) return res;
  const k = await getKey();
  if (!k) return new Response('', { status: 403 });
  try {
    const buf = new Uint8Array(await res.clone().arrayBuffer());
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, k, buf.slice(12));
    return new Response(plain, { headers: { 'Content-Type': rel.endsWith('.css') ? 'text/css' : 'text/javascript' } });
  } catch (_) {
    return new Response('', { status: 500 });
  }
}
async function keepShared(req) {
  const form = await req.formData();
  const box = await caches.open('taraz-share');
  for (const k of await box.keys()) await box.delete(k);
  let i = 0;
  for (const f of form.getAll('files')) {
    if (typeof f === 'string' || !f.size) continue;
    await box.put('./share/file-' + i++, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'file') } }));
  }
  const text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v) => typeof v === 'string' && v.trim()).join('
');
  if (text) await box.put('./share/text', new Response(text));
  return Response.redirect('./#/share', 303);
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const scope = new URL(self.registration.scope);
  if (e.request.method === 'POST' && url.origin === scope.origin && url.pathname === scope.pathname + 'share') {
    e.respondWith(keepShared(e.request).catch(() => Response.redirect('./#/share', 303)));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  e.respondWith((async () => {
    if (e.request.mode === 'navigate' || LOADER.has(rel)) {
      // newest loader when online, cached copy offline
      try {
        const net = await fetch(e.request, { cache: 'no-store' });
        if (net.ok) return net;
      } catch (_) {}
      return (await fromCache(e.request)) || new Response('', { status: 504 });
    }
    let res = await fromCache(e.request);
    if (!res) {
      try { res = await fetch(e.request); } catch (_) { return new Response('', { status: 504 }); }
    }
    return isSealed(rel) ? decrypt(res, rel) : res;
  })());
});
