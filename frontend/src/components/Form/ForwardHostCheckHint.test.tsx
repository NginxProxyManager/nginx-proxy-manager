import { cleanup, render } from "@testing-library/react";
import { Formik } from "formik";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForwardHostCheckHint } from "./ForwardHostCheckHint";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));

const check = vi.hoisted(() => ({
	calls: [] as unknown[],
	answer: { result: null as unknown, isChecking: false },
}));
vi.mock("src/hooks", () => ({
	useUpstreamCheck: (input: unknown) => {
		check.calls.push(input);
		return check.answer;
	},
}));

const renderHint = (forwardHost: string) =>
	render(
		<Formik initialValues={{ forwardHost, forwardPort: 80, forwardScheme: "http" }} onSubmit={() => {}}>
			<ForwardHostCheckHint />
		</Formik>,
	);

describe("ForwardHostCheckHint", () => {
	afterEach(() => {
		cleanup();
		check.calls = [];
		check.answer = { result: null, isChecking: false };
	});

	it("shows the neutral variable hint for a main forward host that is an nginx variable", () => {
		for (const host of ["$backend", " $up_2 "]) {
			const { container, unmount } = renderHint(host);
			const hint = container.querySelector("#forwardHost-check");
			expect(hint).toHaveAttribute("data-check", "variable");
			expect(hint).toHaveTextContent("nginx variable");
			// the main host is read by `set $server`, before the advanced config runs
			expect(hint).toHaveTextContent(/map in \/data\/nginx\/custom\/http\.conf/);
			unmount();
		}
	});

	it("shows the live check for anything else; the main host is not split at '/'", () => {
		check.answer = {
			result: { host: "app", port: 80, ok: true, code: "ok", ms: 3, message: "", addresses: [] },
			isChecking: false,
		};
		for (const host of ["app", "$backend/api"]) {
			const { container, unmount } = renderHint(host);
			expect(container.querySelector("#forwardHost-check")).toHaveAttribute("data-check", "ok");
			unmount();
		}
		expect(check.calls).toContainEqual({ host: "app", port: 80, scheme: "http" });
	});
});
