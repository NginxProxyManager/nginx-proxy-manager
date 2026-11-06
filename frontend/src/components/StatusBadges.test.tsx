import { cleanup, render } from "@testing-library/react";
import type { UpstreamCheckResult } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamCheckBadge, UpstreamCheckHint, VariableHostHint } from "./StatusBadges";

vi.mock("src/context", () => ({ useLocaleState: () => ({ locale: "en" }) }));

describe("UpstreamCheckHint", () => {
	afterEach(() => cleanup());

	it("renders the result as a hint line, not a badge", () => {
		const { container } = render(
			<UpstreamCheckHint
				id="h"
				result={{ host: "app", port: 80, ok: true, code: "ok", ms: 3, message: "", addresses: ["10.0.0.2"] }}
			/>,
		);
		const hint = container.querySelector("#h");
		expect(hint).toHaveClass("form-hint");
		expect(hint).toHaveAttribute("data-check", "ok");
		expect(hint).toHaveTextContent("Reachable (3 ms)");
		expect(hint).toHaveTextContent("10.0.0.2");
		expect(container.querySelector(".badge")).toBeNull();
	});

	it("shows <1 ms for a sub-millisecond answer, in the hint and the badge", () => {
		const result: UpstreamCheckResult = {
			host: "app",
			port: 80,
			ok: true,
			code: "ok",
			ms: 0.3,
			message: "app:80 is reachable (<1 ms).",
			addresses: [],
		};
		const { container, rerender } = render(<UpstreamCheckHint id="h" result={result} />);
		expect(container.querySelector("#h")).toHaveTextContent("Reachable (<1 ms) – app:80 is reachable (<1 ms).");
		rerender(<UpstreamCheckBadge id="b" result={result} />);
		expect(container.querySelector(".badge")).toHaveTextContent("Reachable (<1 ms)");
		rerender(<UpstreamCheckBadge id="b" result={{ ...result, ms: 2.6 }} />);
		expect(container.querySelector(".badge")).toHaveTextContent("Reachable (3 ms)");
	});

	it("shows a resolver_mismatch as a warning, also when the result counts it as not ok", () => {
		const result: UpstreamCheckResult = {
			host: "app",
			port: 80,
			ok: true,
			code: "resolver_mismatch",
			ms: 2,
			message: "app:80 is reachable, but",
			addresses: [],
		};
		const { container, rerender } = render(<UpstreamCheckBadge id="b" result={result} />);
		expect(container.querySelector(".badge")).toHaveClass("bg-yellow-lt");
		// the main target of a proxy host: nginx resolves it per request, so the health monitor and the config
		// test report it as not ok
		rerender(<UpstreamCheckBadge id="b" result={{ ...result, ok: false }} />);
		expect(container.querySelector(".badge")).toHaveClass("bg-yellow-lt");
		expect(container.querySelector(".badge")).toHaveTextContent("Resolves only via /etc/hosts or search domains");
		rerender(<UpstreamCheckHint id="h" result={{ ...result, ok: false }} />);
		expect(container.querySelector("#h span.text-warning")).toHaveTextContent("Resolves only via");
		expect(container.querySelector("#h .text-danger")).toBeNull();
	});

	it("shows a checking state and nothing without a result", () => {
		const { container, rerender } = render(<UpstreamCheckHint id="h" result={null} isChecking />);
		expect(container.querySelector("#h")).toHaveAttribute("data-check", "checking");
		rerender(<UpstreamCheckHint id="h" result={null} />);
		expect(container.querySelector("#h")).toBeNull();
	});
});

describe("VariableHostHint", () => {
	afterEach(() => cleanup());

	it("uses the location tip by default and another tip when given", () => {
		const { container, rerender } = render(<VariableHostHint id="v" />);
		expect(container.querySelector("#v")).toHaveTextContent("Set in the advanced configuration");
		rerender(<VariableHostHint id="v" tipId="upstream.check.variable-tip-main" />);
		expect(container.querySelector("#v")).toHaveTextContent("a set in the advanced configuration comes too late");
	});
});
