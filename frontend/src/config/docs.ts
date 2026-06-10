export const DOCS_BASE = "/docs";

const SAFE_DOC_PATH = /^\/[a-z0-9][a-z0-9\-/]*$/i;

/** Normalize and validate a VitePress path segment (must stay under /docs). */
export const normalizeDocPath = (raw: string | null | undefined, fallback = "/guide/"): string => {
	if (!raw?.trim()) {
		return fallback;
	}
	const path = raw.startsWith("/") ? raw : `/${raw}`;
	if (path.includes("..") || path.includes("//") || path.includes(":") || !SAFE_DOC_PATH.test(path)) {
		return fallback;
	}
	return path;
};

export const docUrl = (path: string) => {
	const normalized = normalizeDocPath(path);
	return `${DOCS_BASE}${normalized}`;
};

/** Build a same-origin docs URL from an already-normalized path segment. */
export const docUrlFromNormalizedPath = (normalizedPath: string) => `${DOCS_BASE}${normalizedPath}`;

/** HelpModal section name → VitePress path (under /docs) */
export const HELP_SECTION_DOC_PATHS: Record<string, string> = {
	ProxyHosts: "/guide/",
	RedirectionHosts: "/guide/",
	Streams: "/guide/",
	DeadHosts: "/guide/",
	Certificates: "/certbot/",
	AccessLists: "/guide/",
	Credentials: "/advanced/automation-api",
	Settings: "/advanced/automation-api",
};

/** Link to in-app docs for a HelpModal section (allowlisted section name). */
export const documentationPageUrl = (section: string) =>
	`/documentation?section=${encodeURIComponent(section)}`;

/** @deprecated Prefer `documentationPageUrl(section)`; path query is normalized then allowlisted. */
export const documentationPageUrlFromPath = (docPath: string) => {
	const path = normalizeDocPath(docPath);
	const section = Object.entries(HELP_SECTION_DOC_PATHS).find(([, p]) => p === path)?.[0];
	return section ? documentationPageUrl(section) : `/documentation?path=${encodeURIComponent(path)}`;
};

