import type { ProxyHost } from "src/api/backend";

type ForwardingValues = Pick<ProxyHost, "forwardingMode" | "forwardHost" | "forwardPort" | "upstreamServers">;
type ForwardTarget = Pick<ProxyHost, "forwardHost" | "forwardPort">;

export const getForwardTarget = (values: ForwardingValues, saved?: Partial<ForwardTarget>) => {
	if (values.forwardingMode !== "upstream") {
		return { forwardHost: values.forwardHost, forwardPort: values.forwardPort };
	}
	const firstServer = values.upstreamServers?.[0];
	const firstHost = firstServer?.host;
	const fallbackHost = firstHost?.includes(":") && !firstHost.startsWith("[") ? `[${firstHost}]` : firstHost;
	// Inactive inputs must not invalidate an otherwise valid upstream submission.
	// Keep valid edits, then saved values, before falling back for a new host.
	return {
		forwardHost: [values.forwardHost, saved?.forwardHost, fallbackHost].find(
			(host) => typeof host === "string" && host.length > 0 && host.length <= 255,
		),
		forwardPort: [values.forwardPort, saved?.forwardPort, firstServer?.port].find(
			(port) => typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535,
		),
	};
};
