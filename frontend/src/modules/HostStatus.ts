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
