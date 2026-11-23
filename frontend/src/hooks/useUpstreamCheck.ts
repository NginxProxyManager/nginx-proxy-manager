import { useEffect, useRef, useState } from "react";
import { checkUpstreams, isApiError, type UpstreamCheckResult } from "src/api/backend";
import { isVariableHost } from "src/modules/HostStatus";

const DEBOUNCE_MS = 600;
const CACHE_TTL_MS = 30 * 1000;

interface CacheEntry {
	at: number;
	result: UpstreamCheckResult;
}

// Shared between all fields, so re-opening a location card or a modal doesn't
// re-check the same target straight away.
const cache = new Map<string, CacheEntry>();

// Set once the backend told us the check isn't available to this user (403)
// or doesn't exist (404); there's no point asking again until a reload.
let unavailable = false;

const resetUpstreamCheckCache = () => {
	cache.clear();
	unavailable = false;
};

export interface UpstreamCheckInput {
	host?: string;
	port?: number | string;
	scheme?: string;
}

const normaliseTarget = ({ host, port, scheme }: UpstreamCheckInput) => {
	const h = `${host ?? ""}`.trim();
	const p = Number(port);
	// An nginx variable is only known at request time
	if (!h || isVariableHost(h) || !Number.isInteger(p) || p < 1 || p > 65535) {
		return null;
	}
	return { host: h, port: p, scheme: scheme || undefined };
};

/**
 * Debounced live reachability check of a single host:port.
 *
 * At most one request per field is in flight: a newer value aborts the older
 * request, and results are cached for a short while. Any failure of the check
 * endpoint itself (permissions, rate limit, older backend) results in `null`,
 * which callers render as "no information".
 */
const useUpstreamCheck = (input: UpstreamCheckInput, enabled = true) => {
	const target = enabled ? normaliseTarget(input) : null;
	const key = target ? `${target.scheme ?? ""}://${target.host}:${target.port}` : "";
	const [state, setState] = useState<{ key: string; result: UpstreamCheckResult | null; checking: boolean }>({
		key: "",
		result: null,
		checking: false,
	});
	const targetRef = useRef(target);
	targetRef.current = target;

	useEffect(() => {
		if (!key || unavailable) {
			setState({ key, result: null, checking: false });
			return;
		}
		const cached = cache.get(key);
		if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
			setState({ key, result: cached.result, checking: false });
			return;
		}

		setState({ key, result: null, checking: true });
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			const t = targetRef.current;
			if (!t) return;
			try {
				const res = await checkUpstreams([t], controller);
				const result = res?.results?.[0] ?? null;
				if (result) {
					cache.set(key, { at: Date.now(), result });
				}
				if (!controller.signal.aborted) {
					setState({ key, result, checking: false });
				}
			} catch (err) {
				if (controller.signal.aborted) return;
				if (isApiError(err) && (err.status === 403 || err.status === 404)) {
					unavailable = true;
				}
				setState({ key, result: null, checking: false });
			}
		}, DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [key]);

	// Never hand out a result that belongs to a previous value of the field
	const current = state.key === key ? state : { result: null, checking: false };
	return { result: current.result, isChecking: current.checking };
};

export { resetUpstreamCheckCache, useUpstreamCheck };
