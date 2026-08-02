export type NginxLogKind = "access" | "error";
export type NginxLogHostType = "proxy-hosts" | "redirection-hosts" | "dead-hosts" | "streams";

export interface NginxLogSnapshot {
	target: { scope: string; id: number | string; logKind: NginxLogKind };
	content: string;
	mode: "tail" | "incremental";
	nextCursor: string;
	file: { exists: boolean; modifiedAt: string | null; sizeBytes: number; generation: string | null };
	linesReturned: number;
	truncated: boolean;
	reset: boolean;
	resetReason?: "rotated" | "truncated";
}

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

export type NginxMatchType = "prefix" | "priority_prefix" | "exact" | "regex" | "regex_i";
export type NginxPathMode = "preserve_uri" | "strip_prefix" | "replace_prefix";
export type NginxDeploymentStatus = "pending" | "online" | "disabled" | "degraded" | "error" | "recovering";

export interface NginxHeaderOperation {
	name: string;
	operation?: "set" | "add" | "remove";
	value?: string;
	valueMode?: "literal" | "variable";
}

export interface NginxCookieRewrite {
	from: string;
	to: string;
}

export interface NginxOptions {
	defaultLocationEnabled?: boolean;
	clientMaxBodySize?: string;
	proxyHttpVersion?: "1.0" | "1.1";
	proxyMethod?: string;
	proxyConnectTimeout?: string;
	proxySendTimeout?: string;
	proxyReadTimeout?: string;
	proxyNextUpstream?: string[];
	proxyNextUpstreamTimeout?: string;
	proxyNextUpstreamTries?: number;
	proxyIgnoreClientAbort?: boolean;
	proxySocketKeepalive?: boolean;
	proxyBind?: string;
	proxyPassRequestHeaders?: boolean;
	proxyPassRequestBody?: boolean;
	proxyPassTrailers?: boolean;
	proxyRequestBuffering?: boolean;
	proxyBuffering?: boolean;
	proxyBufferSize?: string;
	proxyBuffers?: [number, string];
	proxyBusyBuffersSize?: string;
	proxyMaxTempFileSize?: string;
	proxyTempFileWriteSize?: string;
	proxyLimitRate?: string;
	proxyHeadersHashBucketSize?: number;
	proxyHeadersHashMaxSize?: number;
	proxyInterceptErrors?: boolean;
	proxyForceRanges?: boolean;
	proxyRedirect?: "default" | "off";
	proxyCookieDomain?: NginxCookieRewrite[];
	proxyCookiePath?: NginxCookieRewrite[];
	proxySslServerName?: boolean;
	proxySslName?: string;
	proxySslVerify?: boolean;
	proxySslVerifyDepth?: number;
	proxySslSessionReuse?: boolean;
	proxySslProtocols?: string[];
	proxySslCiphers?: string;
	requestHeaders?: NginxHeaderOperation[];
	responseHeaders?: NginxHeaderOperation[];
	hideResponseHeaders?: string[];
	proxyPassHeaders?: string[];
	proxyIgnoreHeaders?: string[];
}

export interface ProxyLocation {
	path: string;
	advancedConfig: string;
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	forwardPath?: string;
	matchType?: NginxMatchType;
	pathMode?: NginxPathMode;
	nginxConfig?: NginxOptions;
}

export interface NginxListener {
	mode: "domain" | "port";
	port?: number;
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
	meta: Record<string, any>;
	allowWebsocketUpgrade: boolean;
	http2Support: boolean;
	enabled: boolean;
	locations?: ProxyLocation[];
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	trustForwardedProto: boolean;
	nginxConfig?: { schemaVersion: 1; server?: NginxOptions; listener?: NginxListener };
	nginxConfigRevision?: number;
	nginxAppliedRevision?: number | null;
	nginxAppliedEnabled?: boolean;
	nginxAppliedHash?: string | null;
	nginxDeploymentStatus?: NginxDeploymentStatus;
	nginxCheckedAt?: string | null;
	nginxLastError?: {
		operationId?: string;
		code?: string;
		message: string;
		diagnostics?: Array<{ severity: string; code: string; message: string }> | null;
	} | null;
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
	meta: Record<string, any>;
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
	meta: Record<string, any>;
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
	meta: Record<string, any>;
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

export interface NginxConfigArtifactResponse {
	hostId: number;
	status: NginxDeploymentStatus;
	desiredRevision: number;
	appliedRevision: number | null;
	deployed: { logicalPath: string; hash: string; config?: string } | null;
	candidate: { logicalPath: string; hash: string; config?: string } | null;
	lastError: Record<string, unknown> | null;
	lastCheckedAt: string | null;
}

export interface ProxyHostPreview {
	valid: boolean;
	config: string;
	payloadHash: string;
	hash: string;
	previewToken?: string | null;
	baseRevision?: number | null;
	validationScope?: "full" | "partial" | "not_applicable";
	unresolvedDependencies?: Array<{ code: string; message: string }>;
	diagnostics: Array<{
		severity: "error" | "warning" | "info";
		code: string;
		message: string;
		line?: number;
		field?: string;
		locationId?: string;
	}>;
}
