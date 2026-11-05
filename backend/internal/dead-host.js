import _ from "lodash";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import deadHostModel from "../models/dead_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted"];
};

const internalDeadHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		internalHost.sanitiseInput(data);
		const createCertificate = data.certificate_id === "new";

		if (createCertificate) {
			delete data.certificate_id;
		}

		await access.can("dead_hosts:create", data);

		// Get a list of the domain names and check each of them against existing records
		const domainNameCheckPromises = [];

		data.domain_names.map((domain_name) => {
			domainNameCheckPromises.push(internalHost.isHostnameTaken(domain_name));
			return true;
		});

		await Promise.all(domainNameCheckPromises).then((check_results) => {
			check_results.map((result) => {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
				return true;
			});
		});

		// At this point the domains should have been checked
		data.owner_user_id = access.token.getUserId(1);
		const thisData = internalHost.cleanSslHstsData(data);

		// Fix for db field not having a default value
		// for this optional field.
		if (typeof data.advanced_config === "undefined") {
			thisData.advanced_config = "";
		}

		const isAdmin = access.hasRole?.("admin") || access.token.hasScope("admin");
		if (!isAdmin && thisData.advanced_config && thisData.advanced_config.trim() !== "") {
			throw new errs.PermissionError("You do not have permission to modify advanced configuration");
		}

		const row = await deadHostModel.query().insertAndFetch(thisData).then(utils.omitRow(omissions()));

		let freshRow;
		try {
			if (createCertificate) {
				// Check that nginx accepts the host before a certificate is requested: when the host is
				// rejected the create is rolled back, and a certificate issued for it would be left behind
				// (and renewed forever). The SSL part is checked again when the certificate is added.
				await internalNginx.configure(deadHostModel, "dead_host", row, { dryRun: true });
				const cert = await internalCertificate.createQuickCertificate(access, data);

				// update host with cert id
				await internalDeadHost.update(access, {
					id: row.id,
					certificate_id: cert.id,
				});
			}

			// re-fetch with cert
			freshRow = await internalDeadHost.get(access, {
				id: row.id,
				expand: ["certificate", "owner"],
			});

			// Sanity check
			if (createCertificate && !freshRow.certificate_id) {
				throw new errs.InternalValidationError("The host was created but the Certificate creation failed.");
			}

			// Configure nginx
			freshRow.meta = await internalNginx.configure(deadHostModel, "dead_host", freshRow);
		} catch (err) {
			// nginx rejected the new host: don't keep a host that was never active
			if (internalNginx.isHostLevelError(err)) {
				await deadHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
			}
			throw err;
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.assign({}, thisData, { meta: _.assign({}, thisData.meta || {}, freshRow.meta) }),
		});

		return freshRow;
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: async (access, data) => {
		internalHost.sanitiseInput(data);
		const createCertificate = data.certificate_id === "new";
		if (createCertificate) {
			delete data.certificate_id;
		}

		await access.can("dead_hosts:update", data.id);

		// Get a list of the domain names and check each of them against existing records
		const domainNameCheckPromises = [];
		if (typeof data.domain_names !== "undefined") {
			data.domain_names.map((domainName) => {
				domainNameCheckPromises.push(internalHost.isHostnameTaken(domainName, "dead", data.id));
				return true;
			});

			const checkResults = await Promise.all(domainNameCheckPromises);
			checkResults.map((result) => {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
				return true;
			});
		}
		const row = await internalDeadHost.get(access, { id: data.id });

		if (row.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`404 Host could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		// Before anything is configured or a certificate is requested
		const isAdmin = access.hasRole?.("admin") || access.token.hasScope("admin");
		if (
			!isAdmin &&
			typeof data.advanced_config !== "undefined" &&
			data.advanced_config !== row.advanced_config
		) {
			throw new errs.PermissionError("You do not have permission to modify advanced configuration");
		}

		let newCertificateId = null;
		if (createCertificate) {
			// Check that nginx accepts the rest of the update before the certificate is requested
			await internalHost.checkProposedHost({
				model: deadHostModel,
				hostType: "dead_host",
				row: await internalDeadHost.get(access, { id: data.id, expand: ["owner", "certificate"] }),
				patch: internalHost.cleanSslHstsData(_.assign({}, { domain_names: row.domain_names }, data), row),
				skipDisabled: true,
			});

			const cert = await internalCertificate.createQuickCertificate(access, {
				domain_names: data.domain_names || row.domain_names,
				meta: _.assign({}, row.meta, data.meta),
			});

			// update host with cert id
			data.certificate_id = cert.id;
			newCertificateId = cert.id;
		}

		// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
		let thisData = _.assign(
			{},
			{
				domain_names: row.domain_names,
			},
			data,
		);

		thisData = internalHost.cleanSslHstsData(thisData, row);

		// do the row update and configure nginx, there's no need to add nginx config if host is disabled
		let thisRow;
		try {
			thisRow = await internalHost.updateAndConfigure({
				model: deadHostModel,
				hostType: "dead_host",
				id: data.id,
				patch: data,
				skipDisabled: true,
				fetch: () =>
					internalDeadHost.get(access, {
						id: thisData.id,
						expand: ["owner", "certificate"],
					}),
				audit: () =>
					internalAuditLog.add(access, {
						action: "updated",
						object_type: "dead-host",
						object_id: row.id,
						meta: thisData,
					}),
			});
		} catch (err) {
			if (newCertificateId) {
				await internalHost.discardUnusedCertificate(newCertificateId, () =>
					internalCertificate.delete(access, { id: newCertificateId }),
				);
			}
			throw err;
		}

		return _.omit(internalHost.cleanRowCertificateMeta(thisRow), omissions());
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const accessData = await access.can("dead_hosts:get", data.id);
		const query = deadHostModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", data.id)
			.allowGraph(deadHostModel.defaultAllowGraph)
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof data.expand !== "undefined" && data.expand !== null) {
			query.withGraphFetched(`[${data.expand.join(", ")}]`);
		}

		const row = await query.then(utils.omitRow(omissions()));
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		// Custom omissions
		if (typeof data.omit !== "undefined" && data.omit !== null) {
			return _.omit(row, data.omit);
		}
		return row;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("dead_hosts:delete", data.id);
		const row = await internalDeadHost.get(access, { id: data.id });
		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		await deadHostModel.query().where("id", row.id).patch({
			is_deleted: 1,
		});

		// Delete Nginx Config
		await internalNginx.removeConfigAndReload("dead_host", row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "dead-host",
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
	enable: async (access, data) => {
		await access.can("dead_hosts:update", data.id);
		// 404 and permission check before the lock is taken
		await internalDeadHost.get(access, { id: data.id });
		const row = await internalHost.setEnabledAndConfigure({
			model: deadHostModel,
			hostType: "dead_host",
			enable: true,
			fetch: () => internalDeadHost.get(access, { id: data.id, expand: ["certificate", "owner"] }),
			alreadyMessage: "Host is already enabled",
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "dead-host",
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
		await access.can("dead_hosts:update", data.id);
		await internalDeadHost.get(access, { id: data.id });
		const row = await internalHost.setEnabledAndConfigure({
			model: deadHostModel,
			hostType: "dead_host",
			enable: false,
			fetch: () => internalDeadHost.get(access, { id: data.id }),
			alreadyMessage: "Host is already disabled",
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "dead-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});
		return true;
	},

	/**
	 * All Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("dead_hosts:list");
		const query = deadHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph(deadHostModel.defaultAllowGraph)
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("domain_names"), "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
			internalHost.cleanAllRowsCertificateMeta(rows);
		}
		return rows;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility) => {
		const query = deadHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		const row = await query.first();
		return Number.parseInt(row.count, 10);
	},
};

export default internalDeadHost;
