import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import streamModel from "../models/stream.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted", "certificate.is_deleted"];
};

const internalStream = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		internalHost.sanitiseInput(data);
		const create_certificate = data.certificate_id === "new";
		let createdId = null;
		let issuedCertificateId = null;

		if (create_certificate) {
			delete data.certificate_id;
		}

		return access
			.can("streams:create", data)
			.then((/*access_data*/) => {
				// TODO: At this point the existing ports should have been checked
				data.owner_user_id = access.token.getUserId(1);

				if (typeof data.meta === "undefined") {
					data.meta = {};
				}

				// streams aren't routed by domain name so don't store domain names in the DB
				const data_no_domains = structuredClone(data);
				delete data_no_domains.domain_names;

				return streamModel.query().insertAndFetch(data_no_domains).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				createdId = row.id;
				if (create_certificate) {
					// Check that nginx accepts the host before a certificate is requested: when the host is
					// rejected the create is rolled back, and a certificate issued for it would be left behind
					// (and renewed forever). The SSL part is checked again when the certificate is added.
					return internalNginx
						.configure(streamModel, "stream", row, { dryRun: true })
						.then(() => internalCertificate.createQuickCertificate(access, data))
						.then((cert) => {
							issuedCertificateId = cert.id;
							// update host with cert id
							return internalStream.update(access, {
								id: row.id,
								certificate_id: cert.id,
							});
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then((row) => {
				// re-fetch with cert
				return internalStream.get(access, {
					id: row.id,
					expand: ["certificate", "owner"],
				});
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(streamModel, "stream", row).then((newMeta) => {
					row.meta = newMeta;
					return row;
				});
			})
			.then((row) => {
				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "stream",
						object_id: row.id,
						meta: data,
					})
					.then(() => {
						return row;
					});
			})
			.catch(async (err) => {
				// nginx rejected the new stream: don't keep a stream that was never active
				if (createdId && internalNginx.isHostLevelError(err)) {
					await internalHost.discardRejectedCreate(streamModel, "stream", createdId);
				}
				// the certificate requested for it is left unused when the host is gone or was rejected with it
				if (issuedCertificateId) {
					await internalHost.discardUnusedCertificate(issuedCertificateId, () =>
						internalCertificate.delete(access, { id: issuedCertificateId }),
					);
				}
				throw err;
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		let thisData = internalHost.sanitiseInput(data);
		const create_certificate = thisData.certificate_id === "new";
		let newCertificateId = null;

		if (create_certificate) {
			delete thisData.certificate_id;
		}

		return access
			.can("streams:update", thisData.id)
			.then((/*access_data*/) => {
				// TODO: at this point the existing streams should have been checked
				return internalStream.get(access, { id: thisData.id });
			})
			.then((row) => {
				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Stream could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
					);
				}

				if (create_certificate) {
					// Check that nginx accepts the rest of the update before the certificate is requested
					return internalStream
						.get(access, { id: row.id, expand: ["owner", "certificate"] })
						.then((fullRow) =>
							internalHost.checkProposedHost({
								model: streamModel,
								hostType: "stream",
								row: fullRow,
								patch: _.assign({}, { domain_names: row.domain_names }, thisData),
							}),
						)
						.then(() =>
							internalCertificate.createQuickCertificate(access, {
								domain_names: thisData.domain_names || row.domain_names,
								meta: _.assign({}, row.meta, thisData.meta),
							}),
						)
						.then((cert) => {
							// update host with cert id
							thisData.certificate_id = cert.id;
							newCertificateId = cert.id;
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then((row) => {
				// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
				thisData = _.assign(
					{},
					{
						domain_names: row.domain_names,
					},
					thisData,
				);

				return internalHost.updateAndConfigure({
					model: streamModel,
					hostType: "stream",
					id: row.id,
					patch: thisData,
					fetch: () => internalStream.get(access, { id: thisData.id, expand: ["owner", "certificate"] }),
					audit: () =>
						internalAuditLog.add(access, {
							action: "updated",
							object_type: "stream",
							object_id: row.id,
							meta: thisData,
						}),
				});
			})
			.catch(async (err) => {
				if (newCertificateId) {
					await internalHost.discardUnusedCertificate(newCertificateId, () =>
						internalCertificate.delete(access, { id: newCertificateId }),
					);
				}
				throw err;
			})
			.then((row) => {
				return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		const thisData = data || {};
		return access
			.can("streams:get", thisData.id)
			.then((access_data) => {
				const query = streamModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", thisData.id)
					.allowGraph(streamModel.defaultAllowGraph)
					.first();

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				let thisRow = row;
				if (!thisRow?.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				thisRow = internalHost.cleanRowCertificateMeta(thisRow);
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(thisRow, thisData.omit);
				}
				return thisRow;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access
			.can("streams:delete", data.id)
			.then(() => {
				return internalStream.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return streamModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.removeConfigAndReload("stream", row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "stream",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: async (access, data) => {
		await access.can("streams:update", data.id);
		// 404 and permission check before the lock is taken
		await internalStream.get(access, { id: data.id });
		const row = await internalHost.setEnabledAndConfigure({
			model: streamModel,
			hostType: "stream",
			enable: true,
			fetch: () => internalStream.get(access, { id: data.id, expand: ["certificate", "owner"] }),
			alreadyMessage: "Stream is already enabled",
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "stream",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: async (access, data) => {
		await access.can("streams:update", data.id);
		await internalStream.get(access, { id: data.id });
		const row = await internalHost.setEnabledAndConfigure({
			model: streamModel,
			hostType: "stream",
			enable: false,
			fetch: () => internalStream.get(access, { id: data.id }),
			alreadyMessage: "Stream is already disabled",
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "stream",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * All Streams
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access
			.can("streams:list")
			.then((access_data) => {
				const query = streamModel
					.query()
					.where("is_deleted", 0)
					.groupBy("id")
					.allowGraph(streamModel.defaultAllowGraph)
					.orderBy("incoming_port", "ASC");

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				// Query is used for searching
				if (typeof search_query === "string" && search_query.length > 0) {
					query.where(function () {
						this.where(castJsonIfNeed("incoming_port"), "like", `%${search_query}%`);
					});
				}

				if (typeof expand !== "undefined" && expand !== null) {
					query.withGraphFetched(`[${expand.join(", ")}]`);
				}

				return query.then(utils.omitRows(omissions()));
			})
			.then((rows) => {
				if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
					return internalHost.cleanAllRowsCertificateMeta(rows);
				}

				return rows;
			});
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		const query = streamModel.query().count("id AS count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});
	},
};

export default internalStream;
