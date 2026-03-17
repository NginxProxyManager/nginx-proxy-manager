import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { upstreamHosts as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import upstreamHostModel from "../models/upstream_host.js";
import upstreamHostServerModel from "../models/upstream_host_server.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted"];
};

const internalUpstreamHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("upstream_hosts:create", data);
		const row = await upstreamHostModel
			.query()
			.insertAndFetch({
				name: data.name,
				forward_scheme: data.forward_scheme || "http",
				method: data.method || "round_robin",
				owner_user_id: access.token.getUserId(1),
			})
			.then(utils.omitRow(omissions()));

		data.id = row.id;

		// Insert servers
		const promises = [];
		if (data.servers && data.servers.length) {
			data.servers.map((server) => {
				promises.push(
					upstreamHostServerModel.query().insert({
						upstream_host_id: row.id,
						host: server.host,
						port: server.port,
						weight: server.weight || null,
					}),
				);
				return true;
			});
		}

		await Promise.all(promises);

		// re-fetch with expansions
		const freshRow = await internalUpstreamHost.get(access, {
			id: data.id,
			expand: ["owner", "servers"],
		});

		// Configure nginx
		await internalNginx.configure(upstreamHostModel, "upstream_host", freshRow);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "upstream-host",
			object_id: freshRow.id,
			meta: data,
		});

		return freshRow;
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("upstream_hosts:update", data.id);
		const row = await internalUpstreamHost.get(access, { id: data.id });
		if (row.id !== data.id) {
			throw new errs.InternalValidationError(
				`Upstream Host could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		// Patch fields
		const patchData = {};
		if (typeof data.name !== "undefined") patchData.name = data.name;
		if (typeof data.forward_scheme !== "undefined") patchData.forward_scheme = data.forward_scheme;
		if (typeof data.method !== "undefined") patchData.method = data.method;

		if (Object.keys(patchData).length) {
			await upstreamHostModel.query().where({ id: data.id }).patch(patchData);
		}

		// Handle servers: delete + re-insert
		if (typeof data.servers !== "undefined" && data.servers) {
			await upstreamHostServerModel.query().delete().where("upstream_host_id", data.id);

			const serverPromises = [];
			data.servers.map((server) => {
				if (server.host) {
					serverPromises.push(
						upstreamHostServerModel.query().insert({
							upstream_host_id: data.id,
							host: server.host,
							port: server.port,
							weight: server.weight || null,
						}),
					);
				}
				return true;
			});

			if (serverPromises.length) {
				await Promise.all(serverPromises);
			}
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "upstream-host",
			object_id: data.id,
			meta: data,
		});

		// re-fetch with expansions
		const freshRow = await internalUpstreamHost.get(access, {
			id: data.id,
			expand: ["owner", "servers", "proxy_hosts.[certificate,access_list.[clients,items],upstream_host.[servers]]"],
		});

		// Regenerate upstream config
		await internalNginx.configure(upstreamHostModel, "upstream_host", freshRow);

		// Bulk regenerate all referencing proxy host configs
		if (Number.parseInt(freshRow.proxy_host_count, 10)) {
			await internalNginx.bulkGenerateConfigs("proxy_host", freshRow.proxy_hosts);
		}
		await internalNginx.reload();

		return freshRow;
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Integer}  data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const thisData = data || {};
		const accessData = await access.can("upstream_hosts:get", thisData.id);

		const query = upstreamHostModel
			.query()
			.select("upstream_host.*", upstreamHostModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.upstream_host_id", "=", "upstream_host.id").andOn(
					"proxy_host.is_deleted",
					"=",
					0,
				);
			})
			.where("upstream_host.is_deleted", 0)
			.andWhere("upstream_host.id", thisData.id)
			.groupBy("upstream_host.id")
			.allowGraph("[owner,servers,proxy_hosts.[certificate,access_list.[clients,items],upstream_host.[servers]]]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("upstream_host.owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		const row = await query.then(utils.omitRow(omissions()));

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		// Custom omissions
		if (typeof data.omit !== "undefined" && data.omit !== null) {
			return _.omit(row, data.omit);
		}

		return row;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("upstream_hosts:delete", data.id);
		const row = await internalUpstreamHost.get(access, {
			id: data.id,
			expand: ["proxy_hosts.[certificate,access_list.[clients,items]]", "servers"],
		});

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// Prevent deletion if any proxy hosts reference this upstream host
		const referencingHosts = await proxyHostModel
			.query()
			.where("upstream_host_id", row.id)
			.andWhere("is_deleted", 0);

		if (referencingHosts && referencingHosts.length > 0) {
			throw new errs.ValidationError(
				`Upstream host is in use by ${referencingHosts.length} proxy host(s) and cannot be deleted`,
			);
		}

		// 1. soft-delete the upstream host
		await upstreamHostModel
			.query()
			.where("id", row.id)
			.patch({
				is_deleted: 1,
			});

		// 3. delete upstream config file
		await internalNginx.deleteConfig("upstream_host", row, true);
		await internalNginx.reload();

		// 4. audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "upstream-host",
			object_id: row.id,
			meta: _.omit(row, ["is_deleted", "proxy_hosts"]),
		});

		return true;
	},

	/**
	 * All upstream hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("upstream_hosts:list");

		const query = upstreamHostModel
			.query()
			.select("upstream_host.*", upstreamHostModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.upstream_host_id", "=", "upstream_host.id").andOn(
					"proxy_host.is_deleted",
					"=",
					0,
				);
			})
			.where("upstream_host.is_deleted", 0)
			.groupBy("upstream_host.id")
			.allowGraph("[owner,servers]")
			.orderBy("upstream_host.name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("upstream_host.owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string") {
			query.where(function () {
				this.where("upstream_host.name", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		return query.then(utils.omitRows(omissions()));
	},

	/**
	 * Count is used in reports
	 *
	 * @param   {Integer} userId
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (userId, visibility) => {
		const query = upstreamHostModel
			.query()
			.count("id as count")
			.where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", userId);
		}

		const row = await query.first();
		return Number.parseInt(row.count, 10);
	},
};

export default internalUpstreamHost;
