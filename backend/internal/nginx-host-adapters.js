import { join } from "node:path";
import errs from "../lib/error.js";

const definitions = {
	upstream: { directory: "upstream", template: "upstream.conf", expand: ["owner", "servers"] },
	proxy_host: {
		directory: "proxy_host",
		template: "proxy_host.conf",
		expand: ["certificate", "owner", "access_list.[clients,items]"],
	},
	redirection_host: { directory: "redirection_host", template: "redirection_host.conf", expand: ["certificate", "owner", "access_list"] },
	dead_host: { directory: "dead_host", template: "dead_host.conf", expand: ["certificate", "owner", "access_list"] },
	stream: { directory: "stream", template: "stream.conf", expand: ["certificate", "owner"] },
	default: { directory: "default_host", template: "default.conf", expand: ["certificate"] },
};

export const getHostAdapter = (hostType) => {
	const adapter = definitions[hostType];
	if (!adapter) throw new errs.AssertionFailedError(`Unsupported nginx host type: ${hostType}`);
	return { hostType, ...adapter };
};

export const getActivePath = (hostType, hostId, root = "/data/nginx") => {
	const adapter = getHostAdapter(hostType);
	if (hostType === "default") return join(root, adapter.directory, "site.conf");
	if (!Number.isInteger(Number(hostId)) || Number(hostId) < 1) throw new errs.AssertionFailedError("A numeric host id is required");
	return join(root, adapter.directory, `${Number(hostId)}.conf`);
};

export const buildSnapshot = (hostType, host, renderResult) => ({
	schema_version: 1,
	host_type: hostType,
	host_id: host.id ?? null,
	desired: structuredClone(host),
	payload_hash: renderResult.payloadHash,
	dependency_hash: renderResult.dependencyHash,
	template_version: renderResult.templateVersion,
	template_hash: renderResult.templateHash,
	capability_hash: renderResult.capabilityHash,
	config_hash: renderResult.configHash,
});

export const hostAdapters = Object.freeze(definitions);
export default { hostAdapters, getHostAdapter, getActivePath, buildSnapshot };
