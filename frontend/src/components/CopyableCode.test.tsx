import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyableCode } from "./CopyableCode";

const copyText = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
vi.mock("src/modules/Clipboard", () => ({ copyText }));

describe("CopyableCode", () => {
	afterEach(() => cleanup());

	it("copies the plain text of the block, also when markdown wraps it in <code>", async () => {
		render(
			<CopyableCode testId="block">
				<code className="language-yaml">
					{"NPM_DOCKER_DISCOVERY=true\nDOCKER_HOST=tcp://socket-proxy:2375\n"}
				</code>
			</CopyableCode>,
		);
		expect(screen.getByTestId("block")).toHaveTextContent("NPM_DOCKER_DISCOVERY=true");
		fireEvent.click(screen.getByRole("button"));
		expect(copyText).toHaveBeenCalledWith("NPM_DOCKER_DISCOVERY=true\nDOCKER_HOST=tcp://socket-proxy:2375");
		await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copied"));
	});
});
