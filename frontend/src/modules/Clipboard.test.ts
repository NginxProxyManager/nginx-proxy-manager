import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./Clipboard";

describe("copyText", () => {
	afterEach(() => vi.restoreAllMocks());

	it("falls back to execCommand when the page is not a secure context (http)", async () => {
		Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
		const exec = vi.fn(() => true);
		(document as any).execCommand = exec;
		expect(await copyText("NPM_DOCKER_DISCOVERY=true")).toBe(true);
		expect(exec).toHaveBeenCalledWith("copy");
		expect(document.querySelector("textarea")).toBeNull();
	});
});
