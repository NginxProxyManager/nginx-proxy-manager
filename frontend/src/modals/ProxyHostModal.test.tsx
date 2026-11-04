import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import EasyModal from "ez-modal-react";
import { LocaleProvider } from "src/context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showProxyHostModal } from "./ProxyHostModal";

const host = {
	id: 1,
	created_on: "2026-01-01 00:00:00",
	modified_on: "2026-01-01 00:00:00",
	owner_user_id: 1,
	domain_names: ["a.example.com"],
	forward_scheme: "http",
	forward_host: "app",
	forward_port: 80,
	access_list_id: 0,
	certificate_id: 0,
	ssl_forced: false,
	caching_enabled: false,
	block_exploits: false,
	advanced_config: "",
	meta: {},
	allow_websocket_upgrade: false,
	http2_support: false,
	enabled: true,
	locations: [],
	hsts_enabled: false,
	hsts_subdomains: false,
};

const me = {
	id: 1,
	name: "Admin",
	nickname: "admin",
	email: "admin@example.com",
	roles: ["admin"],
	permissions: {
		visibility: "all",
		proxy_hosts: "manage",
		redirection_hosts: "manage",
		dead_hosts: "manage",
		streams: "manage",
		access_lists: "manage",
		certificates: "manage",
	},
};

// A user who isn't an admin and manages the proxy hosts
const user = { ...me, id: 2, name: "User", nickname: "user", email: "user@example.com", roles: [] };

let currentUser: typeof me = me;
let currentHost: typeof host = host;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let putBodies: any[] = [];

beforeEach(() => {
	localStorage.clear();
	putBodies = [];
	currentUser = me;
	currentHost = host;
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async (input, init) => {
			const url = String(input);
			if (init?.method === "PUT" && url.startsWith("/api/nginx/proxy-hosts/1")) {
				putBodies.push(JSON.parse(String(init.body)));
				// saved, but nginx could not load a custom location: it is quarantined
				return json({
					...host,
					forward_port: putBodies[0].forward_port,
					meta: {
						nginx_online: true,
						nginx_locations: [
							{ index: 0, path: "/api", status: "quarantined", mode: null, message: "unknown variable" },
						],
					},
				});
			}
			if (url.startsWith("/api/users/me")) return json(currentUser);
			if (url.startsWith("/api/nginx/proxy-hosts/1")) return json(currentHost);
			if (url.startsWith("/api/nginx/access-lists") || url.startsWith("/api/nginx/certificates")) return json([]);
			return json({});
		}),
	);
	vi.stubGlobal("confirm", vi.fn(() => false));
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const open = async () => {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<LocaleProvider>
				<EasyModal.Provider />
			</LocaleProvider>
		</QueryClientProvider>,
	);
	await act(async () => {
		showProxyHostModal(1);
	});
	await waitFor(() => expect(document.getElementById("forwardPort")).not.toBeNull());
};

const saveWithWarning = async () => {
	await open();
	const port = document.getElementById("forwardPort") as HTMLInputElement;
	fireEvent.change(port, { target: { value: "8081" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	const warning = await screen.findByTestId("save-warning");
	expect(putBodies).toHaveLength(1);
	expect(putBodies[0].forward_port).toBe(8081);
	return warning;
};

describe("ProxyHostModal save with warnings", () => {
	it("closes without an unsaved-changes prompt after the save went through", async () => {
		const warning = await saveWithWarning();
		expect(document.getElementById("forwardPort")).toHaveValue(8081);

		fireEvent.click(within(warning).getByRole("button"));

		expect(window.confirm).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByTestId("save-warning")).not.toBeInTheDocument());
	});

	it("still asks before discarding an edit made after the save", async () => {
		const warning = await saveWithWarning();
		fireEvent.change(document.getElementById("forwardPort") as HTMLInputElement, { target: { value: "8082" } });

		fireEvent.click(within(warning).getByRole("button"));

		expect(window.confirm).toHaveBeenCalledOnce();
		// confirm() answered "no": the modal and the edit stay
		expect(screen.getByTestId("save-warning")).toBeInTheDocument();
		expect(document.getElementById("forwardPort")).toHaveValue(8082);
	});
});

describe("ProxyHostModal for a user who isn't an admin", () => {
	it("sends the saved advanced config of the host and of its locations back unchanged", async () => {
		currentUser = user;
		currentHost = {
			...host,
			advanced_config: "add_header X-Host 1;",
			locations: [
				{ path: "~ ^/img", forward_scheme: "http", forward_host: "img", forward_port: 80, advanced_config: "expires 1d;" },
				{ path: "~ ^/img", forward_scheme: "http", forward_host: "img", forward_port: 80, advanced_config: "expires 7d;" },
			],
		} as any;
		await open();
		fireEvent.change(document.getElementById("forwardPort") as HTMLInputElement, { target: { value: "8081" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await screen.findByTestId("save-warning");

		expect(putBodies).toHaveLength(1);
		expect(putBodies[0]).not.toHaveProperty("advanced_config");
		expect(putBodies[0].locations.map((l: any) => l.advanced_config)).toEqual(["expires 1d;", "expires 7d;"]);
	});
});
