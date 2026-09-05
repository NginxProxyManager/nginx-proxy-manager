import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteUpstream: vi.fn(),
	invalidateQueries: vi.fn(),
	publishUpstream: vi.fn(),
	showDelete: vi.fn(),
	showError: vi.fn(),
	showModal: vi.fn(),
	showSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("src/api/backend", () => ({
	deleteUpstream: (...args: unknown[]) => mocks.deleteUpstream(...args),
	publishUpstream: (...args: unknown[]) => mocks.publishUpstream(...args),
}));
vi.mock("src/components", () => ({
	Button: ({ children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => <button {...props}>{children}</button>,
	HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
	LoadingPage: () => <div>loading</div>,
}));
vi.mock("src/hooks", () => ({
	useUpstreams: () => ({
		data: [
			{ id: 1, name: "api", nginxKey: "api_cluster", loadBalancingMethod: "round_robin", servers: [{ host: "127.0.0.1" }], nginxDeploymentStatus: "online", isDisabled: false },
			{ id: 2, name: "pending", nginxKey: "pending_cluster", loadBalancingMethod: "least_conn", servers: [], nginxDeploymentStatus: "error", isDisabled: false },
			{ id: 3, name: "disabled", nginxKey: "disabled_cluster", loadBalancingMethod: "ip_hash", servers: [], isDisabled: true },
		],
		isLoading: false,
		isError: false,
		error: null,
		isFetching: false,
	}),
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ defaultMessage, id }: { defaultMessage?: string; id: string }) => defaultMessage || id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("src/modals", () => ({ showDeleteConfirmModal: (...args: unknown[]) => mocks.showDelete(...args) }));
vi.mock("src/modals/UpstreamModal", () => ({ showUpstreamModal: (...args: unknown[]) => mocks.showModal(...args) }));
vi.mock("src/notifications", () => ({
	showError: (...args: unknown[]) => mocks.showError(...args),
	showObjectSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}));

import UpstreamsTable from "./TableWrapper";

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.publishUpstream.mockResolvedValue({});
	mocks.deleteUpstream.mockResolvedValue({});
});

describe("UpstreamsTable", () => {
	it("renders all deployment states and performs list actions", async () => {
		render(<UpstreamsTable />);
		expect(screen.getByText("api_cluster")).toBeInTheDocument();
		expect(screen.getAllByText("nginx-deployment.status.pending")).toHaveLength(3);

		fireEvent.click(screen.getByText("upstreams.add"));
		fireEvent.click(screen.getByText("api"));
		expect(mocks.showModal).toHaveBeenCalledWith("new");
		expect(mocks.showModal).toHaveBeenCalledWith(1);

		fireEvent.click(screen.getByText("upstreams.republish"));
		await waitFor(() => expect(mocks.publishUpstream).toHaveBeenCalledWith(2));
		expect(mocks.showSuccess).toHaveBeenCalledWith("upstream", "saved");
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["upstreams"] });

		fireEvent.click(screen.getAllByText("object.delete")[0]);
		expect(mocks.showDelete).toHaveBeenCalledOnce();
		const options = mocks.showDelete.mock.calls[0][0];
		await options.onConfirm();
		expect(mocks.deleteUpstream).toHaveBeenCalledWith(1);
		expect(mocks.showSuccess).toHaveBeenCalledWith("upstream", "deleted");
	});
});
