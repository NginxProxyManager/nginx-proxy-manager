import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UpstreamCandidate, UpstreamCandidates, UpstreamSuggestion } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerLabelsList, splitLabelledContainers, suggestionPrefill } from "./DockerLabelsModal";

vi.mock("src/hooks", () => ({ useUpstreamCandidates: () => ({}) }));
vi.mock("./ProxyHostModal", () => ({ showProxyHostModal: () => {} }));

const suggestion = (s: Partial<UpstreamSuggestion>): UpstreamSuggestion => ({
	domainNames: [],
	forwardScheme: "http",
	forwardHost: "x",
	forwardPort: null,
	allowWebsocketUpgrade: false,
	blockExploits: false,
	cachingEnabled: false,
	http2Support: false,
	ignoredDomains: [],
	existingHostId: null,
	existingHostType: null,
	...s,
});

const candidate = (c: Partial<UpstreamCandidate>): UpstreamCandidate => ({
	host: "x",
	label: "x",
	source: "docker",
	ports: [],
	hintPort: null,
	hintScheme: null,
	network: "npm_default",
	state: "running",
	ip: null,
	usedBy: 0,
	...c,
});

const blog = candidate({
	host: "blog",
	label: "blog (container)",
	suggestion: suggestion({
		domainNames: ["blog.example.com", "www.blog.example.com"],
		forwardHost: "blog",
		forwardPort: 2368,
		allowWebsocketUpgrade: true,
		blockExploits: true,
		http2Support: true,
	}),
});
const shop = candidate({
	host: "shop",
	label: "shop (container)",
	state: "exited",
	suggestion: suggestion({
		domainNames: ["shop.example.com"],
		forwardHost: "shop",
		existingHostId: 7,
		existingHostType: "proxy_host",
	}),
});
const worker = candidate({
	host: "worker",
	label: "worker (container)",
	suggestion: suggestion({ forwardHost: "worker", forwardPort: 9000, forwardScheme: "https" }),
});
// compose service alias: no suggestion, must not be listed twice
const blogService = candidate({ host: "web", label: "web (compose service of blog)" });
const fromHistory = candidate({ host: "old", source: "history" });

const data = (items: UpstreamCandidate[], docker: "ok" | "disabled" = "ok"): UpstreamCandidates => ({
	providers: {
		docker: { status: docker, message: docker === "ok" ? null : "Docker discovery is disabled." },
		dns: { status: "ok", message: null },
		history: { status: "ok", message: null },
	},
	items,
	generatedAt: "2026-11-04T10:00:00Z",
});

const onCreate = vi.fn();
const onOpen = vi.fn();

afterEach(() => {
	cleanup();
	onCreate.mockReset();
	onOpen.mockReset();
});

describe("DockerLabelsModal helpers", () => {
	it("splits containers with and without npm.domain, once per container", () => {
		const { labelled, other } = splitLabelledContainers(data([worker, shop, blogService, blog, fromHistory]));
		expect(labelled.map((c) => c.host)).toEqual(["blog", "shop"]);
		expect(other.map((c) => c.host)).toEqual(["worker"]);
		expect(splitLabelledContainers(undefined)).toEqual({ labelled: [], other: [] });
	});

	it("prefills everything for labelled containers, only the target otherwise", () => {
		expect(suggestionPrefill(blog.suggestion as UpstreamSuggestion)).toEqual({
			domainNames: ["blog.example.com", "www.blog.example.com"],
			forwardScheme: "http",
			forwardHost: "blog",
			forwardPort: 2368,
			allowWebsocketUpgrade: true,
			blockExploits: true,
			cachingEnabled: false,
			http2Support: true,
		});
		expect(suggestionPrefill(worker.suggestion as UpstreamSuggestion)).toEqual({
			forwardScheme: "https",
			forwardHost: "worker",
			forwardPort: 9000,
		});
		// unknown port is left for the user
		expect(suggestionPrefill(suggestion({ forwardHost: "a" }))).not.toHaveProperty("forwardPort");
	});
});

describe("DockerLabelsList", () => {
	const renderModal = (d: UpstreamCandidates) => {
		render(<DockerLabelsList data={d} onCreate={onCreate} onOpen={onOpen} />);
	};

	it("creates a prefilled proxy host, or opens the existing one", async () => {
		renderModal(data([blog, shop, worker]));
		const blogRow = await screen.findByTestId("labelled-blog");
		expect(blogRow.textContent).toContain("blog.example.com");
		expect(blogRow.textContent).toContain("http://blog:2368");
		fireEvent.click(blogRow.querySelector("button") as HTMLElement);
		expect(onCreate).toHaveBeenCalledWith(
			expect.objectContaining({ domainNames: ["blog.example.com", "www.blog.example.com"], forwardPort: 2368 }),
		);
	});

	it("shows Open for a container whose domain is already a proxy host", async () => {
		renderModal(data([blog, shop]));
		const shopRow = await screen.findByTestId("labelled-shop");
		expect(shopRow.textContent).toContain("exited");
		fireEvent.click(shopRow.querySelector("button") as HTMLElement);
		expect(onOpen).toHaveBeenCalledWith("proxy_host", 7);
		expect(onCreate).not.toHaveBeenCalled();
		expect(screen.queryByTestId("used-by")).toBeNull();
	});

	it("explains a domain taken by a redirection or 404 host instead of offering Create", async () => {
		const redirected = candidate({
			host: "wiki",
			suggestion: suggestion({
				domainNames: ["wiki.example.com"],
				forwardHost: "wiki",
				existingHostId: 4,
				existingHostType: "redirection_host",
			}),
		});
		const dead = candidate({
			host: "gone",
			suggestion: suggestion({
				domainNames: ["gone.example.com"],
				forwardHost: "gone",
				existingHostId: 5,
				existingHostType: "dead_host",
			}),
		});
		renderModal(data([redirected, dead]));
		const wikiRow = await screen.findByTestId("labelled-wiki");
		expect(wikiRow.querySelectorAll("button")).toHaveLength(1);
		expect(wikiRow.querySelector("[data-testid=used-by]")?.textContent).toContain("redirection host");
		fireEvent.click(wikiRow.querySelector("button") as HTMLElement);
		expect(onOpen).toHaveBeenCalledWith("redirection_host", 4);
		const goneRow = screen.getByTestId("labelled-gone");
		expect(goneRow.querySelector("[data-testid=used-by]")?.textContent).toContain("404 host");
		fireEvent.click(goneRow.querySelector("button") as HTMLElement);
		expect(onOpen).toHaveBeenCalledWith("dead_host", 5);
		expect(onCreate).not.toHaveBeenCalled();
	});

	it("says which npm.domain entries were not used, and shows such containers right away", async () => {
		const partly = candidate({
			host: "partly",
			suggestion: suggestion({ domainNames: ["ok.example.com"], ignoredDomains: ["bad!.example.com"] }),
		});
		const onlyBad = candidate({
			host: "onlybad",
			suggestion: suggestion({ forwardHost: "onlybad", ignoredDomains: ["*.com"] }),
		});
		renderModal(data([partly, onlyBad, worker]));
		const row = await screen.findByTestId("labelled-partly");
		expect(row.querySelector("[data-testid=ignored-domains]")?.textContent).toContain("bad!.example.com");
		// "Other" is open because a container there had an npm.domain label without a usable name
		const other = screen.getByTestId("other-onlybad");
		expect(other.querySelector("[data-testid=ignored-domains]")?.textContent).toContain("*.com");
		expect(screen.getByTestId("other-worker").querySelector("[data-testid=ignored-domains]")).toBeNull();
	});

	it("lists other containers collapsed and explains the labels when none are labelled", async () => {
		renderModal(data([worker]));
		expect(await screen.findByTestId("docker-labels-empty")).toBeTruthy();
		expect(screen.getByTestId("compose-example").textContent).toContain("npm.domain:");
		expect(screen.queryByTestId("other-containers")).toBeNull();
		fireEvent.click(screen.getByTestId("toggle-other-containers"));
		const row = screen.getByTestId("other-worker");
		fireEvent.click(row.querySelector("button") as HTMLElement);
		expect(onCreate).toHaveBeenCalledWith({
			forwardScheme: "https",
			forwardHost: "worker",
			forwardPort: 9000,
		});
	});

	it("says why when Docker can't be read", async () => {
		renderModal(data([], "disabled"));
		expect((await screen.findByTestId("docker-unavailable")).textContent).toContain(
			"Docker discovery is disabled.",
		);
		expect(screen.queryByTestId("docker-labels-empty")).toBeNull();
	});
});
