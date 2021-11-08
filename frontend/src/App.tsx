import React from "react";

import { ChakraProvider } from "@chakra-ui/react";
import Router from "components/Router";
import { AuthProvider, HealthProvider, LocaleProvider } from "context";
import { intl } from "locale";
import { RawIntlProvider } from "react-intl";

import lightTheme from "./theme/customTheme";

function App() {
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<ChakraProvider theme={lightTheme}>
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
