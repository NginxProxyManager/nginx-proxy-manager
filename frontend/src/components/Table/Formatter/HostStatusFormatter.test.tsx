import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
