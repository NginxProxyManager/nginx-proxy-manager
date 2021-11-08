import React from "react";

import { ChakraProvider } from "@chakra-ui/react";
import Router from "components/Router";
import { AuthProvider, HealthProvider, LocaleProvider } from "context";
import { intl } from "locale";
import { RawIntlProvider } from "react-intl";

function App() {
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<ChakraProvider>
					<HealthProvider>
						<AuthProvider>
							<Router />
						</AuthProvider>
					</HealthProvider>
				</ChakraProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;
