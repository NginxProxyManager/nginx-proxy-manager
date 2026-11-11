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
// when set, a PUT waits for it: the save is still in flight
let putGate: Promise<void> | null = null;
let testBodies: any[] = [];
let postBodies: any[] = [];
// what GET /api/upstreams/candidates lists
let candidateItems: any[] = [];

beforeEach(() => {
	localStorage.clear();
	putBodies = [];
	putGate = null;
	testBodies = [];
	postBodies = [];
	candidateItems = [];
	currentUser = me;
	currentHost = host;
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async (input, init) => {
			const url = String(input);
			if (init?.method === "PUT" && url.startsWith("/api/nginx/proxy-hosts/1")) {
				putBodies.push(JSON.parse(String(init.body)));
				if (putGate) await putGate;
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
			if (init?.method === "POST" && url.startsWith("/api/nginx/proxy-hosts/test")) {
				testBodies.push(JSON.parse(String(init.body)));
				return json({
					ok: true,
					nginx_online: true,
					nginx_err: null,
					nginx_details: null,
					nginx_locations: [],
					upstreams: [],
					warnings: [],
				});
			}
			if (init?.method === "POST" && url === "/api/nginx/proxy-hosts") {
				postBodies.push(JSON.parse(String(init.body)));
				return json({ ...host, ...postBodies[postBodies.length - 1], id: 9, meta: {} }, 201);
			}
			if (url.startsWith("/api/upstreams/candidates")) {
				return json({
					providers: {
						docker: { status: "ok", code: null, message: null },
						dns: { status: "ok", code: null, message: null },
						history: { status: "ok", code: null, message: null },
					},
					items: candidateItems,
					generated_at: "2026-11-11T10:00:00Z",
				});
			}
			if (url.startsWith("/api/users/me")) return json(currentUser);
			if (url.startsWith("/api/nginx/proxy-hosts/1")) return json(currentHost);
			if (url.startsWith("/api/nginx/access-lists") || url.startsWith("/api/nginx/certificates")) return json([]);
			return json({});
		}),
	);
	vi.stubGlobal(
		"confirm",
		vi.fn(() => false),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const open = async (id: number | "new" = 1) => {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<LocaleProvider>
				<EasyModal.Provider />
			</LocaleProvider>
		</QueryClientProvider>,
	);
	await act(async () => {
		showProxyHostModal(id);
	});
	await screen.findByRole("tablist");
	return screen.getAllByRole("tab");
};

const selected = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");

describe("ProxyHostModal tabs", () => {
	it("keeps only the active tab in the tab order", async () => {
		const tabs = await open();
		expect(tabs).toHaveLength(4);
		expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual([null, "-1", "-1", "-1"]);
		expect(tabs[0]).toHaveAttribute("aria-controls", "tab-details");
		expect(document.getElementById("tab-details")).toHaveAttribute("aria-labelledby", "tab-link-details");
	});

	it("moves between the tabs with the arrow keys, Home and End, and takes the focus along", async () => {
		const tabs = await open();
		tabs[0].focus();

		fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
		expect(selected()).toBe(tabs[1]);
		expect(document.activeElement).toBe(tabs[1]);
		expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["-1", null, "-1", "-1"]);
		expect(document.getElementById("tab-locations")).toHaveClass("active");

		fireEvent.keyDown(tabs[1], { key: "ArrowDown" });
		expect(document.activeElement).toBe(tabs[2]);
		fireEvent.keyDown(tabs[2], { key: "End" });
		expect(selected()).toBe(tabs[3]);
		expect(document.activeElement).toBe(tabs[3]);
		// wraps around at both ends
		fireEvent.keyDown(tabs[3], { key: "ArrowRight" });
		expect(document.activeElement).toBe(tabs[0]);
		fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
		expect(document.activeElement).toBe(tabs[3]);
		fireEvent.keyDown(tabs[3], { key: "ArrowUp" });
		expect(document.activeElement).toBe(tabs[2]);
		fireEvent.keyDown(tabs[2], { key: "Home" });
		expect(selected()).toBe(tabs[0]);
		expect(document.activeElement).toBe(tabs[0]);
	});

	it("leaves out the Advanced tab for a user who isn't an admin", async () => {
		currentUser = user;
		const tabs = await open();
		expect(tabs).toHaveLength(3);
		expect(document.getElementById("tab-advanced")).toBeNull();

		tabs[0].focus();
		fireEvent.keyDown(tabs[0], { key: "End" });
		expect(selected()).toBe(tabs[2]);
		expect(document.activeElement).toBe(tabs[2]);
		fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
		expect(document.activeElement).toBe(tabs[0]);
		fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
		expect(document.activeElement).toBe(tabs[2]);
	});

	it("ignores other keys and still switches on click", async () => {
		const tabs = await open();
		fireEvent.keyDown(tabs[0], { key: "a" });
		expect(selected()).toBe(tabs[0]);
		fireEvent.click(tabs[2]);
		expect(selected()).toBe(tabs[2]);
	});
});

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
				{
					path: "~ ^/img",
					forward_scheme: "http",
					forward_host: "img",
					forward_port: 80,
					advanced_config: "expires 1d;",
				},
				{
					path: "~ ^/img",
					forward_scheme: "http",
					forward_host: "img",
					forward_port: 80,
					advanced_config: "expires 7d;",
				},
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

	it("tests what a save would send, without an advanced config of its own", async () => {
		currentUser = user;
		currentHost = {
			...host,
			advanced_config: "add_header X-Host 1;",
			locations: [
				{
					path: "/api",
					forward_scheme: "http",
					forward_host: "api",
					forward_port: 80,
					advanced_config: "expires 1d;",
				},
			],
		} as any;
		await open();
		fireEvent.click(screen.getByRole("button", { name: "Test" }));
		await waitFor(() => expect(testBodies).toHaveLength(1));

		expect(testBodies[0]).not.toHaveProperty("advanced_config");
		expect(testBodies[0].locations.map((l: any) => l.advanced_config)).toEqual(["expires 1d;"]);
	});
});

describe("ProxyHostModal locations while saving", () => {
	it("keeps the shown locations and the saved ones the same when the save returns a warning", async () => {
		currentHost = {
			...host,
			locations: [
				{ path: "/api", forward_scheme: "http", forward_host: "app", forward_port: 80, advanced_config: "" },
			],
		} as any;
		const tabs = await open();
		fireEvent.click(tabs[1]);
		fireEvent.click(screen.getByRole("button", { name: /\/api/ }));
		const path = () => screen.getByPlaceholderText("/path") as HTMLInputElement;
		fireEvent.change(path(), { target: { value: "/api2" } });

		let release = () => {};
		putGate = new Promise<void>((resolve) => {
			release = resolve;
		});
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(putBodies).toHaveLength(1));

		// the save is in flight: the locations can't be edited
		await waitFor(() => expect(path()).toBeDisabled());
		fireEvent.change(path(), { target: { value: "/newer" } });
		expect(screen.getByRole("button", { name: "Add Location" })).toBeDisabled();

		await act(async () => release());
		await screen.findByTestId("save-warning");
		await waitFor(() => expect(path()).not.toBeDisabled());

		// what is shown is what was submitted, and what the next save sends
		expect(putBodies[0].locations.map((l: any) => l.path)).toEqual(["/api2"]);
		expect(path()).toHaveValue("/api2");
		putGate = null;
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(putBodies).toHaveLength(2));
		expect(putBodies[1].locations.map((l: any) => l.path)).toEqual(["/api2"]);
	});

	it("blocks the Details fields while a save is in flight, so no edit is lost to a save with warnings", async () => {
		await open();
		const input = screen.getByDisplayValue("80") as HTMLInputElement;
		const port = () => input;
		fireEvent.change(port(), { target: { value: "81" } });
		let release = () => {};
		putGate = new Promise<void>((resolve) => {
			release = resolve;
		});
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(putBodies).toHaveLength(1));
		await waitFor(() => expect(port()).toBeDisabled());
		await act(async () => release());
		await screen.findByTestId("save-warning");
		await waitFor(() => expect(port()).not.toBeDisabled());
		expect(port()).toHaveValue(81);
	});
});

const container = (host: string, suggestion: Record<string, unknown>) => ({
	host,
	kind: "container",
	owner: null,
	source: "docker",
	ports: [2368],
	hint_port: 2368,
	hint_scheme: null,
	network: "npm_default",
	state: "running",
	ip: null,
	used_by: 0,
	suggestion: {
		domain_names: [],
		forward_scheme: "http",
		forward_host: host,
		forward_port: 2368,
		allow_websocket_upgrade: false,
		block_exploits: false,
		caching_enabled: false,
		http2_support: false,
		ignored_domains: [],
		existing_host_id: null,
		existing_host_type: null,
		...suggestion,
	},
});

const blogContainer = container("blog", {
	domain_names: ["blog.example.com", "www.blog.example.com"],
	allow_websocket_upgrade: true,
	block_exploits: true,
	http2_support: true,
});

const pick = async (host: string) => {
	const input = document.getElementById("forwardHost") as HTMLInputElement;
	fireEvent.focus(input);
	fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
	const name = await screen.findByText(host, { selector: ".react-select__option strong" });
	fireEvent.click(name);
};

const domainChips = () =>
	Array.from(document.querySelectorAll("#domainNames .react-select__multi-value__label")).map((e) => e.textContent);
const toggle = (id: string) => document.getElementById(id) as HTMLInputElement;

const save = async (bodies: () => any[]) => {
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(bodies()).toHaveLength(1));
	return bodies()[0];
};

describe("ProxyHostModal picking a labelled container", () => {
	it("fills the domains, target and switches of a new host", async () => {
		candidateItems = [blogContainer];
		await open("new");
		await pick("blog");

		expect(domainChips()).toEqual(["blog.example.com", "www.blog.example.com"]);
		expect(document.getElementById("forwardPort")).toHaveValue(2368);
		expect(toggle("allowWebsocketUpgrade").checked).toBe(true);
		expect(toggle("blockExploits").checked).toBe(true);
		expect(toggle("cachingEnabled").checked).toBe(false);
		expect(screen.queryByTestId("label-hint")).toBeNull();

		const body = await save(() => postBodies);
		expect(body).toMatchObject({
			domain_names: ["blog.example.com", "www.blog.example.com"],
			forward_scheme: "http",
			forward_host: "blog",
			forward_port: 2368,
			allow_websocket_upgrade: true,
			block_exploits: true,
			caching_enabled: false,
			// npm.http2 waits for a certificate
			http2_support: false,
		});
	});

	it("keeps the domains and switches the user set", async () => {
		candidateItems = [blogContainer];
		await open("new");
		const domains = document.querySelector("#domainNames input") as HTMLInputElement;
		fireEvent.change(domains, { target: { value: "mine.example.com" } });
		fireEvent.keyDown(domains, { key: "Enter", code: "Enter" });
		expect(domainChips()).toEqual(["mine.example.com"]);
		// switched on, and switched on and off again: both are the user's choice now
		fireEvent.click(toggle("cachingEnabled"));
		fireEvent.click(toggle("blockExploits"));
		fireEvent.click(toggle("blockExploits"));

		await pick("blog");

		expect(domainChips()).toEqual(["mine.example.com"]);
		expect(toggle("cachingEnabled").checked).toBe(true);
		expect(toggle("blockExploits").checked).toBe(false);
		// untouched: from the label
		expect(toggle("allowWebsocketUpgrade").checked).toBe(true);
	});

	it("replaces what an earlier pick filled in", async () => {
		candidateItems = [
			blogContainer,
			container("shop", { domain_names: ["shop.example.com"], caching_enabled: true }),
		];
		await open("new");
		await pick("blog");
		await pick("shop");

		expect(domainChips()).toEqual(["shop.example.com"]);
		expect(toggle("allowWebsocketUpgrade").checked).toBe(false);
		expect(toggle("blockExploits").checked).toBe(false);
		expect(toggle("cachingEnabled").checked).toBe(true);
	});

	it("drops what an earlier pick filled in when the next candidate has no labels", async () => {
		const wiki = container("wiki", {
			domain_names: ["wiki.example.com"],
			allow_websocket_upgrade: true,
			caching_enabled: true,
		});
		candidateItems = [
			{ ...wiki, hint_port: 3000, hint_scheme: "https", ports: [3000] },
			// a compose service alias, a DNS or a history entry: no suggestion
			{
				...wiki,
				host: "notes",
				kind: "history",
				source: "history",
				ports: [],
				hint_port: null,
				suggestion: undefined,
			},
		];
		await open("new");
		await pick("wiki");
		expect(domainChips()).toEqual(["wiki.example.com"]);
		expect(document.getElementById("forwardScheme")).toHaveValue("https");
		expect(document.getElementById("forwardPort")).toHaveValue(3000);
		expect(toggle("cachingEnabled").checked).toBe(true);
		// the user's own choice stays
		fireEvent.click(toggle("blockExploits"));

		await pick("notes");

		expect(domainChips()).toEqual([]);
		expect(document.getElementById("forwardScheme")).toHaveValue("http");
		expect(document.getElementById("forwardPort")).toHaveValue(null);
		expect(toggle("allowWebsocketUpgrade").checked).toBe(false);
		expect(toggle("cachingEnabled").checked).toBe(false);
		expect(toggle("blockExploits").checked).toBe(true);
	});

	it("doesn't keep an earlier pick's domains for a container whose domains have a host", async () => {
		candidateItems = [
			blogContainer,
			container("shop", {
				domain_names: ["shop.example.com"],
				existing_host_id: 4,
				existing_host_type: "redirection_host",
			}),
		];
		await open("new");
		await pick("blog");
		await pick("shop");

		expect(domainChips()).toEqual([]);
		expect(screen.getByTestId("label-existing-host")).toHaveTextContent("Used by a redirection host");
	});

	it("doesn't fill domains another host already has, and offers to open it", async () => {
		candidateItems = [
			container("blog", {
				domain_names: ["blog.example.com"],
				existing_host_id: 1,
				existing_host_type: "proxy_host",
			}),
		];
		await open("new");
		await pick("blog");

		expect(domainChips()).toEqual([]);
		expect(document.getElementById("forwardPort")).toHaveValue(2368);
		const hint = screen.getByTestId("label-existing-host");
		expect(hint).toHaveTextContent("A proxy host already uses one of these domains");

		// the picked target counts as an unsaved change: confirm() says no, the form stays
		fireEvent.click(screen.getByTestId("open-existing"));
		expect(window.confirm).toHaveBeenCalledOnce();
		expect(screen.getByTestId("label-existing-host")).toBeInTheDocument();

		vi.mocked(window.confirm).mockReturnValue(true);
		fireEvent.click(screen.getByTestId("open-existing"));
		// the existing host opens instead
		await waitFor(() => expect(document.getElementById("forwardHost")).toHaveValue("app"));
		expect(domainChips()).toEqual(["a.example.com"]);
	});

	it("marks the container in the dropdown", async () => {
		candidateItems = [
			blogContainer,
			container("shop", {
				domain_names: ["shop.example.com"],
				existing_host_id: 4,
				existing_host_type: "dead_host",
			}),
		];
		await open("new");
		const input = document.getElementById("forwardHost") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
		await screen.findByText("shop", { selector: ".react-select__option strong" });
		const badges = screen.getAllByTestId("existing-host-badge");
		expect(badges).toHaveLength(1);
		expect(badges[0]).toHaveAttribute("data-type", "dead_host");
		expect(screen.getAllByTestId("option-domains").map((e) => e.textContent)).toEqual([
			"blog.example.com, www.blog.example.com",
			"shop.example.com",
		]);
	});

	it("turns HTTP/2 on for npm.http2 once there is a certificate, picked before or after", async () => {
		const http2 = () => screen.getByLabelText("HTTP/2 Support") as HTMLInputElement;
		const pickCertificate = async () => {
			const ssl = document.getElementById("tab-ssl") as HTMLElement;
			// the certificate list loads first
			const control = await waitFor(() => {
				const c = ssl.querySelector(".react-select__control");
				expect(c).not.toBeNull();
				return c as HTMLElement;
			});
			fireEvent.mouseDown(control, { button: 0 });
			fireEvent.click(await within(ssl).findByText("Request a new Certificate"));
		};
		candidateItems = [blogContainer, container("plain", {})];

		// container first, then the certificate
		await open("new");
		await pick("blog");
		expect(http2().checked).toBe(false);
		await pickCertificate();
		await waitFor(() => expect(http2().checked).toBe(true));
		// a container without npm.http2 takes it back
		await pick("plain");
		expect(http2().checked).toBe(false);
		cleanup();

		// the certificate first, then the container
		await open("new");
		await pickCertificate();
		expect(http2().checked).toBe(false);
		await pick("blog");
		expect(http2().checked).toBe(true);
		// switched off by the user: a later pick leaves it off
		fireEvent.click(http2());
		await pick("plain");
		await pick("blog");
		expect(http2().checked).toBe(false);
	});

	it("never changes the domains or switches of a host being edited", async () => {
		candidateItems = [blogContainer];
		await open(1);
		await pick("blog");

		expect(domainChips()).toEqual(["a.example.com"]);
		expect(toggle("allowWebsocketUpgrade").checked).toBe(false);
		expect(toggle("blockExploits").checked).toBe(false);

		const body = await save(() => putBodies);
		expect(body).toMatchObject({
			domain_names: ["a.example.com"],
			forward_host: "blog",
			// the saved port is free to replace
			forward_port: 2368,
			allow_websocket_upgrade: false,
			block_exploits: false,
		});
	});
});
