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
	upstreams: string;
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

interface NginxHeaderOperationBase {
	name: string;
	value?: string;
	valueMode?: "literal" | "variable";
}

export interface NginxRequestHeaderOperation extends NginxHeaderOperationBase {
	operation?: "set" | "remove";
}

export interface NginxResponseHeaderOperation extends NginxHeaderOperationBase {
	operation?: "set" | "add" | "remove";
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
	requestHeaders?: NginxRequestHeaderOperation[];
	responseHeaders?: NginxResponseHeaderOperation[];
	hideResponseHeaders?: string[];
	proxyPassHeaders?: string[];
	proxyIgnoreHeaders?: string[];
}

export interface NginxOptionHeaders {
	request?: NginxRequestHeaderOperation[];
	response?: NginxResponseHeaderOperation[];
	hideResponse?: string[];
	passResponse?: string[];
	ignoreUpstream?: string[];
}

export interface NginxOptionSections {
	directives?: NginxOptions;
	headers?: NginxOptionHeaders;
}

export interface NginxLocationConfigV2 {
	mode: "inherit";
	overrides: NginxOptionSections;
}

export type ProxyTarget =
	| { type: "direct"; scheme: "http" | "https"; host: string; port: number }
	| { type: "upstream"; scheme: "http" | "https"; upstreamId: number };

export interface UpstreamServer {
	id?: number;
	host: string;
	port: number;
	weight?: number;
	maxFails?: number;
	failTimeout?: string;
	maxConns?: number | null;
	backup?: boolean;
	down?: boolean;
	sortOrder?: number;
}

export interface Upstream {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	name: string;
	nginxKey: string;
	isDisabled: boolean;
	loadBalancingMethod: "round_robin" | "least_conn" | "ip_hash" | "random";
	zoneSize: string;
	servers: UpstreamServer[];
	nginxConfigRevision: number;
	nginxAppliedRevision?: number | null;
	nginxAppliedEnabled?: boolean;
	nginxDeploymentStatus?: NginxDeploymentStatus;
}

export interface ProxyLocation {
	path: string;
	target?: ProxyTarget;
	locationId?: string;
	advancedConfig: string;
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	forwardPath?: string;
	matchType?: NginxMatchType;
	pathMode?: NginxPathMode;
	nginxConfig?: NginxLocationConfigV2 | NginxOptions;
	/** UI-only keys retained to preserve explicit overrides that equal inherited values. */
	nginxOverrideKeys?: string[];
}

export interface NginxListener {
	mode: "domain" | "port";
	port?: number;
}

export interface ProxyHostNginxConfig {
	schemaVersion: 2;
	profileVersion: "npm-explicit-proxy-v1";
	server: NginxOptionSections;
	listener: NginxListener;
}

export type ProxyHostMonitoringListStatus = Pick<
	ProxyHostMonitoringState,
	"status" | "statusReason" | "lastCheckedOn" | "statusChangedOn"
>;

export interface ProxyHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	defaultTarget?: ProxyTarget;
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
	monitoringStatus?: ProxyHostMonitoringListStatus;
	locations?: ProxyLocation[];
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	trustForwardedProto: boolean;
	nginxConfig?: ProxyHostNginxConfig;
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
	desired?: {
		schemaVersion: 1 | 2;
		revision?: number | null;
		nginxConfig: ProxyHostNginxConfig | Record<string, unknown>;
	};
	appliedSnapshot?: Record<string, unknown> | null;
	migration?: {
		status: "pending" | "migrated" | "review_required" | "resolved" | "failed" | "native_v2" | "unknown";
		migratedOn?: string | null;
		diagnostics: Array<Record<string, unknown>>;
	};
	lastError: Record<string, unknown> | null;
	lastCheckedAt: string | null;
}

export interface NginxEffectiveSourceRecord {
	field: string;
	frontendField: string;
	value: unknown;
	source: "user" | "profile" | "inherited";
	scope: "default_policy" | "location";
	locationId?: string | number | null;
	path: string;
	inheritedFrom?: string;
}

export interface NginxEffectiveFeature {
	field: string;
	frontendField: string | null;
	enabled: boolean;
	source: "user" | "system";
	expandedDirectives: string[];
	value?: unknown;
}

export interface NginxEffectiveConfig {
	schemaVersion: 2;
	profileVersion: string;
	server: {
		effective: NginxOptionSections;
		effectiveFlat: NginxOptions;
		sources: Record<string, NginxEffectiveSourceRecord>;
	};
	locations: Array<{
		locationId: string | number | null;
		path: string;
		matchType: NginxMatchType;
		mode: "inherit";
		overrides: NginxOptionSections;
		effective: NginxOptionSections;
		effectiveFlat: NginxOptions;
		sources: Record<string, NginxEffectiveSourceRecord>;
	}>;
	features: Record<string, NginxEffectiveFeature>;
}

export interface NginxRuntimeCapability {
	schemaVersion: 1;
	profileVersion: string;
	runtimeFamily: string;
	nginxVersion: string;
	architectures: string[];
	ipv6: boolean;
	modules: string[];
	image: string;
	imageDigest: string;
	notes: string;
	validatedOn: string;
	profileHash: string;
}

export interface ProxyHostPreview {
	valid: boolean;
	config: string;
	payloadHash: string;
	hash: string;
	dependencyHash: string;
	capabilityHash: string;
	templateVersion: string;
	templateHash: string;
	previewToken: string | null;
	baseRevision: number | null;
	validationScope: "full" | "partial" | "not_applicable";
	unresolvedDependencies: Array<{ code: string; message: string }>;
	effectiveConfig: NginxEffectiveConfig;
	sourceMap: Array<{
		lineStart: number;
		lineEnd: number;
		directive: string | null;
		field: string;
		frontendField: string | null;
		source: "user" | "profile" | "inherited" | "derived" | "system" | "unmanaged";
		scope: "server" | "location";
		locationId: string | number | null;
		path: string | null;
	}>;
	capability: NginxRuntimeCapability;
	diagnostics: Array<{
		severity: "error" | "warning" | "info";
		code: string;
		message: string;
		line?: number;
		field?: string;
		locationId?: string;
	}>;
}
export interface ProxyHostMonitoringConfig {
	id?: number;
	proxyHostId?: number;
	enabled: boolean;
	passiveDesiredEnabled: boolean;
	passiveAppliedEnabled: boolean;
	passiveCheckedOn?: string | null;
	passiveLastError?: { code?: string; message?: string } | null;
	activeEnabled: boolean;
	probeMode: "tcp" | "tls" | "http" | "end_to_end" | "both";
	intervalSeconds: number;
	timeoutMs: number;
	httpMethod: "GET" | "HEAD";
	path: string;
	expectedStatuses: string[];
	followRedirects: boolean;
	tlsVerify: boolean;
	bodyMatchType?: "contains" | "regex" | null;
	bodyMatchValue?: string | null;
	failureThreshold: number;
	successThreshold: number;
	degraded5xxRatio: number;
	degradedGatewayErrorCount: number;
	degradedMinRequests: number;
	degradedP95Ms?: number | null;
}

export interface ProxyHostMonitoringState {
	proxyHostId: number;
	status: "disabled" | "unknown" | "online" | "degraded" | "offline" | "config_error";
	statusReason?: string | null;
	statusChangedOn?: string | null;
	lastCheckedOn?: string | null;
	lastSuccessOn?: string | null;
	lastFailureOn?: string | null;
	consecutiveSuccesses: number;
	consecutiveFailures: number;
	lastProbeDurationMs?: number | null;
	lastHttpStatus?: number | null;
	lastFailureCode?: string | null;
	lastFailureSummary?: string | null;
	workerSeenOn?: string | null;
}

export interface ProxyHostMonitoringSummary {
	requests: number;
	syntheticRequests: number;
	clientErrors: number;
	serverErrors: number;
	gatewayErrors: number;
	bytesSent: number;
	bodyBytesSent: number;
	errorRatio: number;
	p95RequestTimeMs?: number | null;
	lastStatus?: number | null;
	lastEventAt?: string | null;
}

export interface ProxyHostMonitoringSnapshot {
	config: ProxyHostMonitoringConfig;
	state: ProxyHostMonitoringState | null;
	summary: ProxyHostMonitoringSummary;
	worker: { enabled: boolean; passiveEnabled: boolean; activeEnabled: boolean; logPath: string };
}

export interface ProxyHostMonitoringTimePoint extends ProxyHostMonitoringSummary {
	bucketStart: string;
}
