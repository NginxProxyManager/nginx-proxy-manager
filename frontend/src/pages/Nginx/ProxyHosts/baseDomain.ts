import { getDomain } from "tldts";

export function getBaseDomain(domain: string | undefined): string {
	if (!domain) return "";
	return getDomain(domain) ?? domain;
}
