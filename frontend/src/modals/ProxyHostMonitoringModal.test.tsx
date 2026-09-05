import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	probeMutate: vi.fn(),
	refetchSnapshot: vi.fn(),
	refetchTimeseries: vi.fn(),
	saveMutate: vi.fn(),
	snapshotResult: {} as any,
	timeseriesResult: {} as any,
}));

vi.mock("ez-modal-react", () => ({
	default: {
		create: (component: unknown) => component,
		show: vi.fn(),
	},
}));

vi.mock("src/locale", () => ({
	intl: {
		formatMessage: (descriptor: { defaultMessage?: string; id: string }) => descriptor.defaultMessage || descriptor.id,
	},
}));

vi.mock("src/api/backend", () => ({
	getProxyHostMonitoring: vi.fn(),
	getProxyHostMonitoringTimeseries: vi.fn(),
	probeProxyHost: vi.fn(),
	updateProxyHostMonitoring: vi.fn(),
}));

vi.mock("recharts", () => {
	const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	return {
		Area: Wrapper,
		CartesianGrid: Wrapper,
		ComposedChart: Wrapper,
		Legend: Wrapper,
		Line: Wrapper,
		LineChart: Wrapper,
		ResponsiveContainer: Wrapper,
		Tooltip: Wrapper,
		XAxis: Wrapper,
		YAxis: Wrapper,
	};
});

const config = {
	enabled: true,
	passiveDesiredEnabled: true,
	passiveAppliedEnabled: false,
	activeEnabled: true,
	probeMode: "http",
	intervalSeconds: 60,
	timeoutMs: 5000,
};

const monitoring = {
	config,
	state: {
		status: "online",
		statusReason: "Healthy",
		lastCheckedOn: "2026-09-05 09:30:00",
		lastHttpStatus: 200,
		lastProbeDurationMs: 1234,
		consecutiveSuccesses: 4,
		consecutiveFailures: 0,
		lastSuccessOn: "2026-09-05T09:30:00Z",
		lastFailureOn: null,
		workerSeenOn: "1757064600",
	},
	summary: {
		requests: 1250,
		syntheticRequests: 3,
		clientErrors: 5,
		serverErrors: 2,
		gatewayErrors: 1,
		errorRatio: 0.0016,
		bytesSent: 2048,
		bodyBytesSent: 1024,
		p95RequestTimeMs: 87,
		lastEventAt: "2026-09-05T09:29:00Z",
	},
};

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
	useQuery: (options: { queryKey: unknown[] }) => String(options.queryKey[0]).includes("timeseries") ? mocks.timeseriesResult : mocks.snapshotResult,
	useMutation: (options: { mutationFn: () => unknown; onSuccess?: () => void }) => {
		const isProbe = String(options.mutationFn).includes("probeProxyHost");
		return {
			error: null,
			isPending: false,
			mutate: isProbe
				? (...args: unknown[]) => mocks.probeMutate(...args)
				: (payload: unknown) => {
						mocks.saveMutate(payload);
						options.onSuccess?.();
					},
		};
	},
}));

import {
	createRange,
	formatBytes,
	formatDateTime,
	formatDuration,
	parseDateTime,
	ProxyHostMonitoringModal,
	refreshIntervalLabel,
	statusKey,
	toDateTimeLocal,
} from "./ProxyHostMonitoringModal";

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.snapshotResult = { data: monitoring, error: null, isFetching: false, isLoading: false, refetch: mocks.refetchSnapshot };
	mocks.timeseriesResult = { data: [{ bucketStart: "2026-09-05T09:00:00Z", requests: 10, clientErrors: 1, serverErrors: 0, bytesSent: 2048, p95RequestTimeMs: 25 }], error: null, isFetching: false, isLoading: false, refetch: mocks.refetchTimeseries };
});
const modalInternals = { id: "monitor-modal", hide: vi.fn(), resolve: vi.fn(), reject: vi.fn() };

describe("ProxyHostMonitoringModal helpers", () => {
	it("formats ranges, timestamps, durations, bytes, refresh labels and statuses", () => {
		const range = createRange("15m");
		expect(new Date(range.to).getTime() - new Date(range.from).getTime()).toBe(900_000);
		expect(toDateTimeLocal("2026-09-05T10:20:00Z")).toMatch(/^2026-09-05T/);
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(1536)).toBe("1.5 KiB");
		expect(formatDuration(null)).toBe("—");
		expect(formatDuration(-4)).toBe("0ms");
		expect(formatDuration(1250)).toBe("1s250ms");
		expect(formatDuration(2000)).toBe("2s");
		expect(parseDateTime("1757064600")).toBeInstanceOf(Date);
		expect(parseDateTime("not-a-date")).toBeNull();
		expect(formatDateTime()).toBe("—");
		expect(refreshIntervalLabel(null)).toBe("Off");
		expect(refreshIntervalLabel(5000)).toBe("5s");
		expect(statusKey("offline")).toBe("offline");
		expect(statusKey("unexpected")).toBe("unknown");
	});
});

describe("ProxyHostMonitoringModal", () => {
	it("renders metrics and handles dashboard controls", async () => {
		render(<ProxyHostMonitoringModal {...modalInternals} hostId={7} label="example.test" visible remove={vi.fn()} />);

		expect(screen.getByText("Healthy")).toBeInTheDocument();
		expect(screen.getByText("1,250")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /Check now/ }));
		expect(mocks.probeMutate).toHaveBeenCalledOnce();

		fireEvent.click(screen.getByRole("button", { name: "24 hours" }));
		fireEvent.click(screen.getByRole("button", { name: /Custom range/ }));
		expect(screen.getByLabelText("Start time")).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "2026-09-06T12:00" } });
		fireEvent.change(screen.getByLabelText("End time"), { target: { value: "2026-09-05T12:00" } });
		expect(screen.getByText("The start time must be before the end time.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

		fireEvent.change(screen.getByLabelText("End time"), { target: { value: "2026-09-07T12:00" } });
		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
		await waitFor(() => expect(mocks.refetchSnapshot).toHaveBeenCalledOnce());
		expect(mocks.refetchTimeseries).toHaveBeenCalledOnce();
	});

	it("edits and saves all monitoring settings", async () => {
		render(<ProxyHostMonitoringModal {...modalInternals} hostId={7} label="example.test" visible remove={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "Monitoring settings" }));

		fireEvent.click(document.getElementById("monitor-enabled")!);
		fireEvent.click(document.getElementById("monitor-passive")!);
		fireEvent.click(document.getElementById("monitor-active")!);
		fireEvent.change(screen.getByLabelText("Probe mode"), { target: { value: "both" } });
		fireEvent.change(screen.getByLabelText("Interval (seconds)"), { target: { value: "120" } });
		fireEvent.change(screen.getByLabelText("Timeout (ms)"), { target: { value: "8000" } });
		fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

		expect(mocks.saveMutate).toHaveBeenCalledWith({
			enabled: false,
			passiveDesiredEnabled: false,
			activeEnabled: false,
			probeMode: "both",
			intervalSeconds: 120,
			timeoutMs: 8000,
		});
		await waitFor(() => expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2));
	});

	it("renders loading, query failures, empty charts, and auto-refresh choices", async () => {
		mocks.snapshotResult = { data: { config, state: {}, summary: {} }, error: new Error("snapshot failed"), isFetching: true, isLoading: true, refetch: mocks.refetchSnapshot };
		mocks.timeseriesResult = { data: [], error: new Error("series failed"), isFetching: true, isLoading: false, refetch: mocks.refetchTimeseries };
		render(<ProxyHostMonitoringModal {...modalInternals} hostId={7} label="empty.test" visible remove={vi.fn()} />);
		expect(screen.getByText("snapshot failed")).toBeInTheDocument();
		expect(screen.getByText("series failed")).toBeInTheDocument();
		expect(document.querySelectorAll(".monitoring-chart-empty")).toHaveLength(2);
		fireEvent.click(screen.getByRole("button", { name: /Auto refresh:/ }));
		fireEvent.click(await screen.findByRole("button", { name: "Off" }));
		fireEvent.click(screen.getByRole("button", { name: /Auto refresh:/ }));
		fireEvent.click(await screen.findByRole("button", { name: "5s" }));
		expect(screen.getByRole("button", { name: /Auto refresh: 5s/ })).toBeInTheDocument();
	});
});
