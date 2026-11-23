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

const HOST_TYPE_KEYS: Record<string, string> = {
	proxy_host: "proxy-host",
	redirection_host: "redirection-host",
	dead_host: "dead-host",
	stream: "stream",
};

export interface NginxErrorText {
	// what went wrong where, in the UI language
	text: string;
	// nginx's error (humanised by the backend), not translated
	detail: string | null;
	hint: string | null;
}

// The name of a value that can't be written into nginx config (unsafe_value's field): the form's own label where
// one fits
const UNSAFE_FIELD_KEYS: Record<string, string> = {
	domain_name: "domain-names",
	forward_host: "proxy-host.forward-host",
	forward_domain: "redirection-host.forward-domain",
	forwarding_host: "stream.forward-host",
	access_list_client_address: "nginx-error.field.access-list-client-address",
	location_path: "nginx-error.field.location-path",
	location_forward_host: "nginx-error.field.location-forward-host",
	location_forward_path: "nginx-error.field.location-forward-path",
};

// Where the error is, from the details' scope, area and file
const nginxErrorWhere = (d: NginxConfigErrorDetails): string => {
	const fmt = (id: string, values?: Record<string, string | number>) => intl.formatMessage({ id }, values);
	if (d.scope === "global") {
		if (d.hostType && typeof d.hostId === "number") {
			const type = HOST_TYPE_KEYS[d.hostType];
			return fmt("nginx-error.other-host", { host: `${type ? fmt(type) : d.hostType} #${d.hostId}` });
		}
		if (d.file) {
			return d.line
				? fmt("nginx-error.file-line", { file: d.file, line: d.line })
				: fmt("nginx-error.file", { file: d.file });
		}
		return fmt("nginx-error.global");
	}
	if (d.area === "location_advanced" && d.locationPath && typeof d.relativeLine === "number") {
		return fmt("nginx-error.location-advanced-line", { path: d.locationPath, line: d.relativeLine });
	}
	if ((d.area === "location" || d.area === "location_advanced") && d.locationPath) {
		return fmt("nginx-error.location", { path: d.locationPath });
	}
	if (d.area === "host_advanced") {
		return typeof d.relativeLine === "number"
			? fmt("nginx-error.advanced-line", { line: d.relativeLine })
			: fmt("nginx-error.advanced");
	}
	return fmt("nginx-error.host");
};

/**
 * An nginx error in the UI language, from the backend's structured details:
 * where it is and what kind it is are translated, nginx's own error is an
 * untranslated detail. null for details that can't be worded (stored by an
 * older version, or of an unknown kind): show the backend's message then.
 */
export const describeNginxError = (details?: NginxConfigErrorDetails | null): NginxErrorText | null => {
	if (!details) return null;
	const d = details;
	const fmt = (id: string, values?: Record<string, string | number>) => intl.formatMessage({ id }, values);
	let text: string;
	let detail = d.detail || null;
	if (d.kind === "unsafe_value") {
		if (typeof d.detail === "undefined") return null;
		text = fmt("nginx-error.unsafe-value");
		// the value as it is, after the name of its field
		const fieldId = d.field ? UNSAFE_FIELD_KEYS[d.field] : undefined;
		if (hasMessage(fieldId) && detail) {
			detail = `${fmt(fieldId)}: ${detail}`;
		}
	} else if (d.kind === "nginx_config" && (typeof d.detail !== "undefined" || d.reason)) {
		switch (d.reason) {
			case "redacted":
				text = fmt("nginx-error.redacted");
				break;
			case "too_many_broken_hosts":
				text = fmt("nginx-error.too-many-broken-hosts", { max: d.max ?? 10 });
				break;
			case "conflict":
				text = fmt("nginx-error.conflict");
				break;
			case "regenerated_conflict":
				text = fmt("nginx-error.regenerated-conflict");
				break;
			case "rejected_at_startup":
				text = fmt("nginx-error.rejected-at-startup");
				break;
			default:
				text = nginxErrorWhere(d);
		}
	} else {
		return null;
	}
	if (d.autoDisabled) {
		text = fmt("nginx-error.auto-disabled", { reason: text });
	}
	if (d.context === "default_site") {
		text = fmt("nginx-error.default-site", { reason: text });
	}
	const hintId = d.hintCode ? `nginx-error.hint.${d.hintCode}` : undefined;
	return {
		text,
		detail,
		hint: hasMessage(hintId) ? fmt(hintId) : d.hint || null,
	};
};

/** describeNginxError() as one line, for toasts: the text, then nginx's error */
export const formatNginxError = (details?: NginxConfigErrorDetails | null): string | null => {
	const described = describeNginxError(details);
	if (!described) return null;
	return described.detail ? `${described.text}: ${described.detail}` : described.text;
};

/**
 * Best displayable text for an error thrown by the API layer (or anything else).
 * Prefers a translation of the backend's i18n key, then an nginx error worded
 * from its details, then a translation of the message itself (some messages
 * are locale keys), then the message verbatim.
 */
export const formatApiError = (err: unknown): string => {
	if (isApiError(err) && hasMessage(err.messageI18n)) {
		return intl.formatMessage({ id: err.messageI18n });
	}
	const nginx = isApiError(err) ? formatNginxError(getNginxErrorDetails(err)) : null;
	if (nginx) {
		return nginx;
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

export interface LocationStatusText {
	text: string;
	// nginx's own error text, shown as it is
	detail: string | null;
}

// Codes that an existing text already says: invalid_path is the editor's own check of the forward path, a
// rejected location is what the quarantined state means
const LOCATION_CHECK_KEYS: Record<string, string> = {
	invalid_path: "location.error.path-invalid",
	rejected: "location-status.quarantined.default",
};

/**
 * What a custom location's state means, in the UI language: from the backend's code and params
 * (location-check.<code>), with nginx's error as an untranslated detail. A code this UI doesn't know shows the
 * backend's English message, a state without one its default text.
 */
export const locationStatusText = (
	l: Pick<NginxLocationStatus, "status" | "code" | "params" | "message">,
): LocationStatusText => {
	const params = l.params || {};
	const id = l.code ? LOCATION_CHECK_KEYS[l.code] || `location-check.${l.code}` : undefined;
	if (hasMessage(id)) {
		return {
			text: intl.formatMessage({ id }, { host: params.host ?? "" }),
			detail: params.detail || null,
		};
	}
	if (l.message) {
		return { text: l.message, detail: null };
	}
	const fallback = `location-status.${l.status}.default`;
	return { text: hasMessage(fallback) ? intl.formatMessage({ id: fallback }) : "", detail: null };
};

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

// The order of the status column, ascending: the hosts that need attention first
const HOST_STATE_RANK: Record<HostState, number> = { error: 0, warning: 1, disabled: 2, online: 3 };

export const hostStatusRank = (enabled: boolean, meta?: HostMeta | null): number =>
	HOST_STATE_RANK[getHostStatus(enabled, meta).state];

interface HostRow {
	original: { enabled: boolean; meta?: HostMeta | null };
}
/** sortFn of a table's status column: sorts by the status it shows, not only enabled / disabled */
export const sortByHostStatus = (a: HostRow, b: HostRow): number =>
	hostStatusRank(a.original.enabled, a.original.meta) - hostStatusRank(b.original.enabled, b.original.meta);

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

// A forward host with an nginx variable, eg. `$backend` set in the advanced
// config, or `app-$stage`. nginx resolves it at request time, so it can't be
// checked. The API refuses these since v2.17, only hosts saved before can
// still have one. The same rule as isVariableHost() in the backend.
const INVALID_HOST_CHARS = /[\s;{}'"`\\#]/;
export const isVariableHost = (host?: string | null) => {
	const value = `${host ?? ""}`.trim();
	return value.includes("$") && !INVALID_HOST_CHARS.test(value);
};

/**
 * The host part of a location's forward host. The backend splits `host/path`
 * at the first `/` (the rest becomes the forward path) and validates only the
 * host part, so `$backend/api` is a variable host with a path.
 */
export const locationHostPart = (host?: string | null) => `${host ?? ""}`.trim().split("/")[0];
