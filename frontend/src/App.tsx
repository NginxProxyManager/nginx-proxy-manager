import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RawIntlProvider } from "react-intl";

import { AuthProvider, LocaleProvider } from "src/context";
import { intl } from "src/locale";

import Router from "./Router";
import lightTheme from "./theme/customTheme";

// Create a client
const queryClient = new QueryClient();

function App() {
	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<QueryClientProvider client={queryClient}>
					<ChakraProvider theme={lightTheme}>
						<AuthProvider>
							<Router />
						</AuthProvider>
					</ChakraProvider>
					<ReactQueryDevtools position="bottom-right" panelPosition="right" />
				</QueryClientProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;
