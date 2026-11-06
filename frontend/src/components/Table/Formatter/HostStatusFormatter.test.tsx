import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HostMeta } from "src/api/backend";
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
});
