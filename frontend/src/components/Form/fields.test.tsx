import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik } from "formik";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));
vi.mock("src/locale", () => ({
	formatDateTime: (value: string) => value,
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id, data }: { id: string; data?: unknown }) => <>{id}{data ? JSON.stringify(data) : ""}</>,
}));
vi.mock("src/hooks", () => ({
	useAccessLists: () => ({
		data: [{ id: 2, name: "Private", createdOn: "2026-01-01", items: [{}], clients: [{}] }],
		isLoading: false,
		isError: false,
		error: null,
	}),
	useCertificates: () => ({
		data: [{ id: 3, niceName: "Wildcard", provider: "letsencrypt", expiresOn: "2027-01-01" }],
		isLoading: false,
		isError: false,
		error: null,
	}),
	useDnsProviders: () => ({
		data: [{ id: "cloudflare", name: "Cloudflare", credentials: "dns_api_token = token" }],
		isLoading: false,
	}),
	useUpstreams: () => ({
		data: [{ id: 9, name: "Backend", nginxKey: "backend", isDisabled: false, nginxAppliedEnabled: true, nginxDeploymentStatus: "online" }],
	}),
}));

vi.mock("react-select", () => ({
	default: ({ options, onChange, value, defaultValue, isMulti, id, name }: any) => {
		const flat = (options || []).flatMap((option: any) => option.options || option);
		const selected = isMulti ? (value || []).map((item: any) => String(item.value)) : String((value || defaultValue)?.value ?? "");
		return <select aria-label={id || name || "select"} multiple={isMulti} value={selected} onChange={(event) => {
			const values = Array.from(event.currentTarget.selectedOptions).map((item) => flat.find((option: any) => String(option.value) === item.value));
			onChange?.(isMulti ? values : values[0] || null, {});
		}}>{flat.map((option: any) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>;
	},
	components: { Option: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));
vi.mock("react-select/creatable", () => ({
	default: ({ options = [], onChange, value, id, name }: any) => <select aria-label={id || name || "select"} multiple value={(value || []).map((item: any) => String(item.value))} onChange={(event) => {
		const values = Array.from(event.currentTarget.selectedOptions).map((item) => ({ label: item.value, value: item.value }));
		onChange?.(values, {});
	}}>{options.map((option: any) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>,
}));
vi.mock("@uiw/react-textarea-code-editor", () => ({
	default: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

import {
	AccessClientFields,
	AccessField,
	BasicAuthFields,
	DNSProviderFields,
	DomainNamesField,
	LocationsFields,
	NginxConfigField,
	ProxyDirectivesFields,
	SSLCertificateField,
	SSLOptionsFields,
} from ".";

afterEach(cleanup);

const renderForm = (initialValues: any, children: ReactNode) => render(
	<Formik initialValues={initialValues} onSubmit={() => undefined}>
		<Form>{children}</Form>
	</Formik>,
);

describe("form fields", () => {
	it("renders selectors, certificate options, DNS controls, and validation helpers", () => {
		renderForm({
			accessListId: 2, certificateId: "new", domainNames: ["example.test"], advancedConfig: "proxy_set_header X Y;",
			sslForced: true, http2Support: true, hstsEnabled: true, hstsSubdomains: true, trustForwardedProto: true,
			meta: { dnsChallenge: true, dnsProvider: "cloudflare", dnsProviderCredentials: "token", propagationSeconds: 30 },
		}, <>
			<AccessField /><DomainNamesField maxDomains={4} isWildcardPermitted /><NginxConfigField />
			<SSLCertificateField allowNew /><SSLOptionsFields forProxyHost requireDomainNames />
			<DNSProviderFields showBoundaryBox />
		</>);

		expect(screen.getByText("Private")).toBeInTheDocument();
		expect(screen.getByText("Wildcard")).toBeInTheDocument();
		for (const select of screen.getAllByRole("combobox")) {
			if (select.querySelector("option")) fireEvent.change(select, { target: { value: select.querySelector("option")?.value } });
		}
		for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
		for (const textbox of screen.getAllByRole("textbox")) fireEvent.change(textbox, { target: { value: "changed" } });
	});

	it("adds, edits, and removes access clients and basic-auth users", () => {
		renderForm({ clients: [{ directive: "allow", address: "10.0.0.0/8" }], items: [{ username: "alice", password: "secret" }] }, <>
			<AccessClientFields name="clients" initialValues={[{ directive: "allow", address: "10.0.0.0/8" }]} />
			<BasicAuthFields name="items" initialValues={[{ username: "alice", password: "secret" }]} />
		</>);
		for (const input of screen.getAllByRole("textbox")) fireEvent.change(input, { target: { value: "updated" } });
		for (const button of screen.getAllByRole("button")) fireEvent.click(button);
		expect(screen.getByText("access-list.help.rules-order")).toBeInTheDocument();
	});

	it("renders and changes all structured proxy directive groups", () => {
		const config = {
			proxyHttpVersion: "1.1", proxyMethod: "GET", clientMaxBodySize: "50m", proxyPassRequestHeaders: true,
			proxyPassRequestBody: true, proxyPassTrailers: true, proxyRequestBuffering: true, proxyNextUpstream: ["error"],
			proxyBuffering: true, requestHeaders: [{ name: "X-In", operation: "set", valueMode: "variable", value: "$host" }],
			responseHeaders: [{ name: "X-Out", operation: "remove", valueMode: "literal", value: "" }],
			proxyHideHeaders: ["Server"], proxyPassHeaders: ["Date"], proxyCookieDomain: [{ from: "internal", to: "public" }],
			proxyCookiePath: [{ from: "/old", to: "/new" }], proxyRedirect: "default", proxyRedirectFrom: "http://old", proxyRedirectTo: "https://new",
		};
		renderForm({ nginxConfig: { server: config }, overrides: [] },
			<ProxyDirectivesFields name="nginxConfig.server" scope="server" overrideKeysName="overrides" />,
		);
		expect(screen.getByText("nginx-options.protocol-request")).toBeInTheDocument();
		for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
		for (const element of screen.getAllByRole("combobox")) {
			const select = element as HTMLSelectElement;
			fireEvent.change(select, { target: { value: select.options[select.options.length - 1]?.value } });
		}
		for (const input of screen.getAllByRole("textbox")) fireEvent.change(input, { target: { value: "changed" } });
		for (const button of screen.getAllByRole("button")) fireEvent.click(button);
	});

	it("covers location target, path, advanced, override, add, and removal flows", () => {
		const locations = [
			{ path: "/api", matchType: "prefix", pathMode: "replace_prefix", forwardPath: "/v2", advancedConfig: "add_header X Y;", target: { type: "direct", scheme: "http", host: "127.0.0.1", port: 8080 }, nginxConfig: {} },
			{ path: "^/assets", matchType: "regex", pathMode: "preserve_uri", advancedConfig: "", target: { type: "upstream", scheme: "https", upstreamId: 9 }, nginxConfig: { proxyHttpVersion: "1.1" }, nginxOverrideKeys: ["proxyHttpVersion"] },
		];
		renderForm({ locations, nginxConfig: { server: { proxyReadTimeout: "60s", defaultLocationEnabled: true } } },
			<LocationsFields initialValues={locations as any} />,
		);
		expect(screen.getAllByText(/location /).length).toBeGreaterThan(0);
		fireEvent.change(document.getElementById("location-match-0")!, { target: { value: "exact" } });
		fireEvent.change(document.getElementById("location-target-type-0")!, { target: { value: "upstream" } });
		fireEvent.change(document.getElementById("location-scheme-0")!, { target: { value: "https" } });
		for (const button of screen.getAllByRole("button")) {
			if (button.isConnected) fireEvent.click(button);
		}
	});

	it("renders the empty location state and creates the first location", () => {
		renderForm({ locations: [] }, <LocationsFields initialValues={[]} defaultLocationEnabled={false} />);
		expect(screen.getByText("proxy-host.location.empty.help.no-default")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "action.add-location" }));
		expect(document.getElementById("location-path-0")).toBeInTheDocument();
	});

	it("forces DNS for new certificates and disables HTTP toggles without a certificate", () => {
		const first = renderForm({ certificateId: "new", meta: {}, domainNames: [] }, <SSLOptionsFields forceDNSForNew requireDomainNames />);
		expect(screen.getByRole("checkbox", { name: "domains.use-dns" })).toBeDisabled();
		first.unmount();
		renderForm({ certificateId: 0, sslForced: false, http2Support: false, hstsEnabled: false, hstsSubdomains: false, meta: {} }, <SSLOptionsFields forHttp forProxyHost />);
		for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
	});
});
