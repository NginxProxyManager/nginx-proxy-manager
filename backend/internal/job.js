import internalCertificate from "./certificate.js";
import internalWebhook from "./webhook.js";
import jobModel from "../models/job.js";
import now from "../models/now_helper.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";

const jobQueue = [];
let jobProcessing = false;

const omissions = () => [];

const processQueue = async () => {
	if (jobProcessing || !jobQueue.length) {
		return;
	}
	jobProcessing = true;
	const { jobId, access, handler, onFail } = jobQueue.shift();
	try {
		await jobModel.query().patchAndFetchById(jobId, { status: "running" });
		const result = await handler();
		await jobModel.query().patchAndFetchById(jobId, {
			status: "completed",
			result,
			finished_on: now(),
		});
	} catch (err) {
		await jobModel.query().patchAndFetchById(jobId, {
			status: "failed",
			error: err.message,
			finished_on: now(),
		});
		if (typeof onFail === "function") {
			try {
				await onFail(err);
			} catch {
				// ignore webhook errors
			}
		}
	} finally {
		jobProcessing = false;
		setImmediate(processQueue);
	}
};

const internalJob = {
	enqueue: async (access, type, payload, handler, onFail) => {
		const row = await jobModel.query().insertAndFetch({
			owner_user_id: access.token.getUserId(1),
			type,
			status: "pending",
			payload,
		});

		jobQueue.push({ jobId: row.id, access, handler, onFail });
		setImmediate(processQueue);

		return utils.omitRow(omissions())(row);
	},

	getAll: async (access, data = {}) => {
		const query = jobModel.query().orderBy("id", "DESC").limit(data.limit || 50);

		if (!access.isAdmin()) {
			query.where("owner_user_id", access.token.getUserId(1));
		}

		return query.then(utils.omitRows(omissions()));
	},

	get: async (access, data) => {
		const row = await jobModel.query().where("id", data.id).first();
		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.owner_user_id !== access.token.getUserId(1) && !access.isAdmin()) {
			throw new errs.PermissionError("Permission Denied");
		}
		return utils.omitRow(omissions())(row);
	},

	runCertificateCreate: (access, payload) => {
		return internalJob.enqueue(
			access,
			"certificate.create",
			payload,
			() => internalCertificate.create(access, payload),
			async (err) => {
				void internalWebhook.dispatch("certificate.failed", {
					error: err.message,
					domain_names: payload.domain_names,
				});
			},
		);
	},

	runCertificateRenew: (access, payload) => {
		const certId = payload.id;
		return internalJob.enqueue(
			access,
			"certificate.renew",
			payload,
			() => internalCertificate.renew(access, payload),
			async (err) => {
				void internalWebhook.dispatch("certificate.failed", {
					id: certId,
					error: err.message,
				});
			},
		);
	},
};

export default internalJob;
