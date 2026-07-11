/**
 * Finds the zone whose name is the longest suffix of the domain.
 * A match requires either an exact equality or a ".zone" boundary,
 * so "foobar.com" does NOT match zone "bar.com".
 *
 * @param {string} domain      e.g. "app.example.com"
 * @param {Array<{id:string,name:string}>} zones
 * @returns {{id:string,name:string}|null}
 */
export const resolveZone = (domain, zones) => {
	const target = String(domain).replace(/\.$/, "").toLowerCase();
	let best = null;
	for (const zone of zones) {
		const name = String(zone.name).replace(/\.$/, "").toLowerCase();
		const isMatch = target === name || target.endsWith(`.${name}`);
		if (isMatch && (best === null || name.length > best.name.length)) {
			best = { ...zone, name };
		}
	}
	return best;
};
