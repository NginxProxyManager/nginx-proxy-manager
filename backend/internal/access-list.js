import fs from "node:fs";
import batchflow from "batchflow";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { access as logger } from "../logger.js";
import accessListModel from "../models/access_list.js";
import accessListAuthModel from "../models/access_list_auth.js";
import accessListClientModel from "../models/access_list_client.js";
import accessListKeyModel from "../models/access_list_key.js";
import accessListTokenModel from "../models/access_list_token.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAccessGate from "./access-gate.js";
import {
	getProxyHostsForAccessList,
	getProxyHostsUsingAccessListInLocations,
	regenerateProxyHostsForAccessList,
} from "./access-list-hosts.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted"];
};

/**
 * Loads a list the token's user may change, for managing its keys and tokens
 *
 * @param   {Access}  access
 * @param   {Integer} listId
 * @param   {Array}   [expand]
 * @returns {Promise<Object>}
 */
const getListForUpdate = async (access, listId, expand) => {
	await access.can("access_lists:update", listId);
	return internalAccessList.get(access, { id: listId, expand });
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
				key_auth: data.key_auth === true,
				key_session_hours: data.key_session_hours || 168,
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

		await Promise.all(promises);

		// Clients
		for (const client of data.clients ?? []) {
			await accessListClientModel.query().insert({
				access_list_id: row.id,
				address: client.address,
				directive: client.directive,
			});
		}

		await internalAccessGate.refreshGateMeta(row.id);

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: ["owner", "items", "clients", "proxy_hosts.access_list.[clients,items]"],
			},
			true, // skip masking
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

		// Security key settings
		const keyPatch = {};
		if (typeof data.key_auth !== "undefined") {
			keyPatch.key_auth = data.key_auth;
		}
		if (typeof data.key_session_hours !== "undefined") {
			keyPatch.key_session_hours = data.key_session_hours;
		}
		if (Object.keys(keyPatch).length) {
			await accessListModel.query().where({ id: data.id }).patch(keyPatch);
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
			const query = accessListClientModel.query().delete().where("access_list_id", data.id);
			await query;

			for (const client of data.clients) {
				if (client.address) {
					await accessListClientModel.query().insert({
						access_list_id: data.id,
						address: client.address,
						directive: client.directive,
					});
				}
			}
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: data.id,
			meta: internalAccessList.maskItems(data),
		});

		// Users, pass_auth and the key settings decide how hosts check this list
		await internalAccessGate.refreshGateMeta(data.id);
		internalAccessGate.invalidate(data.id);

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: ["owner", "items", "clients", "proxy_hosts.[certificate,access_list.[clients,items]]"],
			},
			true, // skip masking
		);

		await internalAccessList.build(freshRow);

		// Regenerate hosts using this list, for the whole host or in a location, then reload
		await regenerateProxyHostsForAccessList(data.id);
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
		const accessData = await access.can("access_lists:get", thisData.id);

		const query = accessListModel
			.query()
			.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.access_list_id", "=", "access_list.id").andOn("proxy_host.is_deleted", "=", 0);
			})
			.where("access_list.is_deleted", 0)
			.andWhere("access_list.id", thisData.id)
			.groupBy("access_list.id")
			.allowGraph("[owner,items,clients,keys,tokens,proxy_hosts.[certificate,access_list.[clients,items]]]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("access_list.owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query.then(utils.omitRow(omissions()));

		if (!row?.id) {
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

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// 1. update row to be deleted
		// 2. update any proxy hosts that were using it (ignoring permissions)
		// 3. reconfigure those hosts
		// 4. audit log

		// 1. update row to be deleted, and remove its keys and tokens
		await accessListModel.query().where("id", row.id).patch({
			is_deleted: 1,
		});
		await internalAccessGate.deleteCredentials(row.id);

		// 2. update any proxy hosts that were using it (ignoring permissions)
		const affectedHostIds = new Set((row.proxy_hosts || []).map((h) => h.id));
		if (affectedHostIds.size) {
			await proxyHostModel.query().where("access_list_id", "=", row.id).patch({ access_list_id: 0 });
		}

		// Also clear it from any proxy host locations using it, these will then inherit the host's access list
		const locationHostRows = await getProxyHostsUsingAccessListInLocations(row.id);
		for (const { id: hostId } of locationHostRows) {
			const host = await proxyHostModel.query().where("id", hostId).first();
			if (host?.locations?.some((loc) => loc.access_list_id === row.id)) {
				const updatedLocations = host.locations.map((loc) => {
					if (loc.access_list_id === row.id) {
						return { ...loc, access_list_id: 0 };
					}
					return loc;
				});
				await proxyHostModel.query().where("id", hostId).patch({ locations: updatedLocations });
				affectedHostIds.add(hostId);
			}
		}

		// 3. reconfigure those hosts from fresh rows, then reload nginx
		if (affectedHostIds.size) {
			const affectedHosts = await proxyHostModel
				.query()
				.where("is_deleted", 0)
				.whereIn("id", [...affectedHostIds])
				.allowGraph(proxyHostModel.defaultAllowGraph)
				.withGraphFetched("[owner, certificate, access_list.[clients,items]]");
			await internalNginx.bulkGenerateConfigs("proxy_host", affectedHosts);
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

		const query = accessListModel
			.query()
			.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.access_list_id", "=", "access_list.id").andOn("proxy_host.is_deleted", "=", 0);
			})
			.where("access_list.is_deleted", 0)
			.groupBy("access_list.id")
			.allowGraph("[owner,items,clients,keys,tokens]")
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
				if (typeof row.items !== "undefined" && row.items) {
					rows[idx] = internalAccessList.maskItems(row);
				}
				return true;
			});
		}
		return rows;
	},

	/**
	 * Creates a one-time link for registering a security key on a list
	 *
	 * @param   {Access}  access
	 * @param   {Integer} listId
	 * @param   {Object}  data
	 * @param   {String}  data.name
	 * @returns {Promise<{expires_on: String, urls: Array}>}
	 */
	createKeyInvite: async (access, listId, data) => {
		const list = await getListForUpdate(access, listId);
		if (!list.key_auth) {
			throw new errs.ValidationError("Enable security keys on this access list and save it first");
		}

		const { token, expiresOn } = internalAccessGate.createInviteToken(list.id, data.name);

		// A link on each fixed domain using the list. Browsers only allow keys over https.
		const urls = [];
		const seen = new Set();
		for (const host of await getProxyHostsForAccessList(list.id)) {
			const secure = Number.parseInt(host.certificate_id, 10) > 0;
			for (const domain of host.domain_names || []) {
				const name = `${domain}`.toLowerCase();
				if (name.includes("*") || seen.has(name)) {
					continue;
				}
				seen.add(name);
				urls.push({
					domain: name,
					secure,
					url: `${secure ? "https" : "http"}://${name}/.npm-auth/enroll#${token}`,
				});
			}
		}

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: list.id,
			meta: { security_key: { action: "invited", name: data.name } },
		});

		return { expires_on: expiresOn, urls };
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} listId
	 * @param   {Integer} keyId
	 * @param   {Object}  data
	 * @param   {String}  data.name
	 * @returns {Promise<Object>}
	 */
	updateKey: async (access, listId, keyId, data) => {
		const list = await getListForUpdate(access, listId, ["keys"]);
		const key = list.keys.find((k) => k.id === keyId);
		if (!key) {
			throw new errs.ItemNotFoundError(keyId);
		}

		await accessListKeyModel.query().where("id", key.id).patch({ name: data.name });
		internalAccessGate.invalidate(list.id);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: list.id,
			meta: { security_key: { action: "renamed", id: key.id, name: data.name, previous_name: key.name } },
		});

		const fresh = await internalAccessList.get(access, { id: list.id, expand: ["keys"] });
		return fresh.keys.find((k) => k.id === key.id);
	},

	/**
	 * Removes a key. Sessions it started end straight away.
	 *
	 * @param   {Access}  access
	 * @param   {Integer} listId
	 * @param   {Integer} keyId
	 * @returns {Promise<Boolean>}
	 */
	deleteKey: async (access, listId, keyId) => {
		const list = await getListForUpdate(access, listId, ["keys"]);
		const key = list.keys.find((k) => k.id === keyId);
		if (!key) {
			throw new errs.ItemNotFoundError(keyId);
		}

		await accessListKeyModel.query().delete().where("id", key.id);
		internalAccessGate.invalidate(list.id);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: list.id,
			meta: { security_key: { action: "removed", id: key.id, name: key.name } },
		});
		return true;
	},

	/**
	 * Adds a header token. Only a digest of the value is kept.
	 *
	 * @param   {Access}  access
	 * @param   {Integer} listId
	 * @param   {Object}  data
	 * @param   {String}  data.name
	 * @param   {String}  data.header_name
	 * @param   {String}  data.value
	 * @param   {Boolean} [data.forward]
	 * @returns {Promise<Object>}
	 */
	createToken: async (access, listId, data) => {
		const list = await getListForUpdate(access, listId);
		if (internalAccessGate.isReservedHeader(data.header_name)) {
			throw new errs.ValidationError(`"${data.header_name}" can't be used as a token header`);
		}

		const tokenHash = internalAccessGate.hashToken(data.value);
		const duplicate = await accessListTokenModel
			.query()
			.where("access_list_id", list.id)
			.andWhere("token_hash", tokenHash)
			.first();
		if (duplicate) {
			throw new errs.ValidationError("This token is already on this access list");
		}

		const row = await accessListTokenModel.query().insertAndFetch({
			access_list_id: list.id,
			name: data.name,
			header_name: data.header_name,
			token_hash: tokenHash,
			forward: data.forward !== false,
		});

		// Tokens put the list in gate mode, and decide which headers nginx strips
		await internalAccessGate.refreshGateMeta(list.id);
		internalAccessGate.invalidate(list.id);
		await regenerateProxyHostsForAccessList(list.id);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: list.id,
			meta: { token: { action: "created", id: row.id, name: row.name, header_name: row.header_name } },
		});

		const fresh = await internalAccessList.get(access, { id: list.id, expand: ["tokens"] });
		return fresh.tokens.find((t) => t.id === row.id);
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} listId
	 * @param   {Integer} tokenId
	 * @param   {Object}  data
	 * @param   {String}  [data.name]
	 * @param   {Boolean} [data.forward]
	 * @returns {Promise<Object>}
	 */
	updateToken: async (access, listId, tokenId, data) => {
		const list = await getListForUpdate(access, listId, ["tokens"]);
		const token = list.tokens.find((t) => t.id === tokenId);
		if (!token) {
			throw new errs.ItemNotFoundError(tokenId);
		}

		await accessListTokenModel
			.query()
			.where("id", token.id)
			.patch(_.pick(data, ["name", "forward"]));
		internalAccessGate.invalidate(list.id);

		if (typeof data.forward !== "undefined" && data.forward !== token.forward) {
			await internalAccessGate.refreshGateMeta(list.id);
			await regenerateProxyHostsForAccessList(list.id);
		}

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: list.id,
			meta: { token: { action: "updated", id: token.id, ..._.pick(data, ["name", "forward"]) } },
		});

		const fresh = await internalAccessList.get(access, { id: list.id, expand: ["tokens"] });
		return fresh.tokens.find((t) => t.id === token.id);
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} listId
	 * @param   {Integer} tokenId
	 * @returns {Promise<Boolean>}
	 */
	deleteToken: async (access, listId, tokenId) => {
		const list = await getListForUpdate(access, listId, ["tokens"]);
		const token = list.tokens.find((t) => t.id === tokenId);
		if (!token) {
			throw new errs.ItemNotFoundError(tokenId);
		}

		await accessListTokenModel.query().delete().where("id", token.id);
		await internalAccessGate.refreshGateMeta(list.id);
		internalAccessGate.invalidate(list.id);
		await regenerateProxyHostsForAccessList(list.id);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: list.id,
			meta: { token: { action: "deleted", id: token.id, name: token.name } },
		});
		return true;
	},

	/**
	 * Count is used in reports
	 *
	 * @param   {Integer} userId
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (userId, visibility) => {
		const query = accessListModel.query().count("id as count").where("is_deleted", 0);

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
		fs.writeFileSync(htpasswdFile, "", { encoding: "utf8" });

		// 3. generate password for each user
		if (list.items.length) {
			await new Promise((resolve, reject) => {
				batchflow(list.items)
					.sequential()
					.each((_i, item, next) => {
						if (item.password?.length) {
							logger.info(`Adding: ${item.username}`);

							utils
								.execFile("openssl", ["passwd", "-apr1", item.password])
								.then((res) => {
									try {
										fs.appendFileSync(htpasswdFile, `${item.username}:${res}\n`, {
											encoding: "utf8",
										});
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
	},
};

export default internalAccessList;
