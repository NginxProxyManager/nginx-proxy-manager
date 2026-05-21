import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import EasyModal from "ez-modal-react";
import { RawIntlProvider } from "react-intl";
import { toast, ToastContainer } from "react-toastify";
import { AuthProvider, LocaleProvider, ThemeProvider } from "src/context";
import { intl } from "src/locale";
import Router from "src/Router.tsx";
import { registerPwa } from "src/modules/Pwa";

// Create a client
const queryClient = new QueryClient();

function App() {
	useEffect(() => {
		registerPwa({
			onOfflineReady: () => {
				toast.info("Nginx Proxy Manager is ready for offline launch.");
			},
			onUpdateReady: (activateUpdate) => {
				toast.info(
					<button className="btn btn-primary btn-sm" type="button" onClick={activateUpdate}>
						Update available. Reload
					</button>,
					{ autoClose: false },
				);
			},
		});
	}, []);

	return (
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<ThemeProvider>
					<QueryClientProvider client={queryClient}>
						<AuthProvider>
							<EasyModal.Provider>
								<Router />
							</EasyModal.Provider>
							<ToastContainer
								position="top-right"
								autoClose={5000}
								hideProgressBar={true}
								newestOnTop={true}
								closeOnClick={true}
								rtl={false}
								closeButton={false}
							/>
						</AuthProvider>
						<ReactQueryDevtools buttonPosition="bottom-right" position="right" />
					</QueryClientProvider>
				</ThemeProvider>
			</LocaleProvider>
		</RawIntlProvider>
	);
}

export default App;
