import fs from "node:fs";
import batchflow from "batchflow";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { access as logger } from "../logger.js";
import accessListModel from "../models/access_list.js";
import accessListAuthModel from "../models/access_list_auth.js";
import accessListClientModel from "../models/access_list_client.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted"];
};

// Build a map of ACL id -> usage count from locations only (host-level usage is counted by SQL)
const buildAccessListUsageMap = async () => {
	const usage = {};
	const hosts = await proxyHostModel.query().select("locations").where("is_deleted", 0);
	hosts.forEach((host) => {
		if (Array.isArray(host.locations)) {
			host.locations.forEach((loc) => {
				if (loc && loc.use_parent_access_list === false && loc.access_list_id) {
					usage[loc.access_list_id] = (usage[loc.access_list_id] || 0) + 1;
				}
			});
		}
	});
	return usage;
};

// Find proxy hosts that reference an ACL either directly or via locations
const findProxyHostsUsingAcl = async (accessListId) => {
	const hosts = await proxyHostModel.query().where("is_deleted", 0);
	return hosts.filter((host) => {
		if (host.access_list_id === accessListId) return true;
		if (Array.isArray(host.locations)) {
			return host.locations.some(
				(loc) => loc && loc.use_parent_access_list === false && loc.access_list_id === accessListId,
			);
		}
		return false;
	});
};

// Fetch proxy hosts with full expansions needed for config generation
const fetchHostsForConfigGeneration = async (hostIds) => {
	if (!hostIds.length) return [];
	const hosts = await proxyHostModel
		.query()
		.whereIn("id", hostIds)
		.where("is_deleted", 0)
		.withGraphFetched("[certificate, access_list.[clients,items]]");
	return hosts;
};

const internalAccessList = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("access_lists:create", data);
		const row = await accessListModel
			.query()
			.insertAndFetch({
				name: data.name,
				satisfy_any: data.satisfy_any,
				pass_auth: data.pass_auth,
				owner_user_id: access.token.getUserId(1),
			})
			.then(utils.omitRow(omissions()));

		data.id = row.id;

		const promises = [];
		// Items
		data.items.map((item) => {
			promises.push(
				accessListAuthModel.query().insert({
					access_list_id: row.id,
					username: item.username,
					password: item.password,
				}),
			);
			return true;
		});

		// Clients
		data.clients?.map((client) => {
			promises.push(
				accessListClientModel.query().insert({
					access_list_id: row.id,
					address: client.address,
					directive: client.directive,
				}),
			);
			return true;
		});

		await Promise.all(promises);

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: ["owner", "items", "clients", "proxy_hosts.access_list.[clients,items]"],
			},
			true // skip masking
		);

		// Audit log
		data.meta = _.assign({}, data.meta || {}, freshRow.meta);
		await internalAccessList.build(freshRow);

		if (Number.parseInt(freshRow.proxy_host_count, 10)) {
			await internalNginx.bulkGenerateConfigs("proxy_host", freshRow.proxy_hosts);
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "access-list",
			object_id: freshRow.id,
			meta: internalAccessList.maskItems(data),
		});

		return internalAccessList.maskItems(freshRow);
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @param  {String}  [data.name]
	 * @param  {String}  [data.items]
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("access_lists:update", data.id);
		const row = await internalAccessList.get(access, { id: data.id });
		if (row.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`Access List could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		// patch name if specified
		if (typeof data.name !== "undefined" && data.name) {
			await accessListModel.query().where({ id: data.id }).patch({
				name: data.name,
				satisfy_any: data.satisfy_any,
				pass_auth: data.pass_auth,
			});
		}

		// Check for items and add/update/remove them
		if (typeof data.items !== "undefined" && data.items) {
			const promises = [];
			const itemsToKeep = [];

			data.items.map((item) => {
				if (item.password) {
					promises.push(
						accessListAuthModel.query().insert({
							access_list_id: data.id,
							username: item.username,
							password: item.password,
						}),
					);
				} else {
					// This was supplied with an empty password, which means keep it but don't change the password
					itemsToKeep.push(item.username);
				}
				return true;
			});

			const query = accessListAuthModel.query().delete().where("access_list_id", data.id);

			if (itemsToKeep.length) {
				query.andWhere("username", "NOT IN", itemsToKeep);
			}

			await query;
			// Add new items
			if (promises.length) {
				await Promise.all(promises);
			}
		}

		// Check for clients and add/update/remove them
		if (typeof data.clients !== "undefined" && data.clients) {
			const clientPromises = [];
			data.clients.map((client) => {
				if (client.address) {
					clientPromises.push(
						accessListClientModel.query().insert({
							access_list_id: data.id,
							address: client.address,
							directive: client.directive,
						}),
					);
				}
				return true;
			});

			const query = accessListClientModel.query().delete().where("access_list_id", data.id);
			await query;
			// Add new clitens
			if (clientPromises.length) {
				await Promise.all(clientPromises);
			}
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: data.id,
			meta: internalAccessList.maskItems(data),
		});

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: ["owner", "items", "clients", "proxy_hosts.[certificate,access_list.[clients,items]]"],
			},
			true // skip masking
		);

		// Find all hosts that use this ACL (directly or via locations)
		const allAffectedHosts = await findProxyHostsUsingAcl(data.id);
		const hostIds = allAffectedHosts.map((h) => h.id);

		// Re-fetch with proper expansions for config generation
		const hostsForConfig = await fetchHostsForConfigGeneration(hostIds);

		// Enrich locations with the updated ACL data
		for (const host of hostsForConfig) {
			if (Array.isArray(host.locations)) {
				host.locations.forEach((loc) => {
					if (loc && loc.use_parent_access_list === false && loc.access_list_id === data.id) {
						loc.access_list = freshRow;
					}
				});
			}
		}

		freshRow.proxy_host_count = hostIds.length;

		await internalAccessList.build(freshRow);
		if (hostsForConfig.length) {
			await internalNginx.bulkGenerateConfigs("proxy_host", hostsForConfig);
		}
		await internalNginx.reload();
		return internalAccessList.maskItems(freshRow);
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Integer}  data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @param  {Boolean}  [skipMasking]
	 * @return {Promise}
	 */
	get: async (access, data, skipMasking) => {
		const thisData = data || {};
		const accessData = await access.can("access_lists:get", thisData.id)

		const usageMap = await buildAccessListUsageMap();
		const query = accessListModel
			.query()
			.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.access_list_id", "=", "access_list.id").andOn(
					"proxy_host.is_deleted",
					"=",
					0,
				);
			})
			.where("access_list.is_deleted", 0)
			.andWhere("access_list.id", thisData.id)
			.groupBy("access_list.id")
			.allowGraph("[owner,items,clients,proxy_hosts.[certificate,access_list.[clients,items]]]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("access_list.owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query.then(utils.omitRow(omissions()));
		row.proxy_host_count = Number.parseInt(row.proxy_host_count || 0, 10);
		row.location_count = usageMap[row.id] || 0;

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		if (!skipMasking && typeof row.items !== "undefined" && row.items) {
			row = internalAccessList.maskItems(row);
		}
		// Custom omissions
		if (typeof data.omit !== "undefined" && data.omit !== null) {
			row = _.omit(row, data.omit);
		}
		return row;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @param   {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("access_lists:delete", data.id);
		const row = await internalAccessList.get(access, {
			id: data.id,
			expand: ["proxy_hosts", "items", "clients"],
		});

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// 1. update row to be deleted
		// 2. update any proxy hosts that were using it (ignoring permissions)
		// 3. reconfigure those hosts
		// 4. audit log

		// 1. update row to be deleted
		await accessListModel
			.query()
			.where("id", row.id)
			.patch({
				is_deleted: 1,
			});

		// 2. update any proxy hosts that were using it (ignoring permissions)
		const affectedHosts = await findProxyHostsUsingAcl(row.id);
		const hostIds = affectedHosts.map((h) => h.id);

		if (affectedHosts.length) {
			// clear direct ACL assignment
			await proxyHostModel.query().where("access_list_id", "=", row.id).patch({ access_list_id: 0 });

			// clear location-level ACLs
			await Promise.all(
				affectedHosts.map(async (host) => {
					if (!Array.isArray(host.locations)) return;
					const updatedLocations = host.locations.map((loc) => {
						if (loc && loc.use_parent_access_list === false && loc.access_list_id === row.id) {
							return {
								...loc,
								use_parent_access_list: true,
								access_list_id: 0,
								access_list: null,
							};
						}
						return loc;
					});
					await proxyHostModel.query().where("id", host.id).patch({ locations: updatedLocations });
					return true;
				}),
			);

			// 3. re-fetch hosts with proper expansions for config generation
			const hostsForConfig = await fetchHostsForConfigGeneration(hostIds);
			await internalNginx.bulkGenerateConfigs("proxy_host", hostsForConfig);
		}

		await internalNginx.reload();

		// delete the htpasswd file
		try {
			fs.unlinkSync(internalAccessList.getFilename(row));
		} catch (_err) {
			// do nothing
		}

		// 4. audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "access-list",
			object_id: row.id,
			meta: _.omit(internalAccessList.maskItems(row), ["is_deleted", "proxy_hosts"]),
		});
		return true;
	},

	/**
	 * All Lists
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("access_lists:list");
		const usageMap = await buildAccessListUsageMap();

		const query = accessListModel
			.query()
			.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.access_list_id", "=", "access_list.id").andOn(
					"proxy_host.is_deleted",
					"=",
					0,
				);
			})
			.where("access_list.is_deleted", 0)
			.groupBy("access_list.id")
			.allowGraph("[owner,items,clients]")
			.orderBy("access_list.name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("access_list.owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string") {
			query.where(function () {
				this.where("name", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		if (rows) {
			rows.map((row, idx) => {
				rows[idx].proxy_host_count = Number.parseInt(row.proxy_host_count || 0, 10);
				rows[idx].location_count = usageMap[row.id] || 0;
				if (typeof row.items !== "undefined" && row.items) {
					rows[idx] = internalAccessList.maskItems(rows[idx]);
				}
				return true;
			});
		}
		return rows;
	},

	/**
	 * Count is used in reports
	 *
	 * @param   {Integer} userId
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (userId, visibility) => {
		const query = accessListModel
			.query()
			.count("id as count")
			.where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", userId);
		}

		const row = await query.first();
		return Number.parseInt(row.count, 10);
	},

	/**
	 * @param   {Object}  list
	 * @returns {Object}
	 */
	maskItems: (list) => {
		if (list && typeof list.items !== "undefined") {
			list.items.map((val, idx) => {
				let repeatFor = 8;
				let firstChar = "*";

				if (typeof val.password !== "undefined" && val.password) {
					repeatFor = val.password.length - 1;
					firstChar = val.password.charAt(0);
				}

				list.items[idx].hint = firstChar + "*".repeat(repeatFor);
				list.items[idx].password = "";
				return true;
			});
		}
		return list;
	},

	/**
	 * @param   {Object}  list
	 * @param   {Integer} list.id
	 * @returns {String}
	 */
	getFilename: (list) => {
		return `/data/access/${list.id}`;
	},

	/**
	 * @param   {Object}  list
	 * @param   {Integer} list.id
	 * @param   {String}  list.name
	 * @param   {Array}   list.items
	 * @returns {Promise}
	 */
	build: async (list) => {
		logger.info(`Building Access file #${list.id} for: ${list.name}`);

		const htpasswdFile = internalAccessList.getFilename(list);

		// 1. remove any existing access file
		try {
			fs.unlinkSync(htpasswdFile);
		} catch (_err) {
			// do nothing
		}

		// 2. create empty access file
		fs.writeFileSync(htpasswdFile, '', {encoding: 'utf8'});

		// 3. generate password for each user
		if (list.items.length) {
			await new Promise((resolve, reject) => {
				batchflow(list.items).sequential()
					.each((_i, item, next) => {
						if (item.password?.length) {
							logger.info(`Adding: ${item.username}`);

							utils.execFile('openssl', ['passwd', '-apr1', item.password])
								.then((res) => {
									try {
										fs.appendFileSync(htpasswdFile, `${item.username}:${res}\n`, {encoding: 'utf8'});
									} catch (err) {
										reject(err);
									}
									next();
								})
								.catch((err) => {
									logger.error(err);
									next(err);
								});
						}
					})
					.error((err) => {
						logger.error(err);
						reject(err);
					})
					.end((results) => {
						logger.success(`Built Access file #${list.id} for: ${list.name}`);
						resolve(results);
					});
			});
		}
	}
}

export default internalAccessList;
