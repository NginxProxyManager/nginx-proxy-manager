import accessListModel from "../models/access_list.js";
import certificateModel from "../models/certificate.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";

// Shared by object authorization and mutation impact checks. Keep the pure
// operation/scope registry in api-token-policy.js independent of the database.
export const hostModels = {
	proxy_hosts: proxyHostModel,
	redirection_hosts: redirectionHostModel,
	dead_hosts: deadHostModel,
	streams: streamModel,
};

export const resourceModels = {
	...hostModels,
	access_lists: accessListModel,
	certificates: certificateModel,
};
