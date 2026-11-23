import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HostMeta, UpstreamHostHealth } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostStatusFormatter } from "./HostStatusFormatter";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));

const statusEl = (container: HTMLElement) => container.querySelector(".status") as HTMLElement;

describe("HostStatusFormatter", () => {
	afterEach(() => cleanup());

	it("shows disabled hosts in grey, whatever their meta says", () => {
		const { container } = render(
			<HostStatusFormatter enabled={false} meta={{ nginxOnline: false, nginxErr: "broken" }} />,
		);
		expect(statusEl(container)).toHaveClass("status-secondary");
		expect(container).toHaveTextContent("Disabled");
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("shows online hosts in green without a popover", () => {
		const { container } = render(<HostStatusFormatter enabled meta={{ nginxOnline: true }} />);
		expect(statusEl(container)).toHaveClass("status-lime");
		expect(container).toHaveTextContent("Online");
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("treats hosts without status meta (older backend) as online", () => {
		const { container } = render(<HostStatusFormatter enabled meta={{}} />);
		expect(statusEl(container)).toHaveClass("status-lime");
	});

	it("shows an error when nginx did not load the host, with the reason in a popover", async () => {
		const onLogs = vi.fn();
		const { container } = render(
			<HostStatusFormatter
				enabled
				meta={{ nginxOnline: false, nginxErr: 'Advanced configuration: unknown directive "proxy_passs"' }}
				onLogs={onLogs}
			/>,
		);
		expect(statusEl(container)).toHaveClass("status-red");
		expect(container).toHaveTextContent("Error");
		// screen readers hear the state, not just "show details"
		expect(screen.getByRole("button", { name: /^Error\W+Show status details$/ })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button"));
		const popover = await screen.findByTestId("host-status-popover");
		expect(popover).toHaveTextContent('unknown directive "proxy_passs"');

		fireEvent.click(screen.getByText("View error log"));
		expect(onLogs).toHaveBeenCalledTimes(1);
	});

	it("warns about quarantined and unresolved locations", async () => {
		const meta: HostMeta = {
			nginxOnline: true,
			nginxLocations: [
				{ index: 0, path: "/ok", status: "ok", mode: "dynamic", message: null },
				{ index: 1, path: "/api", status: "quarantined", mode: null, message: "nginx said no" },
				{ index: 2, path: "/old", status: "unresolved", mode: "dynamic", message: null },
				{ index: 3, path: "/off", status: "disabled", mode: null, message: null },
			],
		};
		const { container } = render(<HostStatusFormatter enabled meta={meta} />);
		expect(statusEl(container)).toHaveClass("status-yellow");
		expect(container).toHaveTextContent("Warning");
		expect(screen.getByRole("button", { name: /^Warning\W+Show status details$/ })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button"));
		const popover = await screen.findByTestId("host-status-popover");
		expect(popover).toHaveTextContent("/api");
		expect(popover).toHaveTextContent("nginx said no");
		expect(popover).toHaveTextContent("/old");
		expect(popover).toHaveTextContent("can't be resolved");
		expect(popover).not.toHaveTextContent("/ok");
		expect(popover).not.toHaveTextContent("/off");
		// no error log link when not offered
		expect(screen.queryByText("View error log")).toBeNull();
	});

	it("warns about unreachable health targets", async () => {
		const health: UpstreamHostHealth = {
			checkedAt: "2026-11-04T10:00:00Z",
			ok: false,
			targets: [
				{ locationIndex: null, host: "app", port: 80, ok: true, code: "ok", message: "ok" },
				{
					locationIndex: 0,
					path: "/api",
					host: "api",
					port: 8080,
					ok: false,
					code: "tcp_refused",
					message: "Connection refused by api:8080",
				},
			],
		};
		const { container } = render(<HostStatusFormatter enabled meta={{ nginxOnline: true }} health={health} />);
		expect(statusEl(container)).toHaveClass("status-yellow");

		fireEvent.click(screen.getByRole("button"));
		const popover = await screen.findByTestId("host-status-popover");
		expect(popover).toHaveTextContent("/api: api:8080 is not reachable");
		expect(popover).toHaveTextContent("Connection refused");
	});

	it("warns about a main target nginx can't resolve per request", async () => {
		const health: UpstreamHostHealth = {
			checkedAt: "2026-11-04T10:00:00Z",
			ok: false,
			targets: [
				{
					locationIndex: null,
					host: "app",
					port: 80,
					ok: false,
					code: "resolver_mismatch",
					message: "app:80 is reachable, but nginx resolves this upstream per request",
				},
			],
		};
		const { container } = render(<HostStatusFormatter enabled meta={{ nginxOnline: true }} health={health} />);
		expect(statusEl(container)).toHaveClass("status-yellow");

		fireEvent.click(screen.getByRole("button"));
		const popover = await screen.findByTestId("host-status-popover");
		expect(popover).toHaveTextContent("nginx can't resolve app:80");
		expect(popover).not.toHaveTextContent("is not reachable");
	});

	it("doesn't list a failed health probe of a location that is already unresolved", async () => {
		const meta: HostMeta = {
			nginxOnline: true,
			nginxLocations: [
				{ index: 0, path: "/ok", status: "ok", mode: "dynamic", message: null },
				{
					index: 1,
					path: "/ghost",
					status: "unresolved",
					mode: "dynamic",
					message: 'Host "ghost" can\'t be resolved',
				},
			],
		};
		const health: UpstreamHostHealth = {
			checkedAt: "2026-11-04T10:00:00Z",
			ok: false,
			targets: [
				{
					locationIndex: 1,
					path: "/ghost",
					host: "ghost",
					port: 8080,
					ok: false,
					code: "dns_not_found",
					message: "Host not found",
				},
				{
					locationIndex: 0,
					path: "/ok",
					host: "api",
					port: 81,
					ok: false,
					code: "tcp_refused",
					message: "Connection refused",
				},
			],
		};
		render(<HostStatusFormatter enabled meta={meta} health={health} />);
		fireEvent.click(screen.getByRole("button"));
		const popover = await screen.findByTestId("host-status-popover");
		expect(popover).toHaveTextContent("/ghost");
		expect(popover).not.toHaveTextContent("ghost:8080 is not reachable");
		expect(popover).toHaveTextContent("/ok: api:81 is not reachable");
		expect(popover.querySelectorAll("li").length).toBe(2);
	});

	it("an offline host stays red even when there are also warnings", () => {
		const { container } = render(
			<HostStatusFormatter
				enabled
				meta={{
					nginxOnline: false,
					nginxLocations: [{ index: 0, path: "/a", status: "quarantined", mode: null, message: null }],
				}}
			/>,
		);
		expect(statusEl(container)).toHaveClass("status-red");
	});

	it("doesn't call a host offline whose previous config nginx still runs", async () => {
		render(
			<HostStatusFormatter
				enabled
				meta={{
					nginxOnline: false,
					nginxErr: 'host not found in upstream "app"',
					nginxDetails: { kind: "nginx_config", scope: "host", previousConfigRunning: true },
				}}
			/>,
		);
		fireEvent.click(screen.getByRole("button"));
		const popover = await screen.findByTestId("host-status-popover");
		expect(popover).toHaveTextContent("still runs its previous one");
		expect(popover).not.toHaveTextContent("so it is offline");
	});
});
