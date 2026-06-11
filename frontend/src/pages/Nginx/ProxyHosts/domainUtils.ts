/**
 * Returns the "base" domain for a domain name using a dependency-free
 * last-two-labels rule (e.g. "api.example.com" -> "example.com").
 *
 * - Strips a leading wildcard ("*.example.com" -> "example.com").
 * - Falls back to the cleaned input when there are fewer than two labels
 *   (e.g. a single label like "localhost").
 *
 * Note: multi-part suffixes such as ".co.uk" group one level too shallow
 * ("www.example.co.uk" -> "co.uk"). This is a deliberate trade-off to avoid
 * pulling in the full public suffix list as a dependency.
 */
export function getBaseDomain(domain: string): string {
	if (!domain) {
		return "";
	}

	let cleaned = domain.trim().toLowerCase();
	if (cleaned.startsWith("*.")) {
		cleaned = cleaned.slice(2);
	}
	// Drop a trailing dot (fully-qualified domain names).
	cleaned = cleaned.replace(/\.$/, "");

	const labels = cleaned.split(".").filter(Boolean);
	if (labels.length <= 2) {
		return labels.join(".");
	}
	return labels.slice(-2).join(".");
}

export interface BaseDomainCount {
	base: string;
	count: number;
}

/**
 * Given a list of per-host domain-name arrays, returns the unique base
 * domains across all hosts with how many hosts contain each one, sorted
 * alphabetically. A host that holds several domains sharing the same base
 * (e.g. api.x.com + app.x.com) counts once for that base.
 */
export function getBaseDomainCounts(hostDomainNames: string[][]): BaseDomainCount[] {
	const counts = new Map<string, number>();

	for (const domainNames of hostDomainNames) {
		const basesForHost = new Set<string>();
		for (const domain of domainNames ?? []) {
			const base = getBaseDomain(domain);
			if (base) {
				basesForHost.add(base);
			}
		}
		for (const base of basesForHost) {
			counts.set(base, (counts.get(base) ?? 0) + 1);
		}
	}

	return Array.from(counts.entries())
		.map(([base, count]) => ({ base, count }))
		.sort((a, b) => a.base.localeCompare(b.base));
}
