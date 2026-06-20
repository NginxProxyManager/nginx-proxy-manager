const CACHE_VERSION = "npm-pwa-v1";
const APP_SHELL = [
	"/",
	"/index.html",
	"/offline.html",
	"/images/logo-no-text.svg",
	"/images/favicon/android-chrome-192x192.png",
	"/images/favicon/android-chrome-512x512.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;

	if (request.method !== "GET") {
		return;
	}

	const url = new URL(request.url);
	if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const copy = response.clone();
					caches.open(CACHE_VERSION).then((cache) => cache.put("/index.html", copy));
					return response;
				})
				.catch(async () => (await caches.match("/index.html")) || caches.match("/offline.html")),
		);
		return;
	}

	event.respondWith(
		caches.match(request).then((cached) => {
			if (cached) {
				return cached;
			}

			return fetch(request).then((response) => {
				if (response.ok) {
					const copy = response.clone();
					caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
				}
				return response;
			});
		}),
	);
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") {
		self.skipWaiting();
	}
});
