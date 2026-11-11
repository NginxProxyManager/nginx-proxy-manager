import {
	type HostMeta,
	isApiError,
	type NginxConfigErrorDetails,
} from "src/api/backend";
import { intl } from "src/locale";

// Meta keys the backend owns. It strips them from anything we send, but there
// is no reason to send stale copies back in the first place.
export const SERVER_META_KEYS = ["nginxOnline", "nginxErr", "nginxCheckedAt", "nginxDetails"] as const;

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

export type HostState = "disabled" | "online" | "error";

export interface HostStatusInfo {
	state: HostState;
	nginxErr: string | null;
}

export const getHostStatus = (enabled: boolean, meta?: HostMeta | null): HostStatusInfo => {
	if (!enabled) {
		return { state: "disabled", nginxErr: null };
	}
	if (meta?.nginxOnline === false) {
		return { state: "error", nginxErr: meta.nginxErr || null };
	}
	return { state: "online", nginxErr: null };
};

/** Whether a successful save still needs the user's attention */
export const hasSaveWarnings = (meta?: HostMeta | null) => meta?.nginxOnline === false;
