interface ParsedForwardUrl {
	scheme?: "http" | "https";
	host: string;
	port: number;
	path?: string;
}

/**
 * Parses pasted text like "http://192.168.5.150:8096/path" so the forward
 * scheme/host/port fields can be filled in one go. Returns null when the text
 * isn't worth splitting (plain hostname, unsupported scheme, not a url) so the
 * default paste can happen instead.
 */
export const parseForwardUrl = (text: string): ParsedForwardUrl | null => {
	const trimmed = text.trim();
	if (!trimmed || /\s/.test(trimmed)) {
		return null;
	}
	const hasScheme = trimmed.includes("://");
	let url: URL;
	try {
		url = new URL(hasScheme ? trimmed : `http://${trimmed}`);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return null;
	}
	if (!hasScheme && !url.port) {
		// just a hostname, nothing to split
		return null;
	}
	if (!trimmed.toLowerCase().includes(url.hostname)) {
		// the URL parser rewrote the hostname (eg "5000:8080" becomes ip
		// "0.0.19.136") - don't silently fill in something the user never typed
		return null;
	}
	const scheme = url.protocol === "https:" ? "https" : "http";
	const path = url.pathname + url.search;
	return {
		scheme: hasScheme ? scheme : undefined,
		host: url.hostname,
		port: url.port ? Number.parseInt(url.port, 10) : scheme === "https" ? 443 : 80,
		path: path !== "/" ? path : undefined,
	};
};
