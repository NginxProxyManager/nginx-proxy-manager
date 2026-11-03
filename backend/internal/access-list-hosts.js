import db from "../db.js";
import { isMysql, isPostgres } from "../lib/config.js";
import proxyHostModel from "../models/proxy_host.js";
import internalNginx from "./nginx.js";

/**
 * Find proxy hosts that reference an access list in their locations JSON.
 *
 * @param   {Integer}  accessListId
 * @returns {Promise<Array>}
 */
const getProxyHostsUsingAccessListInLocations = async (accessListId) => {
	let result;
	if (isMysql()) {
		const searchObj = JSON.stringify([{ access_list_id: accessListId }]);
		result = await db().raw("SELECT id FROM proxy_host WHERE is_deleted = 0 AND JSON_CONTAINS(locations, ?, ?)", [
			searchObj,
			"$",
		]);
	} else if (isPostgres()) {
		result = await db().raw("SELECT id FROM proxy_host WHERE is_deleted = 0 AND locations::jsonb @> ?::jsonb", [
			JSON.stringify([{ access_list_id: accessListId }]),
		]);
	} else {
		result = await db().raw("SELECT id FROM proxy_host WHERE is_deleted = 0 AND locations LIKE ?", [
			`%"access_list_id":${accessListId}%`,
		]);
	}
	// knex raw() returns [rows, metadata] for MySQL, { rows } for Postgres and rows for SQLite
	if (!Array.isArray(result)) {
		return result?.rows || [];
	}
	return (Array.isArray(result[0]) ? result[0] : result) || [];
};

/**
 * All proxy hosts using an access list, either for the whole host
 * or for one of its custom locations.
 *
 * @param   {Integer}  accessListId
 * @returns {Promise<Array>}
 */
const getProxyHostsForAccessList = async (accessListId) => {
	const locationHostRows = await getProxyHostsUsingAccessListInLocations(accessListId);
	const locationHostIds = locationHostRows.map((r) => r.id);

	return proxyHostModel
		.query()
		.where("is_deleted", 0)
		.andWhere((qb) => {
			qb.where("access_list_id", accessListId);
			if (locationHostIds.length) {
				qb.orWhereIn("id", locationHostIds);
			}
		})
		.allowGraph(proxyHostModel.defaultAllowGraph)
		.withGraphFetched("[owner, certificate, access_list.[clients,items]]");
};

/**
 * Domain names of the proxy hosts using an access list, for the whole host or in
 * one of its custom locations
 *
 * @param   {Integer}  accessListId
 * @returns {Promise<String[]>}
 */
const getDomainsForAccessList = async (accessListId) => {
	const locationHostRows = await getProxyHostsUsingAccessListInLocations(accessListId);
	const locationHostIds = locationHostRows.map((r) => r.id);

	const rows = await proxyHostModel
		.query()
		.select("domain_names")
		.where("is_deleted", 0)
		.andWhere((qb) => {
			qb.where("access_list_id", accessListId);
			if (locationHostIds.length) {
				qb.orWhereIn("id", locationHostIds);
			}
		});
	return rows.flatMap((row) => row.domain_names || []);
};

/**
 * Regenerates the nginx config of every proxy host using an access list,
 * then reloads nginx.
 *
 * @param   {Integer}  accessListId
 * @returns {Promise}
 */
const regenerateProxyHostsForAccessList = async (accessListId) => {
	const hosts = await getProxyHostsForAccessList(accessListId);
	if (hosts.length) {
		await internalNginx.bulkGenerateConfigs("proxy_host", hosts);
	}
	await internalNginx.reload();
};

export {
	getDomainsForAccessList,
	getProxyHostsForAccessList,
	getProxyHostsUsingAccessListInLocations,
	regenerateProxyHostsForAccessList,
};
