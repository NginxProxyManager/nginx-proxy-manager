import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import EasyModal from "ez-modal-react";
import type { ReactElement } from "react";
import { RawIntlProvider } from "react-intl";
import { LocaleProvider } from "src/context";
import { intl } from "src/locale";

// Test helpers shared by component tests. Not imported by application code.

export const createTestQueryClient = () =>
	new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

/**
 * Renders the given element inside the providers the app normally supplies
 * (intl, locale, react-query and the EasyModal host), so modals opened with
 * EasyModal.show() during a test are mounted too.
 */
export function renderWithProviders(ui: ReactElement = <></>, queryClient: QueryClient = createTestQueryClient()) {
	const result = render(
		<RawIntlProvider value={intl}>
			<LocaleProvider>
				<QueryClientProvider client={queryClient}>
					<EasyModal.Provider>{ui}</EasyModal.Provider>
				</QueryClientProvider>
			</LocaleProvider>
		</RawIntlProvider>,
	);
	return { ...result, queryClient };
}

export const makeFile = (name: string, content = "-----BEGIN-----") =>
	new File([content], name, { type: "text/plain" });

/**
 * Selects files on a file input the way a browser does: the input's real FileList
 * is replaced (so `required` validation sees it) and a change event is fired.
 */
export const selectFiles = (input: HTMLElement, files: File[]) => {
	const dataTransfer = new DataTransfer();
	for (const file of files) {
		dataTransfer.items.add(file);
	}
	(input as HTMLInputElement).files = dataTransfer.files;
	fireEvent.change(input);
};
