import * as api from "./base";
import type { HostTestEndpoint, HostTestResult } from "./models";

/**
 * Checks a host's settings the way a save would, without saving anything.
 * `item` is the same payload as for saving; with an `id` the backend tests
 * the changes to that host.
 */
export async function testHostConfig(
	endpoint: HostTestEndpoint,
	item: Record<string, any>,
	abortController?: AbortController,
): Promise<HostTestResult> {
	// Read-only fields a save leaves out as well
	const { createdOn: _, modifiedOn: __, ...data } = item;
	return await api.post({ url: `/nginx/${endpoint}/test`, data }, abortController);
}
