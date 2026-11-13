import type {
	HostTestWarning,
	UpstreamCandidate,
	UpstreamCheckResult,
	UpstreamProviderStatus,
} from "src/api/backend";
import { intl } from "src/locale";

/**
 * Texts of the upstream discovery, check and test results, in the UI language. The backend sends codes and
 * values (no English sentences are shown), every text is worded here.
 */

const hasMessage = (id: string): boolean =>
	typeof (intl.messages as Record<string, unknown> | undefined)?.[id] !== "undefined";

const listSeparators = new Map<string, string>();

/**
 * The separator the UI language puts between the items of a list ("a, b" / "a、b"): the one between the first two
 * items of a three-item conjunction list, so it is never "and" and never missing (the "unit" list style has no
 * separator at all in some languages, eg. zh).
 */
const listSeparator = (): string => {
	const locale = intl.locale || "en";
	let sep = listSeparators.get(locale);
	if (sep === undefined) {
		sep = ", ";
		try {
			const s = intl.formatList(["\u0001", "\u0002", "\u0003"], { type: "conjunction" }) as string;
			const between = s.slice(s.indexOf("\u0001") + 1, s.indexOf("\u0002"));
			if (between.trim() && !/[\p{L}\p{N}]/u.test(between)) {
				sep = between;
			}
		} catch (_) {
			// keep ", "
		}
		listSeparators.set(locale, sep);
	}
	return sep;
};

/** A list of names or numbers (ports, domains, addresses), every item separated the same way (no "and") */
export const formatValueList = (values: ReadonlyArray<string | number>): string =>
	values.map((v) => `${v}`).join(listSeparator());

/** Whole milliseconds in the UI language's digits, "<1" below one (a container on the same host) */
export const formatCheckMs = (ms: number): string => (ms < 1 ? "<1" : intl.formatNumber(Math.round(ms)));

/** Docker container state badge: "running" as the common "Online", the other states by name */
export const containerStateText = (state: string): string =>
	state === "running"
		? intl.formatMessage({ id: "online" })
		: intl.formatMessage({ id: "upstream.container-state" }, { state });

/** Second line of a picker option: what the name is, when the group heading doesn't already say it */
export const candidateKindText = (c: Pick<UpstreamCandidate, "kind" | "owner">): string | null =>
	c.kind === "compose_service" && c.owner
		? intl.formatMessage({ id: "upstream.compose-service" }, { container: c.owner })
		: null;

export interface ProviderErrorText {
	text: string;
	// raw error text (eg. from the system), shown as is
	detail: string | null;
}

/** Why Docker discovery doesn't work, from the provider's code and params */
export const dockerErrorText = (status: Pick<UpstreamProviderStatus, "code" | "params">): ProviderErrorText => {
	const params = status.params || {};
	const code = status.code && hasMessage(`upstream.docker-error.${status.code}`) ? status.code : "failed";
	const detail = typeof params.detail === "string" && params.detail ? params.detail : null;
	return { text: intl.formatMessage({ id: `upstream.docker-error.${code}` }, params), detail };
};

/**
 * What a check result means and what to do, in addition to its short text (upstream.check.<code>). Null when
 * the short text says it all. A resolver_mismatch that is not ok is a target nginx resolves per request: the
 * request fails there.
 */
export const checkDetailText = (result: Pick<UpstreamCheckResult, "code" | "ok" | "host" | "port">): string | null => {
	// the port as typed, not as a number in the UI language ("8.080")
	const values = { host: result.host, port: `${result.port ?? ""}` };
	switch (result.code) {
		case "invalid_host":
			return intl.formatMessage(
				{
					id: result.host ? "upstream.check.detail.invalid_host" : "upstream.check.detail.invalid_host_empty",
				},
				values,
			);
		case "resolver_mismatch":
			return intl.formatMessage(
				{
					id: result.ok
						? "upstream.check.detail.resolver_mismatch"
						: "upstream.check.detail.resolver_required",
				},
				values,
			);
		case "no_resolver":
		case "dns_not_found":
		case "dns_timeout":
		case "tcp_refused":
		case "tcp_timeout":
		case "tcp_unreachable":
			return intl.formatMessage({ id: `upstream.check.detail.${result.code}` }, values);
		default:
			return null;
	}
};

const HOST_TYPE_NOUN: Record<string, string> = {
	proxy_host: "proxy-host",
	redirection_host: "redirection-host",
	dead_host: "dead-host",
	stream: "stream",
};

/** A warning of a config test in the UI language; detail is the raw nginx text, if any */
export const hostTestWarningText = (w: HostTestWarning): ProviderErrorText => {
	switch (w.code) {
		case "certificate_pending":
			return { text: intl.formatMessage({ id: "host-test.warning.certificate-pending" }), detail: null };
		case "upstreams_rate_limited":
			return typeof w.retryAfter === "number"
				? {
						text: intl.formatMessage({ id: "host-test.warning.rate-limited" }, { seconds: w.retryAfter }),
						detail: null,
					}
				: { text: w.message, detail: null };
		case "other_host_broken": {
			const noun = w.hostType ? HOST_TYPE_NOUN[w.hostType] : undefined;
			if (!noun || typeof w.hostId !== "number") {
				return { text: intl.formatMessage({ id: "host-test.warning.other-host-hidden" }), detail: null };
			}
			const host = `${intl.formatMessage({ id: noun })} #${w.hostId}`;
			return {
				text: intl.formatMessage({ id: "host-test.warning.other-host" }, { host }),
				detail: w.detail || null,
			};
		}
		default:
			return { text: w.message, detail: null };
	}
};
