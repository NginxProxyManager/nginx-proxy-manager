import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/context", () => ({
	AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	LocaleProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("src/Router.tsx", () => ({ default: () => <div>router-content</div> }));
vi.mock("@tanstack/react-query-devtools", () => ({ ReactQueryDevtools: () => <div>query-devtools</div> }));
vi.mock("ez-modal-react", () => ({ default: { Provider: ({ children }: { children: ReactNode }) => <>{children}</> } }));
vi.mock("react-intl", () => ({ RawIntlProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("react-toastify", () => ({ ToastContainer: () => <div>toast-container</div> }));
vi.mock("src/locale", () => ({ intl: {} }));

import App from "./App";

describe("application composition", () => {
	it("mounts routing, notifications, and query diagnostics inside providers", () => {
		render(<App />);
		expect(screen.getByText("router-content")).toBeInTheDocument();
		expect(screen.getByText("toast-container")).toBeInTheDocument();
		expect(screen.getByText("query-devtools")).toBeInTheDocument();
	});
});
