// Service worker de Ágape — permite instalar la app y abrirla aunque no haya internet.
// Los DATOS (inventario, ventas) nunca se guardan aquí: siempre van directo a Supabase.
// Sin internet, la app muestra el último inventario guardado y bloquea las ventas.

const VERSION = 'souvenirs-v1';
const ARCHIVOS_APP = [
    './',
    'index.html',
    'app.js',
    'manifest.webmanifest',
    'Info.png',
    'icon-180.png',
    'icon-192.png',
    'icon-512.png'
];
const LIBRERIAS_CDN = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.4/dist/umd/supabase.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js'
];
const HOSTS_CDN = ['cdn.jsdelivr.net', 'unpkg.com'];

self.addEventListener('install', (evento) => {
    evento.waitUntil((async () => {
        const cache = await caches.open(VERSION);
        await cache.addAll(ARCHIVOS_APP);
        // Las librerías externas se guardan aparte; si alguna falla, no se cancela la instalación.
        await Promise.allSettled(
            LIBRERIAS_CDN.map(url => cache.add(new Request(url, { mode: 'no-cors' })))
        );
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(nombres.filter(n => n !== VERSION).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (evento) => {
    const peticion = evento.request;
    if (peticion.method !== 'GET') return;

    const url = new URL(peticion.url);

    // Supabase (API, login, tiempo real): nunca se intercepta.
    if (url.hostname.endsWith('supabase.co')) return;

    // Librerías con versión fija en la URL: primero la copia guardada.
    if (HOSTS_CDN.includes(url.hostname)) {
        evento.respondWith((async () => {
            const cache = await caches.open(VERSION);
            const guardada = await cache.match(peticion);
            if (guardada) return guardada;
            const respuesta = await fetch(peticion);
            cache.put(peticion, respuesta.clone());
            return respuesta;
        })());
        return;
    }

    // Archivos de la propia app: primero internet (así siempre ves la última versión),
    // y si no hay conexión, la copia guardada.
    if (url.origin === self.location.origin) {
        evento.respondWith((async () => {
            const cache = await caches.open(VERSION);
            try {
                const respuesta = await fetch(peticion);
                if (respuesta.ok) cache.put(peticion, respuesta.clone());
                return respuesta;
            } catch (_) {
                const guardada = await cache.match(peticion, { ignoreSearch: true });
                if (guardada) return guardada;
                if (peticion.mode === 'navigate') {
                    const inicio = await cache.match('index.html');
                    if (inicio) return inicio;
                }
                throw _;
            }
        })());
    }
});
