import _ from "lodash";
import errs from "../lib/error.js";
import dnsProviderModel from "../models/dns_provider.js";
import internalAuditLog from "./audit-log.js";
import { getDriver } from "./dns/index.js";

const omissions = () => {
	return ["credentials"];
};

const internalDnsProvider = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		return access
			.can("dns_providers:create", data)
			.then(() => {
				return dnsProviderModel
					.query()
					.insertAndFetch({
						...data,
						owner_user_id: access.token.getUserId(1),
						meta: data.meta || {},
					})
					.then((row) => _.omit(row, omissions()));
			})
			.then((row) => {
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "dns-provider",
						object_id: row.id,
						meta: _.omit(row, omissions()),
					})
					.then(() => row);
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access
			.can("dns_providers:update", data.id)
			.then(() => internalDnsProvider.get(access, { id: data.id }))
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`DNS Provider could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
					);
				}
				return dnsProviderModel
					.query()
					.where("id", data.id)
					.patchAndFetchById(data.id, _.omit(data, ["id"]))
					.then((row) => _.omit(row, omissions()));
			})
			.then((row) => {
				return internalAuditLog
					.add(access, {
						action: "updated",
						object_type: "dns-provider",
						object_id: row.id,
						meta: _.omit(data, omissions()),
					})
					.then(() => row);
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Integer}  data.id
	 * @param  {Array}    [data.expand]
	 * @return {Promise}
	 */
	get: (access, data) => {
		const thisData = data || {};
		return access.can("dns_providers:get", thisData.id).then(() => {
			const query = dnsProviderModel.query().where("is_deleted", 0).andWhere("id", thisData.id).first();

			if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
				query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
			}

			return query.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				return _.omit(row, omissions());
			});
		});
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access
			.can("dns_providers:delete", data.id)
			.then(() => internalDnsProvider.get(access, { id: data.id }))
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				return dnsProviderModel
					.query()
					.where("id", row.id)
					.patch({ is_deleted: 1 })
					.then(() =>
						internalAuditLog.add(access, {
							action: "deleted",
							object_type: "dns-provider",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						}),
					);
			})
			.then(() => true);
	},

	/**
	 * All Providers
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: (access, expand, searchQuery) => {
		return access.can("dns_providers:list").then(() => {
			const query = dnsProviderModel.query().where("is_deleted", 0).orderBy("name", "ASC");

			if (typeof searchQuery === "string" && searchQuery.length > 0) {
				query.where((qb) => {
					qb.where("name", "like", `%${searchQuery}%`);
				});
			}

			if (typeof expand !== "undefined" && expand !== null) {
				query.withGraphFetched(`[${expand.join(", ")}]`);
			}

			return query.then((rows) => rows.map((row) => _.omit(row, omissions())));
		});
	},

	/**
	 * Count is used in reports
	 *
	 * @param   {Integer} userId
	 * @returns {Promise}
	 */
	getCount: (_userId) => {
		return dnsProviderModel
			.query()
			.count("id as count")
			.where("is_deleted", 0)
			.first()
			.then((row) => Number.parseInt(row.count, 10));
	},

	/**
	 * Tests the connection for a DNS provider using its stored credentials
	 *
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @returns {Promise}
	 */
	test: (access, data) => {
		return access
			.can("dns_providers:get", data.id)
			.then(() => dnsProviderModel.query().where("is_deleted", 0).andWhere("id", data.id).first())
			.then(async (row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				const result = await getDriver(row.type).testConnection(row.credentials);
				// Persist the last connection-check result so the list view can show a status.
				const meta = _.assign({}, row.meta, {
					last_check_ok: result.ok,
					last_check_error: result.ok ? null : result.error || null,
				});
				await dnsProviderModel.query().where("id", row.id).patch({ meta });
				return result;
			});
	},
};

export default internalDnsProvider;
