import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "./base";
import { regenerateNginxConfigs } from "./regenerateNginxConfigs";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("regenerateNginxConfigs", () => {
	it("sends the host type filter as given, an empty one too", async () => {
		const post = vi.spyOn(api, "post").mockResolvedValue({});
		await regenerateNginxConfigs();
		await regenerateNginxConfigs([]);
		await regenerateNginxConfigs(["stream"]);
		expect(post.mock.calls.map(([args]) => (args as { data: unknown }).data)).toEqual([
			{},
			{ hostTypes: [] },
			{ hostTypes: ["stream"] },
		]);
	});
});
