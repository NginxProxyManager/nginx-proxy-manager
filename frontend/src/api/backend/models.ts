export interface AppVersion {
	major: number;
	minor: number;
	revision: number;
}

export interface UserPermissions {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	userId?: number;
	visibility: string;
	proxyHosts: string;
	redirectionHosts: string;
	deadHosts: string;
	streams: string;
	accessLists: string;
	certificates: string;
	meta?: {
		proxyHostIds?: number[];
		proxy_host_ids?: number[];
		[key: string]: any;
	};
}

export interface User {
	id: number;
	createdOn: string;
	modifiedOn: string;
	isDisabled: boolean;
	email: string;
	name: string;
	nickname: string;
	avatar: string;
	roles: string[];
	permissions?: UserPermissions;
}

export interface AuditLog {
	id: number;
	createdOn: string;
	modifiedOn: string;
	userId: number;
	objectType: string;
	objectId: number;
	action: string;
	meta: Record<string, any>;
	// Expansions:
	user?: User;
}

export type LogSourceType = "system" | "letsencrypt" | "host";
export type LogHostType = "proxy" | "redirection" | "dead" | "stream";
// Which of the two files nginx writes per host - named "channel", not "stream",
// to avoid confusion with the "stream" LogHostType (TCP/UDP stream hosts).
export type LogChannel = "access" | "error";

export interface LogHostOption {
	id: number;
	label: string;
}

export interface LogSources {
	system: { label: string };
	letsencrypt: { label: string };
	hosts: Record<LogHostType, LogHostOption[]>;
}

export interface LogTail {
	lines: string[];
	size: number;
	truncated: boolean;
	exists: boolean;
}

export interface AccessList {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	ownerUserId: number;
	name: string;
	meta: Record<string, any>;
	satisfyAny: boolean;
	passAuth: boolean;
	proxyHostCount?: number;
	// Expansions:
	owner?: User;
	items?: AccessListItem[];
	clients?: AccessListClient[];
}

export interface AccessListItem {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	username: string;
	password: string;
	meta?: Record<string, any>;
	hint?: string;
}

export type AccessListClient = {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	address: string;
	directive: "allow" | "deny";
	meta?: Record<string, any>;
};

export interface Certificate {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	provider: string;
	niceName: string;
	domainNames: string[];
	expiresOn: string;
	meta: Record<string, any>;
	owner?: User;
	proxyHosts?: ProxyHost[];
	deadHosts?: DeadHost[];
	redirectionHosts?: RedirectionHost[];
}

export interface ProxyLocation {
	id?: number | null;
	path: string;
	advancedConfig: string;
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	forwardPath?: string;
	accessListId?: number;
	accessList?: AccessList;
	// Missing means enabled
	enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Server-owned host meta (written by the backend after every nginx configure,
// stripped by the backend from anything the client sends back).
// ---------------------------------------------------------------------------

export type NginxConfigErrorScope = "location" | "host" | "other_host" | "global";

export interface NginxConfigErrorDetails {
	// unsafe_value: a stored value that can't be written into nginx config safely (host meta only)
	kind: "nginx_config" | "unsafe_value";
	scope: NginxConfigErrorScope;
	hostType?: string | null;
	hostId?: number | null;
	file?: string | null;
	line?: number | null;
	locationIndex?: number | null;
	locationPath?: string | null;
	nginxOutput?: string | null;
	hint?: string | null;
	// What the UI words the error from (the message is English). Missing in details stored by older versions.
	// the part of the host's config the error is in (host_advanced, location, location_advanced), and the line
	// within it
	area?: string | null;
	relativeLine?: number | null;
	// special cases: conflict, regenerated_conflict, too_many_broken_hosts, redacted, rejected_at_startup
	reason?: string;
	// too_many_broken_hosts: how many hosts one operation repairs at most
	max?: number;
	// the humanised nginx error (unsafe_value: the rejected value, quoted), shown as it is
	detail?: string | null;
	// unsafe_value: which value, eg. forward_host
	field?: string | null;
	// names the hint: nginx-error.hint.<hintCode>
	hintCode?: string | null;
	// host meta: the host was taken offline while another host was saved
	autoDisabled?: boolean;
	// default_site: the error came from saving the default site
	context?: string;
	// host meta: nginx did not apply the removal of the host's config and still runs its previous config
	previousConfigRunning?: boolean;
}

export type LocationStatusValue = "ok" | "disabled" | "quarantined" | "unresolved";

export interface NginxLocationStatus {
	index: number;
	path: string;
	status: LocationStatusValue;
	mode: "dynamic" | "static" | null;
	// why the location is not ok, worded by the UI (location-check.<code>); null when it is ok or disabled
	code?: string | null;
	// host (unresolved), detail (rejected, omitted: nginx's error text, not translated)
	params?: { host?: string; detail?: string } | null;
	// the same in English
	message: string | null;
}

export interface HostMeta {
	// false only when the host's config is not active in nginx
	nginxOnline?: boolean;
	nginxErr?: string | null;
	nginxDetails?: NginxConfigErrorDetails | null;
	nginxCheckedAt?: string;
	// proxy hosts only, one entry per location, same order
	nginxLocations?: NginxLocationStatus[];
	// Other, client-owned meta (letsencrypt, dns challenge, ...)
	[key: string]: any;
}

export interface ProxyHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	accessListId: number;
	certificateId: number;
	sslForced: boolean;
	cachingEnabled: boolean;
	blockExploits: boolean;
	advancedConfig: string;
	meta: HostMeta;
	allowWebsocketUpgrade: boolean;
	http2Support: boolean;
	enabled: boolean;
	locations?: ProxyLocation[];
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	trustForwardedProto: boolean;
	// Expansions:
	owner?: User;
	accessList?: AccessList;
	certificate?: Certificate;
}

export interface DeadHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	certificateId: number;
	sslForced: boolean;
	advancedConfig: string;
	meta: HostMeta;
	http2Support: boolean;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
}

export interface RedirectionHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardDomainName: string;
	preservePath: boolean;
	certificateId: number;
	sslForced: boolean;
	blockExploits: boolean;
	advancedConfig: string;
	meta: HostMeta;
	http2Support: boolean;
	forwardScheme: string;
	forwardHttpCode: number;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
}

export interface Stream {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	incomingPort: number;
	forwardingHost: string;
	forwardingPort: number;
	tcpForwarding: boolean;
	udpForwarding: boolean;
	meta: HostMeta;
	enabled: boolean;
	certificateId: number;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
}

export interface Setting {
	id: string;
	name?: string;
	description?: string;
	value: string;
	meta?: Record<string, any>;
}

export interface DNSProvider {
	id: string;
	name: string;
	credentials: string;
}

// ---------------------------------------------------------------------------
// Upstream discovery / reachability check / health (/api/upstreams/*)
// ---------------------------------------------------------------------------

export type UpstreamSource = "docker" | "dns" | "history";

export interface UpstreamProviderStatus {
	status: "ok" | "disabled" | "unavailable";
	message: string | null;
}

export interface UpstreamCandidate {
	host: string;
	label: string;
	source: UpstreamSource;
	ports: number[];
	hintPort: number | null;
	hintScheme: "http" | "https" | null;
	network: string | null;
	state: string | null;
	ip: string | null;
	usedBy: number;
}

export interface UpstreamCandidates {
	providers: Record<UpstreamSource, UpstreamProviderStatus>;
	items: UpstreamCandidate[];
	generatedAt: string;
}

export type UpstreamCheckCode =
	| "ok"
	| "invalid_host"
	| "dns_not_found"
	| "dns_timeout"
	| "resolver_mismatch"
	| "tcp_refused"
	| "tcp_timeout"
	| "tcp_unreachable"
	| "disabled";

export interface UpstreamCheckTarget {
	host: string;
	port: number;
	scheme?: string;
}

export interface UpstreamCheckResult {
	host: string;
	port: number;
	scheme?: string;
	ok: boolean;
	code: UpstreamCheckCode;
	message: string;
	addresses?: string[];
	resolverOk?: boolean | null;
	systemOk?: boolean | null;
	ms?: number | null;
}

export interface UpstreamCheckResponse {
	results: UpstreamCheckResult[];
}

export interface UpstreamHealthTarget {
	// null for the host's main destination
	locationIndex: number | null;
	path?: string;
	host: string;
	port: number;
	ok: boolean;
	code: UpstreamCheckCode;
	message: string;
	ms?: number | null;
}

export interface UpstreamHostHealth {
	checkedAt: string;
	ok: boolean;
	targets: UpstreamHealthTarget[];
}

export interface UpstreamHealth {
	enabled: boolean;
	interval: number;
	checkedAt: string | null;
	hosts: {
		// Keyed by host id (as a string). `proxy_host` arrives camelized.
		proxyHost?: Record<string, UpstreamHostHealth>;
		stream?: Record<string, UpstreamHostHealth>;
	};
}
