import { cleanup, render } from "@testing-library/react";
import { Formik } from "formik";
import type { ReactNode } from "react";
import type { HostTestResult } from "src/api/backend";
import { ApiError } from "src/api/backend";
import { formValuesKey } from "src/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHostTestState, HostConfigTestResult } from "./HostConfigTest";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));

const base: HostTestResult = {
	ok: true,
	nginxOnline: true,
	nginxErr: null,
	nginxDetails: null,
	nginxLocations: [],
	upstreams: [],
	warnings: [],
};

const values = { forwardHost: "app" };
const inForm = (node: ReactNode, initial: any = values) => (
	<Formik initialValues={initial} onSubmit={() => {}}>
		{() => node}
	</Formik>
);

describe("getHostTestState", () => {
	it("tells ok, rejected, quarantined and error apart", () => {
		expect(getHostTestState(null, null)).toBeNull();
		expect(getHostTestState(base, null)).toBe("ok");
		expect(getHostTestState({ ...base, ok: false, nginxOnline: false }, null)).toBe("rejected");
		expect(getHostTestState({ ...base, ok: false }, null)).toBe("quarantined");
		expect(getHostTestState(null, new Error("x"))).toBe("error");
	});

	it("reports warnings when nginx accepts it but something won't work yet", () => {
		const unresolved = {
			...base,
			nginxLocations: [{ index: 0, path: "/api", status: "unresolved", mode: "dynamic", message: "x" }],
		} as HostTestResult;
		expect(getHostTestState(unresolved, null)).toBe("warnings");
		const unreachable = { ...base, upstreams: [{ ok: false, code: "tcp_refused" }] } as unknown as HostTestResult;
		expect(getHostTestState(unreachable, null)).toBe("warnings");
		const variable = { ...base, upstreams: [{ ok: false, code: "disabled" }] } as unknown as HostTestResult;
		expect(getHostTestState(variable, null)).toBe("ok");
		const other = { ...base, warnings: [{ code: "other_host_broken", message: "x" }] } as unknown as HostTestResult;
		expect(getHostTestState(other, null)).toBe("warnings");
	});
});

describe("HostConfigTestResult", () => {
	afterEach(() => cleanup());

	it("renders nothing without a test", () => {
		const { container } = render(
			inForm(<HostConfigTestResult result={null} error={null} testedKey={null} onClose={() => {}} />),
		);
		expect(container.querySelector("[data-testid=host-test-result]")).toBeNull();
	});

	it("shows an accepted result with problem locations and targets as warnings", () => {
		const result: HostTestResult = {
			...base,
			nginxLocations: [
				{ index: 0, path: "/api", status: "ok", mode: "dynamic", message: null },
				{ index: 1, path: "/later", status: "unresolved", mode: "dynamic", message: "Host later not found" },
			],
			upstreams: [
				{
					host: "app",
					port: 80,
					ok: true,
					code: "ok",
					message: "",
					ms: 2,
					locationIndex: null,
					path: null,
				},
				{
					host: "api",
					port: 81,
					ok: false,
					code: "tcp_refused",
					message: "",
					locationIndex: 0,
					path: "/api",
				},
			],
		};
		const { getByTestId } = render(
			inForm(
				<HostConfigTestResult
					result={result}
					error={null}
					testedKey={formValuesKey(values)}
					onClose={() => {}}
				/>,
			),
		);
		const alert = getByTestId("host-test-result");
		expect(alert).toHaveAttribute("data-state", "warnings");
		expect(alert).toHaveClass("alert-warning");
		expect(alert).toHaveTextContent("Configuration OK, with warnings");
		expect(getByTestId("host-test-locations")).toHaveTextContent("/api");
		expect(getByTestId("host-test-locations")).toHaveTextContent("Host later not found");
		expect(getByTestId("host-test-upstreams")).toHaveTextContent("Reachable (2 ms)");
		expect(getByTestId("host-test-upstreams")).toHaveTextContent("Connection refused");
		expect(alert).toHaveTextContent("nothing was saved");
	});

	it("shows targets that were not checked because of the rate limit without a failure badge", () => {
		const result: HostTestResult = {
			...base,
			upstreams: [
				{
					host: "app",
					port: 80,
					ok: false,
					code: "rate_limited",
					message: "Reachability was not checked: too many upstream checks in the last minute.",
					locationIndex: null,
					path: null,
				},
			],
			warnings: [
				{
					code: "upstreams_rate_limited",
					message:
						"Reachability was not checked: too many upstream checks in the last minute. Try again in 12 seconds.",
				},
			],
		};
		const { getByTestId } = render(
			inForm(<HostConfigTestResult result={result} error={null} testedKey={null} onClose={() => {}} />),
		);
		const upstreams = getByTestId("host-test-upstreams");
		expect(upstreams).toHaveTextContent("Not checked: too many checks in the last minute");
		expect(upstreams.querySelector(".badge")).toBeNull();
		expect(getByTestId("host-test-result")).toHaveTextContent("Try again in 12 seconds.");
	});

	it("shows a rejected host with the nginx error", () => {
		const result: HostTestResult = {
			...base,
			ok: false,
			nginxOnline: false,
			nginxErr: 'Advanced configuration: unknown directive "proxy_passs" (line 1).',
			nginxDetails: { kind: "nginx_config", scope: "host", hint: "Check the spelling.", nginxOutput: "raw" },
		};
		const { getByTestId } = render(
			inForm(<HostConfigTestResult result={result} error={null} testedKey={null} onClose={() => {}} />),
		);
		const alert = getByTestId("host-test-result");
		expect(alert).toHaveAttribute("data-state", "rejected");
		expect(alert).toHaveClass("alert-danger");
		expect(getByTestId("nginx-error")).toHaveTextContent("unknown directive");
		expect(getByTestId("nginx-error")).toHaveTextContent("Check the spelling.");
	});

	it("counts quarantined locations", () => {
		const result: HostTestResult = {
			...base,
			ok: false,
			nginxLocations: [{ index: 0, path: "/x", status: "quarantined", mode: null, message: "bad" }],
		};
		const { getByTestId } = render(
			inForm(<HostConfigTestResult result={result} error={null} testedKey={null} onClose={() => {}} />),
		);
		expect(getByTestId("host-test-result")).toHaveTextContent("Nginx would disable 1 custom location");
	});

	it("shows a failed request like a save error", () => {
		const error = new ApiError("test.example.com is already in use", { status: 400 });
		const { getByTestId } = render(
			inForm(<HostConfigTestResult result={null} error={error} testedKey={null} onClose={() => {}} />),
		);
		const alert = getByTestId("host-test-result");
		expect(alert).toHaveAttribute("data-state", "error");
		expect(alert).toHaveTextContent("test.example.com is already in use");
	});

	it("says when the form changed after the test", () => {
		const { getByTestId } = render(
			inForm(
				<HostConfigTestResult
					result={base}
					error={null}
					testedKey={formValuesKey({ forwardHost: "old" })}
					onClose={() => {}}
				/>,
			),
		);
		expect(getByTestId("host-test-result")).toHaveTextContent("The form was changed after this test");
	});
});
