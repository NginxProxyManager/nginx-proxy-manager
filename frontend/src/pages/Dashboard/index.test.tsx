import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("src/components", () => ({ HasPermission: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("src/hooks", () => ({
	useHostReport: () => ({ data: { proxy: 1, redirection: 2, stream: 3, upstream: 4, dead: 5 } }),
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <span>{id}</span> }));

import Dashboard from "./index";

describe("dashboard", () => {
	it("shows every host family and navigates from its cards", () => {
		render(<Dashboard />);
		const targets = [
			["proxy-hosts.count", "/nginx/proxy"],
			["redirection-hosts.count", "/nginx/redirection"],
			["streams.count", "/nginx/stream"],
			["upstreams.count", "/nginx/upstreams"],
			["dead-hosts.count", "/nginx/404"],
		] as const;
		for (const [label, path] of targets) {
			fireEvent.click(screen.getByText(label).closest("a") as HTMLElement);
			expect(navigate).toHaveBeenLastCalledWith(path);
		}
	});
});
