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

export type DocSection = {
	id: string;
	labelId: string;
	path: string;
};

/** Mirrors VitePress sidebar in docs/.vitepress/config.mts */
export const DOC_SECTIONS: DocSection[] = [
	{ id: "guide", labelId: "documentation.section.guide", path: "/guide/" },
	{ id: "setup", labelId: "documentation.section.setup", path: "/setup/" },
	{ id: "advanced-config", labelId: "documentation.section.advanced-config", path: "/advanced-config/" },
	{ id: "automation-api", labelId: "documentation.section.automation-api", path: "/advanced/automation-api" },
	{ id: "api-reference", labelId: "documentation.section.api-reference", path: "/api-reference/" },
	{ id: "api-swagger", labelId: "documentation.section.api-swagger", path: "/api-reference/swagger" },
	{ id: "faq", labelId: "documentation.section.faq", path: "/faq/" },
	{ id: "certbot", labelId: "documentation.section.certbot", path: "/certbot/" },
	{ id: "upgrading", labelId: "documentation.section.upgrading", path: "/upgrading/" },
];

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

export const documentationPageUrl = (docPath: string) => {
	const path = docPath.startsWith("/") ? docPath : `/${docPath}`;
	return `/documentation?path=${encodeURIComponent(path)}`;
};
