import { ChakraProvider } from "@chakra-ui/react";
import { AuthProvider, LocaleProvider } from "context";
import { intl } from "locale";
import { RawIntlProvider } from "react-intl";
import { QueryClient, QueryClientProvider } from "react-query";
import { ReactQueryDevtools } from "react-query/devtools";

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
					<ReactQueryDevtools />
				</QueryClientProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;
