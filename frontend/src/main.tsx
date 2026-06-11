import React from "react";
import ReactDOM from "react-dom/client";
import App from "src/App.tsx";
import { getLocale, isRTLLocale } from "src/locale";

import "@tabler/core/dist/css/tabler.min.css";
import "@tabler/core/dist/js/tabler.min.js";
import "./App.css";

const render = () => {
	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
};

// For right-to-left locales (e.g. Persian) load Tabler's RTL stylesheet after the
// base styles so it takes precedence, then render.
if (isRTLLocale(getLocale())) {
	import("@tabler/core/dist/css/tabler.rtl.min.css").then(render);
} else {
	render();
}
