import {
	type HostMeta,
	isApiError,
	type NginxConfigErrorDetails,
	type NginxLocationStatus,
} from "src/api/backend";
import { intl } from "src/locale";

// Meta keys the backend owns. It strips them from anything we send, but there
// is no reason to send stale copies back in the first place.
export const SERVER_META_KEYS = [
	"nginxOnline",
	"nginxErr",
	"nginxLocations",
	"nginxCheckedAt",
	"nginxDetails",
] as const;

export const stripServerMeta = (meta?: HostMeta | Record<string, any> | null): Record<string, any> => {
	const result: Record<string, any> = { ...(meta || {}) };
	for (const key of SERVER_META_KEYS) {
		delete result[key];
	}
	return result;
};

const hasMessage = (id?: string): id is string =>
	!!id && typeof (intl.messages as Record<string, unknown> | undefined)?.[id] !== "undefined";

/**
 * Best displayable text for an error thrown by the API layer (or anything else).
 * Prefers a translation of the backend's i18n key, then a translation of the
 * message itself (some messages are locale keys), then the message verbatim.
 */
export const formatApiError = (err: unknown): string => {
	if (isApiError(err) && hasMessage(err.messageI18n)) {
		return intl.formatMessage({ id: err.messageI18n });
	}
	const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
	if (hasMessage(message)) {
		return intl.formatMessage({ id: message });
	}
	return message || intl.formatMessage({ id: "error.unknown" });
};

export const getNginxErrorDetails = (err: unknown): NginxConfigErrorDetails | null => {
	if (isApiError(err) && err.details && err.details.kind === "nginx_config") {
		return err.details as NginxConfigErrorDetails;
	}
	return null;
};

/** Index of the custom location an nginx error points at, if any */
export const getErrorLocationIndex = (details?: NginxConfigErrorDetails | null): number | null => {
	if (!details) return null;
	if (typeof details.locationIndex === "number") return details.locationIndex;
	return null;
};

export const PROBLEM_LOCATION_STATUSES = ["quarantined", "unresolved"];

export const getProblemLocations = (meta?: HostMeta | null): NginxLocationStatus[] =>
	(meta?.nginxLocations || []).filter((l) => PROBLEM_LOCATION_STATUSES.includes(l.status));

export type HostState = "disabled" | "online" | "warning" | "error";

export interface HostStatusInfo {
	state: HostState;
	nginxErr: string | null;
	problemLocations: NginxLocationStatus[];
}

export const getHostStatus = (enabled: boolean, meta?: HostMeta | null): HostStatusInfo => {
	if (!enabled) {
		return { state: "disabled", nginxErr: null, problemLocations: [] };
	}
	const problemLocations = getProblemLocations(meta);
	if (meta?.nginxOnline === false) {
		return { state: "error", nginxErr: meta.nginxErr || null, problemLocations };
	}
	return { state: problemLocations.length ? "warning" : "online", nginxErr: null, problemLocations };
};

/** Whether a successful save still needs the user's attention */
export const hasSaveWarnings = (meta?: HostMeta | null) =>
	meta?.nginxOnline === false || getProblemLocations(meta).length > 0;

/**
 * Normalised form of a location path for duplicate detection: the modifier
 * (`=`, `~`, `~*`, `^~`) and the URI are separated by exactly one space,
 * surrounding whitespace is ignored. `= /x` and `=/x` are the same location.
 */
export const normaliseLocationPath = (path: string): string => {
	const m = `${path ?? ""}`.trim().match(/^(=|~\*|~|\^~)?\s*(.*)$/s);
	if (!m) return `${path ?? ""}`.trim();
	return m[1] ? `${m[1]} ${m[2]}` : m[2];
};

/**
 * Key under which nginx sees two locations as the same (`duplicate location`):
 * exact locations with the same URI, or prefix locations with the same URI
 * (`/x` and `^~ /x` are the same). Regex (`~`, `~*`) and named (`@x`) locations
 * may repeat, nginx uses the first one, so they get no key. Mirrors the
 * backend's findDuplicatePath.
 */
export const locationDuplicateKey = (path: string): string | null => {
	const m = `${path ?? ""}`.trim().match(/^(=|\^~|~\*|~)?\s*(.*)$/s);
	const modifier = m?.[1] || "";
	const uri = (m?.[2] ?? "").trim();
	if (!uri || modifier === "~" || modifier === "~*" || (!modifier && uri.startsWith("@"))) {
		return null;
	}
	// nginx strips the quotes of a quoted path
	const q = uri.match(/^(["'])(.*)\1$/s);
	const unquoted = q ? q[2].replace(/\\(["'\\])/g, "$1") : uri;
	return `${modifier === "=" ? "=" : "prefix"} ${unquoted}`;
};

// A forward host that is a single nginx variable, eg. `$backend` set in the
// advanced config. nginx resolves it at request time, so it can't be checked.
const VARIABLE_HOST = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
export const isVariableHost = (host?: string | null) => VARIABLE_HOST.test(`${host ?? ""}`.trim());

/**
 * The host part of a location's forward host. The backend splits `host/path`
 * at the first `/` (the rest becomes the forward path) and validates only the
 * host part, so `$backend/api` is a variable host with a path.
 */
export const locationHostPart = (host?: string | null) => `${host ?? ""}`.trim().split("/")[0];
