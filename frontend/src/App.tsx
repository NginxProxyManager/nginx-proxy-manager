import React from "react";

import Router from "components/Router";
import { AuthProvider, HealthProvider } from "context";
import { intl } from "locale";
import { RawIntlProvider } from "react-intl";

function App() {
	return (
		<RawIntlProvider value={intl}>
			<HealthProvider>
				<AuthProvider>
					<Router />
				</AuthProvider>
			</HealthProvider>
		</RawIntlProvider>
	);
}

export default App;
