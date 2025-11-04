import type { UserPermissions } from "src/api/backend";

export const ADMIN = "admin";
export const VISIBILITY = "visibility";
export const PROXY_HOSTS = "proxyHosts";
export const REDIRECTION_HOSTS = "redirectionHosts";
export const DEAD_HOSTS = "deadHosts";
export const STREAMS = "streams";
export const CERTIFICATES = "certificates";
export const ACCESS_LISTS = "accessLists";

export const MANAGE = "manage";
export const VIEW = "view";
export const HIDDEN = "hidden";

export const ALL = "all";
export const USER = "user";

export type Section =
	| typeof ADMIN
	| typeof VISIBILITY
	| typeof PROXY_HOSTS
	| typeof REDIRECTION_HOSTS
	| typeof DEAD_HOSTS
	| typeof STREAMS
	| typeof CERTIFICATES
	| typeof ACCESS_LISTS;

export type Permission = typeof MANAGE | typeof VIEW;

const hasPermission = (
	section: Section,
	perm: Permission,
	userPerms: UserPermissions | undefined,
	roles: string[] | undefined,
): boolean => {
	if (!userPerms) return false;
	if (isAdmin(roles)) return true;
	const acceptable = [MANAGE, perm];
	// @ts-expect-error 7053
	const v = typeof userPerms[section] !== "undefined" ? userPerms[section] : HIDDEN;
	return acceptable.indexOf(v) !== -1;
};

const isAdmin = (roles: string[] | undefined): boolean => {
	return roles?.includes("admin") || false;
};

export { hasPermission, isAdmin };
