import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getLog: vi.fn(), remove: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: (component: unknown) => component, show: vi.fn() } }));
vi.mock("src/api/backend", () => ({ getNginxHostLog: (...args: unknown[]) => mocks.getLog(...args) }));
vi.mock("src/modules/AuthStore", () => ({ default: { token: { token: "test-token" } } }));

import { boundedLines, NginxLogViewerModal, parseSseFrame, splitLines } from "./NginxLogViewerModal";

const internals = { id: "nginx-log-modal", hide: vi.fn(), resolve: vi.fn(), reject: vi.fn() };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
	vi.clearAllMocks();
	Element.prototype.scrollIntoView = vi.fn();
	window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 1; };
	mocks.getLog.mockResolvedValue({ content: "alpha\r\nERROR beta\nalpha\n", nextCursor: "cursor-1", truncated: false, file: { exists: true, generation: "g1" } });
	const frames = [
		"event: ready\nid: cursor-1\ndata: {\"cursor\":\"cursor-1\"}\n\n",
		"event: append\nid: cursor-2\ndata: {\"content\":\"gamma\\n\",\"next_cursor\":\"cursor-2\"}\n\n",
	].join("");
	let reads = 0;
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body: { getReader: () => ({ read: () => reads++ === 0 ? Promise.resolve({ done: false, value: new TextEncoder().encode(frames) }) : new Promise(() => undefined) }) } }));
});

describe("NginxLogViewerModal", () => {
	it("normalizes, bounds, and parses log stream data", () => {
		expect(splitLines("one\r\ntwo\n")).toEqual(["one", "two"]);
		expect(boundedLines(Array.from({ length: 10_005 }, (_, index) => `${index}`))).toHaveLength(10_000);
		expect(boundedLines(["x".repeat(1024 * 1024), "y".repeat(1024 * 1024), "z"])).toEqual(["y".repeat(1024 * 1024), "z"]);
		expect(parseSseFrame(": ping\nevent: append\nid: 2\ndata: {\"content\":\"line\"}\n")).toEqual({ event: "append", id: "2", data: { content: "line" } });
		expect(parseSseFrame("ignored\nevent: append\ndata: {\ndata: \"content\":\"line\"}\n")).toEqual({ event: "append", id: undefined, data: { content: "line" } });
		expect(parseSseFrame("data: {}\n")).toBeNull();
		expect(parseSseFrame("event: append\ndata: nope\n")).toBeNull();
	});

	it("loads a snapshot, follows additions, searches, switches logs, and closes", async () => {
		render(<NginxLogViewerModal {...internals} hostType="proxy-hosts" hostId={7} label="example.test" visible remove={mocks.remove} />);
		expect(await screen.findByText("ERROR beta")).toBeInTheDocument();
		expect(await screen.findByText("gamma")).toBeInTheDocument();
		await waitFor(() => expect(screen.getByText("Live")).toBeInTheDocument());
		expect(fetch).toHaveBeenCalledWith(expect.stringContaining("cursor=cursor-1"), expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }));

		fireEvent.change(screen.getByRole("textbox", { name: "Search logs" }), { target: { value: "alpha" } });
		expect(screen.getByText("1/2 matches")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Next match" }));
		fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
		fireEvent.click(screen.getByRole("button", { name: "Match case" }));
		fireEvent.keyDown(window, { key: "n" });
		fireEvent.keyDown(window, { key: "N" });
		fireEvent.keyDown(window, { key: "/" });
		fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

		fireEvent.scroll(screen.getByText("The viewer retains the latest 10,000 lines or 2 MiB.").previousElementSibling!, { target: { scrollTop: 0 } });
		fireEvent.click(screen.getByRole("button", { name: "Error log" }));
		await waitFor(() => expect(mocks.getLog).toHaveBeenCalledWith("proxy-hosts", 7, "error"));
		fireEvent.click(screen.getByTitle("Close log viewer"));
		const closeButtons = screen.getAllByRole("button", { name: "Close" });
		fireEvent.click(closeButtons[closeButtons.length - 1]);
		expect(mocks.remove).toHaveBeenCalledTimes(2);
	});

	it("shows snapshot failures and skips loading while hidden", async () => {
		mocks.getLog.mockRejectedValueOnce(new Error("log unavailable"));
		render(<NginxLogViewerModal {...internals} hostType="streams" hostId={2} label="tcp" visible remove={mocks.remove} />);
		expect(await screen.findByText("log unavailable")).toBeInTheDocument();
		cleanup();
		mocks.getLog.mockClear();
		render(<NginxLogViewerModal {...internals} hostType="streams" hostId={2} label="tcp" visible={false} remove={mocks.remove} />);
		expect(mocks.getLog).not.toHaveBeenCalled();
	});

	it("reports missing and truncated files and handles stream reset and close events", async () => {
		mocks.getLog.mockResolvedValueOnce({ content: "", nextCursor: "cursor-1", truncated: false, file: { exists: false } });
		const { unmount } = render(<NginxLogViewerModal {...internals} hostType="dead-hosts" hostId={3} label="missing" visible remove={mocks.remove} />);
		expect(await screen.findByText("This log file does not exist yet. Waiting for Nginx to create it.")).toBeInTheDocument();
		unmount();

		mocks.getLog.mockResolvedValueOnce({ content: "old", nextCursor: "cursor-2", truncated: true, file: { exists: true } });
		const frames = "event: reset\ndata: {\"content\":\"fresh\\n\",\"reset_reason\":\"truncated\"}\n\nevent: close\ndata: {\"reason\":\"rotation\"}\n\n";
		let reads = 0;
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body: { getReader: () => ({ read: () => reads++ === 0 ? Promise.resolve({ done: false, value: new TextEncoder().encode(frames) }) : new Promise(() => undefined) }) } }));
		render(<NginxLogViewerModal {...internals} hostType="dead-hosts" hostId={3} label="truncated" visible remove={mocks.remove} />);
		expect(await screen.findByText("fresh")).toBeInTheDocument();
		expect(await screen.findByText("rotation")).toBeInTheDocument();
	});

	it("reloads the snapshot after a stale live cursor and reports unmatched searches", async () => {
		const pending = { ok: true, status: 200, body: { getReader: () => ({ read: () => new Promise(() => undefined) }) } };
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce({ ok: false, status: 400, body: null })
			.mockResolvedValue(pending));
		render(<NginxLogViewerModal {...internals} hostType="proxy-hosts" hostId={8} label="reload" visible remove={mocks.remove} />);
		await waitFor(() => expect(mocks.getLog).toHaveBeenCalledTimes(2));
		expect(await screen.findByText("Log reloaded.")).toBeInTheDocument();
		const search = screen.getByRole("textbox", { name: "Search logs" });
		fireEvent.change(search, { target: { value: "not-present" } });
		expect(screen.getByText("No matches")).toBeInTheDocument();
		fireEvent.keyDown(search, { key: "n" });
		fireEvent.keyDown(window, { key: "?" });
		fireEvent.click(screen.getByTitle("Reload log"));
		await waitFor(() => expect(mocks.getLog.mock.calls.length).toBeGreaterThan(2));
	});
});
