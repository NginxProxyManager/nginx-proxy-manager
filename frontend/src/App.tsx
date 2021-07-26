import React from "react";

import Router from "components/Router";
import { AuthProvider, HealthProvider, LocaleProvider } from "context";
import { intl } from "locale";
import { RawIntlProvider } from "react-intl";

function App() {
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<HealthProvider>
					<AuthProvider>
						<Router />
					</AuthProvider>
				</HealthProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;
