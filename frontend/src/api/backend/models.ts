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
	/** Only returned when listing users */
	authSources?: AuthSource[];
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

export interface ProxyLocation {
	path: string;
	advancedConfig: string;
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
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

/** Where a user is able to sign in from, shown in the Users list */
export interface AuthSource {
	type: "local" | "ldap" | "saml" | "oauth";
	providerId?: number | null;
	/** Provider display name; null for local, or if the provider was removed */
	name?: string | null;
}

export type AuthProviderType = "ldap" | "saml" | "oauth";

/**
 * Provider configuration. The shape depends on the provider type; secrets are
 * never returned by the API, instead a `<field>Set` boolean says whether one is
 * stored.
 */
export interface AuthProviderMeta {
	// Common
	autoCreateUser?: boolean;
	defaultRoles?: string[];
	adminGroup?: string;

	// LDAP
	url?: string;
	bindDn?: string;
	bindPassword?: string;
	bindPasswordSet?: boolean;
	baseDn?: string;
	userFilter?: string;
	emailAttribute?: string;
	nameAttribute?: string;
	nicknameAttribute?: string;
	groupAttribute?: string;
	groupBaseDn?: string;
	groupFilter?: string;
	groupNameAttribute?: string;
	loginAttributes?: string;
	pageSize?: number;
	syncEnabled?: boolean;
	syncInterval?: number;
	syncFilter?: string;
	syncGroup?: string;
	syncDisableMissing?: boolean;
	startTls?: boolean;
	tlsRejectUnauthorized?: boolean;
	timeout?: number;

	// SAML
	entryPoint?: string;
	issuer?: string;
	idpCert?: string;
	spPrivateKey?: string;
	spPrivateKeySet?: boolean;
	signatureAlgorithm?: string;
	wantAssertionsSigned?: boolean;
	wantAuthnResponseSigned?: boolean;

	// OAuth
	issuerUrl?: string;
	authorizationUrl?: string;
	tokenUrl?: string;
	userinfoUrl?: string;
	jwksUrl?: string;
	clientId?: string;
	clientSecret?: string;
	clientSecretSet?: boolean;
	scopes?: string;
	emailClaim?: string;
	nameClaim?: string;
	nicknameClaim?: string;
	groupClaim?: string;
	useBasicAuth?: boolean;

	[key: string]: any;
}

export interface AuthProvider {
	id: number;
	createdOn: string;
	modifiedOn: string;
	isDeleted?: boolean;
	isEnabled: boolean;
	isEnvManaged: boolean;
	slug: string;
	name: string;
	type: AuthProviderType;
	sortOrder: number;
	meta: AuthProviderMeta;
}

export interface NewAuthProvider {
	name: string;
	type: AuthProviderType;
	isEnabled?: boolean;
	sortOrder?: number;
	meta?: AuthProviderMeta;
}

/** A provider as advertised on the (unauthenticated) login screen */
export interface LoginProvider {
	id: number;
	name: string;
	type: "saml" | "oauth";
}

export interface AuthSyncResult {
	providerId: number;
	startedOn?: string;
	finishedOn?: string;
	ok: boolean;
	error?: string;
	entries?: number;
	created?: number;
	updated?: number;
	disabled?: number;
	skipped?: number;
	failed?: number;
}

export interface AuthSyncStatus {
	supported: boolean;
	enabled: boolean;
	running: boolean;
	lastResult?: AuthSyncResult | null;
}

export interface AuthCredentialTest {
	valid: boolean;
	dn?: string;
	email?: string;
	name?: string;
	identifierSource?: string;
	groups?: string[];
}

export interface LoginOptions {
	localEnabled: boolean;
	ldapEnabled: boolean;
	providers: LoginProvider[];
}
