import type { Certificate } from "src/api/backend";

// "exact" beats "wildcard"; null = not covered
const covers = (certDomain: string, domain: string): "exact" | "wildcard" | null => {
	if (certDomain === domain) {
		return "exact";
	}
	if (certDomain.startsWith("*.")) {
		const suffix = certDomain.slice(1); // ".example.com"
		const prefix = domain.slice(0, -suffix.length);
		// nginx semantics: a wildcard covers exactly one extra label
		if (domain.endsWith(suffix) && prefix && !prefix.includes(".")) {
			return "wildcard";
		}
	}
	return null;
};

/**
 * Finds a certificate covering ALL of the given domains (a host serves every
 * domain with the one selected certificate). A cert covering every domain
 * exactly wins; otherwise the first cert covering all of them.
 */
export function matchCertificate(certs: Certificate[], domains: string[]): Certificate | undefined {
	const wanted = domains.map((d) => d.toLowerCase());
	if (!wanted.length) {
		return undefined;
	}
	let partialExact: Certificate | undefined;
	for (const cert of certs) {
		const certDomains = (cert.domainNames || []).map((d) => d.toLowerCase());
		const kinds = wanted.map((domain) => {
			let best: "exact" | "wildcard" | null = null;
			for (const certDomain of certDomains) {
				const kind = covers(certDomain, domain);
				if (kind === "exact") return "exact";
				if (kind === "wildcard") best = "wildcard";
			}
			return best;
		});
		if (kinds.includes(null)) {
			continue; // must cover every domain
		}
		if (!kinds.includes("wildcard")) {
			return cert; // all-exact match wins outright
		}
		partialExact ||= cert;
	}
	return partialExact;
}
