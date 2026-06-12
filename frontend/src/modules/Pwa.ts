type RegisterPwaOptions = {
	onOfflineReady?: () => void;
	onUpdateReady?: (activateUpdate: () => void) => void;
};

function listenForWaitingWorker(registration: ServiceWorkerRegistration, onUpdateReady?: (activateUpdate: () => void) => void) {
	const notify = (worker?: ServiceWorker | null) => {
		if (!worker || !onUpdateReady) {
			return;
		}

		onUpdateReady(() => worker.postMessage({ type: "SKIP_WAITING" }));
	};

	if (registration.waiting) {
		notify(registration.waiting);
	}

	registration.addEventListener("updatefound", () => {
		const worker = registration.installing;
		worker?.addEventListener("statechange", () => {
			if (worker.state === "installed" && navigator.serviceWorker.controller) {
				notify(worker);
			}
		});
	});
}

export function registerPwa({ onOfflineReady, onUpdateReady }: RegisterPwaOptions = {}) {
	if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
		return;
	}

	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.then((registration) => {
				listenForWaitingWorker(registration, onUpdateReady);
				if (!navigator.serviceWorker.controller) {
					registration.addEventListener("updatefound", () => {
						const worker = registration.installing;
						worker?.addEventListener("statechange", () => {
							if (worker.state === "installed") {
								onOfflineReady?.();
							}
						});
					});
				}
			})
			.catch((error) => {
				console.error("Failed to register service worker", error);
			});
	});

	let refreshing = false;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (refreshing) {
			return;
		}
		refreshing = true;
		window.location.reload();
	});
}
