import React from "react";
import ReactDOM from "react-dom/client";
import App from "src/App.tsx";
import { getLocale, isRTLLocale } from "src/locale";

import "@tabler/core/dist/js/tabler.min.js";
import "./App.css";

const renderApp = () => {
	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
};

const tablerStyles = isRTLLocale(getLocale())
	? import("@tabler/core/dist/css/tabler.rtl.min.css")
	: import("@tabler/core/dist/css/tabler.min.css");

void tablerStyles.then(renderApp);
