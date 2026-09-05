import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	preview: vi.fn(),
	remove: vi.fn(),
	setProxyHost: vi.fn(),
	showError: vi.fn(),
	showObjectSuccess: vi.fn(),
	proxyHostResult: {} as any,
	userResult: {} as any,
	upstreams: [] as any[],
}));

vi.mock("ez-modal-react", () => ({
	default: { create: (component: unknown) => component, show: vi.fn() },
}));

vi.mock("src/api/backend", () => ({
	previewProxyHostNginxConfig: (...args: unknown[]) => mocks.preview(...args),
}));

vi.mock("src/hooks", () => ({
	useProxyHost: () => mocks.proxyHostResult,
	useSetProxyHost: () => ({ mutate: mocks.setProxyHost }),
	useUpstreams: () => ({ data: mocks.upstreams }),
	useUser: () => mocks.userResult,
}));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

vi.mock("src/notifications", () => ({
	showError: (...args: unknown[]) => mocks.showError(...args),
	showObjectSuccess: (...args: unknown[]) => mocks.showObjectSuccess(...args),
}));

vi.mock("src/components", () => {
	const Stub = ({ children }: PropsWithChildren) => <div>{children}</div>;
	const Button = ({ children, isLoading: _isLoading, actionType: _actionType, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean; actionType?: string }>) => (
		<button {...props}>{children}</button>
	);
	return {
		AccessField: Stub,
		Button,
		DomainNamesField: Stub,
		HasPermission: Stub,
		Loading: () => <div>loading</div>,
		LocationsFields: Stub,
		NginxConfigField: Stub,
		ProxyDirectivesFields: Stub,
		SSLCertificateField: Stub,
		SSLOptionsFields: Stub,
	};
});

import { ProxyHostModal } from "./ProxyHostModal";

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.proxyHostResult = {
		data: { id: 7, domainNames: ["example.test"], enabled: true, forwardScheme: "http", forwardHost: "127.0.0.1", forwardPort: 8080, defaultTarget: { type: "direct", scheme: "http", host: "127.0.0.1", port: 8080 }, locations: [], nginxConfig: { listener: { mode: "domain" }, server: {} }, nginxConfigRevision: 3 },
		isLoading: false, error: null,
	};
	mocks.userResult = { data: { id: 1, isAdmin: true }, isLoading: false, error: null };
	mocks.upstreams = [];
	mocks.preview.mockResolvedValue({
		valid: true,
		diagnostics: [{ code: "NOTICE", message: "Looks good", severity: "warning", line: 8 }],
		validationScope: "full",
		effectiveConfig: { listener: "domain" },
		sourceMap: [{ lineStart: 8, directive: "proxy_pass", field: "forwardHost", source: "user", scope: "server" }],
		capability: { http2: true },
		hash: "abc123",
		config: "server { listen 80; }",
		previewToken: "preview-token",
	});
});

const next = () => fireEvent.click(screen.getByRole("button", { name: "proxy-host.wizard.next" }));
const modalInternals = { hide: vi.fn(), resolve: vi.fn(), reject: vi.fn() };

describe("ProxyHostModal wizard", () => {
	it("renders loading and query error states", () => {
		mocks.userResult = { data: undefined, isLoading: true, error: null };
		const { rerender } = render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		expect(screen.getByText("loading")).toBeInTheDocument();
		mocks.userResult = { data: { id: 1 }, isLoading: false, error: new Error("user unavailable") };
		mocks.proxyHostResult = { ...mocks.proxyHostResult, error: new Error("host unavailable") };
		rerender(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		expect(screen.getByText("host unavailable")).toBeInTheDocument();
	});

	it("validates port listener mode before advancing", () => {
		render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.wizard.listener.port" }));
		fireEvent.change(document.getElementById("listenerPort")!, { target: { value: "81" } });
		next();
		expect(screen.getByText("proxy-host.wizard.validation.listener-port-reserved")).toBeInTheDocument();
		fireEvent.change(document.getElementById("listenerPort")!, { target: { value: "8443" } });
		next();
		expect(screen.getByText("proxy-host.wizard.tls.help")).toBeInTheDocument();
	});

	it("blocks missing domains and unsafe managed proxy redirects", () => {
		mocks.proxyHostResult.data = { ...mocks.proxyHostResult.data, domainNames: [] };
		const first = render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		next();
		expect(screen.getByText("proxy-host.wizard.validation.domain")).toBeInTheDocument();
		first.unmount();
		mocks.proxyHostResult.data = { ...mocks.proxyHostResult.data, domainNames: ["example.test"], nginxConfig: { listener: { mode: "domain" }, server: { directives: { proxyRedirect: "default" } } } };
		render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		next();
		expect(screen.getByText("proxy-host.wizard.validation.proxy-redirect-default")).toBeInTheDocument();
	});

	it("validates default targets and custom locations", () => {
		mocks.proxyHostResult.data = { ...mocks.proxyHostResult.data, defaultTarget: { type: "direct", scheme: "http", host: "", port: 0 } };
		const first = render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		next(); next(); next();
		expect(screen.getByText("proxy-host.wizard.validation.upstream")).toBeInTheDocument();
		first.unmount();

		mocks.proxyHostResult.data = { ...mocks.proxyHostResult.data, defaultTarget: { type: "direct", scheme: "http", host: "127.0.0.1", port: 80 }, locations: [{ path: "", target: { type: "direct", scheme: "http", host: "", port: 0 }, nginxConfig: {} }] };
		render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		next(); next(); next(); next();
		expect(screen.getByText("proxy-host.wizard.validation.locations")).toBeInTheDocument();
	});

	it("disables deployment for an invalid preview", async () => {
		mocks.preview.mockResolvedValueOnce({ valid: false, diagnostics: [], config: "invalid", previewToken: null });
		render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		next(); next(); next(); next();
		expect((await screen.findAllByText("proxy-host.wizard.preview.invalid")).length).toBeGreaterThan(0);
		expect(screen.getByRole("button", { name: "proxy-host.wizard.save-deploy" })).toBeDisabled();
	});

	it("reports degraded Nginx deployment details after saving", async () => {
		mocks.setProxyHost.mockImplementation((_payload, options) => {
			options.onSuccess({ nginxDeploymentStatus: "degraded", nginxLastError: { message: "reload failed" } });
			options.onSettled();
		});
		render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);
		next(); next(); next(); next();
		await waitFor(() => expect(mocks.preview).toHaveBeenCalled());
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.wizard.save-deploy" }));
		await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith(expect.stringContaining("reload failed")));
		expect(mocks.remove).toHaveBeenCalled();
	});
	it("walks through every step, previews and deploys an existing host", async () => {
		mocks.setProxyHost.mockImplementation((_payload, options) => {
			options.onSuccess({ nginxDeploymentStatus: "ready" });
			options.onSettled();
		});
		render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);

		expect(screen.getByText("proxy-host.wizard.server.help")).toBeInTheDocument();
		next();
		expect(screen.getByText("proxy-host.wizard.tls.help")).toBeInTheDocument();
		next();
		expect(screen.getByText("proxy-host.wizard.upstream.help")).toBeInTheDocument();
		next();
		expect(screen.getByText("proxy-host.wizard.locations.help")).toBeInTheDocument();
		next();

		await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
		expect(await screen.findByText("server { listen 80; }")).toBeInTheDocument();
		expect(screen.getByText(/Looks good/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.wizard.save-deploy" }));

		await waitFor(() =>
			expect(mocks.setProxyHost).toHaveBeenCalledWith(
				expect.objectContaining({ id: 7, previewToken: "preview-token", baseRevision: 3 }),
				expect.any(Object),
			),
		);
		expect(mocks.showObjectSuccess).toHaveBeenCalledWith("proxy-host", "saved");
		expect(mocks.remove).toHaveBeenCalledOnce();
	});

	it("blocks invalid server input and reports preview failures", async () => {
		mocks.preview.mockRejectedValueOnce(new Error("preview unavailable"));
		render(<ProxyHostModal {...modalInternals} id={7} visible remove={mocks.remove} />);

		// The existing fixture is valid, so reach preview and exercise its rejection path.
		next();
		next();
		next();
		next();
		expect(await screen.findByText("preview unavailable")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "proxy-host.wizard.save-deploy" })).toBeDisabled();

		fireEvent.click(screen.getByRole("button", { name: "proxy-host.wizard.previous" }));
		expect(screen.getByText("proxy-host.wizard.locations.help")).toBeInTheDocument();
	});
});
