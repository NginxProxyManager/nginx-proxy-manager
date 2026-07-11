import _ from "lodash";

/**
 * @param {string[]} desired
 * @param {Array<{domain:string,zone_id:string,rrset_id:string}>} existingRecords
 */
export const diffDomains = (desired, existingRecords) => {
	const existingByDomain = _.keyBy(existingRecords || [], "domain");
	const desiredSet = new Set(desired || []);
	const toCreate = (desired || []).filter((d) => !existingByDomain[d]);
	const toDelete = (existingRecords || []).filter((r) => !desiredSet.has(r.domain));
	return { toCreate, toDelete };
};
