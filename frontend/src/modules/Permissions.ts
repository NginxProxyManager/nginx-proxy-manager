export const FULL_ADMIN = "full-admin";
export const ADMIN = FULL_ADMIN;
export const HOSTS = "hosts";
export const PROXY_HOSTS = HOSTS;
export const REDIRECTION_HOSTS = HOSTS;
export const DEAD_HOSTS = HOSTS;
export const STREAMS = "streams";
export const CERTIFICATES = "certificates";
export const ACCESS_LISTS = "access-lists";
export const CERTIFICATE_AUTHORITIES = "certificate-authorities";
export const DNS_PROVIDERS = "dns-providers";
export const NGINX_TEMPLATES = "nginx-templates";
export const AUDIT_LOG = "audit-log.view";
export const SETTINGS = "settings.manage";
export const USERS = "users.manage";

export const MANAGE = "manage";
export const VIEW = "view";

export type Permission = typeof MANAGE | typeof VIEW;
export type Section =
	| typeof FULL_ADMIN
	| typeof HOSTS
	| typeof STREAMS
	| typeof CERTIFICATES
	| typeof ACCESS_LISTS
	| typeof CERTIFICATE_AUTHORITIES
	| typeof DNS_PROVIDERS
	| typeof NGINX_TEMPLATES
	| typeof AUDIT_LOG
	| typeof SETTINGS
	| typeof USERS;

export interface CapabilityGroup {
	id: string;
	label: string;
	view?: string;
	manage?: string;
}

export const capabilityGroups: readonly CapabilityGroup[] = [
	{ id: "hosts", label: "hosts", view: "hosts.view", manage: "hosts.manage" },
	{ id: "streams", label: "streams", view: "streams.view", manage: "streams.manage" },
	{ id: "access-lists", label: "access-lists", view: "access-lists.view", manage: "access-lists.manage" },
	{ id: "certificates", label: "certificates", view: "certificates.view", manage: "certificates.manage" },
	{ id: "certificate-authorities", label: "permissions.certificate-authorities", view: "certificate-authorities.view", manage: "certificate-authorities.manage" },
	{ id: "dns-providers", label: "permissions.dns-providers", view: "dns-providers.view", manage: "dns-providers.manage" },
	{ id: "nginx-templates", label: "permissions.nginx-templates", view: "nginx-templates.view", manage: "nginx-templates.manage" },
	{ id: "audit-log", label: "auditlogs", view: AUDIT_LOG },
	{ id: "settings", label: "settings", manage: SETTINGS },
	{ id: "users", label: "users", manage: USERS },
] as const;

export const hasCapability = (capabilities: readonly string[] | undefined, required: string): boolean => {
	if (!capabilities) return false;
	return capabilities.includes(FULL_ADMIN) || capabilities.includes(required);
};

export const capabilityFor = (section: Section, permission: Permission): string => {
	if (section === FULL_ADMIN || section.includes(".")) return section;
	return `${section}.${permission}`;
};

export const hasPermission = (
	section: Section,
	permission: Permission,
	capabilities: readonly string[] | undefined,
): boolean => hasCapability(capabilities, capabilityFor(section, permission));

export const isAdmin = (capabilities: readonly string[] | undefined): boolean =>
	hasCapability(capabilities, FULL_ADMIN);
