/**
 * Directory sync.
 *
 * Signing in provisions one account at a time, which is fine but means an
 * administrator cannot hand out permissions to somebody who has never logged
 * in, and a group change only takes effect the next time they do.
 *
 * Sync walks a provider's directory on a schedule instead: it creates the
 * accounts it finds, refreshes their details and group driven roles, and
 * optionally disables the ones that have gone away.
 *
 * Only LDAP supports this. SAML and OAuth have no way to enumerate users.
 */

import { auth as logger } from "../../logger.js";
import authModel from "../../models/auth.js";
import userModel from "../../models/user.js";
import * as ldap from "./ldap.js";
import { resolveUser } from "./provision.js";

/** Runs in progress, keyed by provider id, so two never overlap */
const running = new Map();

/** The most recent result per provider, surfaced in the UI */
const lastResults = new Map();

/** Scheduled timers, keyed by provider id */
const timers = new Map();

const MIN_INTERVAL_MINUTES = 5;

/**
 * @param   {Object} provider
 * @returns {Boolean}
 */
const isSyncable = (provider) => provider.type === "ldap" && !!provider.meta?.sync_enabled;

/**
 * Disables accounts whose directory entry has disappeared.
 *
 * Only accounts belonging to this provider are considered, and only when the
 * run actually saw something. A directory that returns nothing because of a
 * misconfiguration must not disable an entire organisation.
 *
 * @param   {Object}   provider
 * @param   {[String]} seenIdentifiers
 * @returns {Promise<[Object]>} the users that were disabled
 */
const disableMissing = async (provider, seenIdentifiers) => {
	if (!seenIdentifiers.length) {
		logger.warn(
			`Sync for "${provider.name}" matched no directory entries, so nothing was disabled. Check the sync filter.`,
		);
		return [];
	}

	const links = await authModel
		.query()
		.where("provider_id", provider.id)
		.andWhere("is_deleted", 0)
		.whereNotIn("identifier", seenIdentifiers);

	const disabled = [];

	for (const link of links) {
		const user = await userModel
			.query()
			.where("id", link.user_id)
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			continue;
		}

		// Never lock out the last administrator over a directory hiccup
		if ((user.roles || []).includes("admin")) {
			const otherAdmins = await userModel
				.query()
				.where("is_deleted", 0)
				.andWhere("is_disabled", 0)
				.andWhere("id", "!=", user.id);

			const anotherAdminExists = otherAdmins.some((u) => (u.roles || []).includes("admin"));
			if (!anotherAdminExists) {
				logger.warn(
					`Not disabling ${user.email}: they are the only administrator left, despite being absent from "${provider.name}"`,
				);
				continue;
			}
		}

		await userModel.query().where("id", user.id).patch({ is_disabled: 1 });
		disabled.push({ id: user.id, email: user.email });
		logger.info(`Disabled ${user.email}: no longer present in "${provider.name}"`);
	}

	return disabled;
};

/**
 * Runs one sync pass over a provider's directory.
 *
 * @param   {Object} provider  a raw provider row, secrets included
 * @returns {Promise<Object>} a summary of what happened
 */
const runSync = async (provider) => {
	if (provider.type !== "ldap") {
		throw new Error(`Directory sync is only supported for LDAP providers, not ${provider.type}`);
	}

	if (running.has(provider.id)) {
		logger.debug(`Sync for "${provider.name}" is already running`);
		return running.get(provider.id);
	}

	const startedAt = new Date();
	const seenIdentifiers = [];
	let created = 0;
	let updated = 0;
	let failed = 0;

	const run = (async () => {
		logger.info(`Starting directory sync for "${provider.name}"`);

		const { seen, skipped } = await ldap.listDirectory(provider, async (identity) => {
			try {
				const before = await authModel
					.query()
					.where("provider_id", provider.id)
					.andWhere("identifier", identity.identifier)
					.andWhere("is_deleted", 0)
					.first();

				await resolveUser(provider, identity, { forceCreate: true });

				seenIdentifiers.push(identity.identifier);
				if (before) {
					updated++;
				} else {
					created++;
				}
			} catch (err) {
				failed++;
				logger.warn(`Sync could not provision ${identity.email}: ${err.message}`);
			}
		});

		let disabled = [];
		if (provider.meta?.sync_disable_missing) {
			disabled = await disableMissing(provider, seenIdentifiers);
		}

		const result = {
			provider_id: provider.id,
			started_on: startedAt.toISOString(),
			finished_on: new Date().toISOString(),
			entries: seen,
			created,
			updated,
			disabled: disabled.length,
			skipped,
			failed,
			ok: true,
		};

		logger.info(
			`Sync for "${provider.name}" finished: ${seen} entries, ${created} created, ${updated} updated, ` +
				`${disabled.length} disabled, ${skipped} skipped, ${failed} failed`,
		);

		return result;
	})();

	running.set(provider.id, run);

	try {
		const result = await run;
		lastResults.set(provider.id, result);
		return result;
	} catch (err) {
		const result = {
			provider_id: provider.id,
			started_on: startedAt.toISOString(),
			finished_on: new Date().toISOString(),
			ok: false,
			error: err.message,
		};
		lastResults.set(provider.id, result);
		logger.error(`Sync for "${provider.name}" failed: ${err.message}`);
		throw err;
	} finally {
		running.delete(provider.id);
	}
};

/**
 * @param   {Integer} providerId
 * @returns {Object|null}
 */
const getLastResult = (providerId) => lastResults.get(providerId) || null;

/**
 * @param   {Integer} providerId
 * @returns {Boolean}
 */
const isRunning = (providerId) => running.has(providerId);

/**
 * Stops the timer for one provider.
 *
 * @param {Integer} providerId
 */
const unschedule = (providerId) => {
	const timer = timers.get(providerId);
	if (timer) {
		clearInterval(timer);
		timers.delete(providerId);
	}
};

/**
 * Reconciles the running timers with the providers that currently want syncing.
 *
 * Called at boot and whenever a provider is created, changed or removed, so
 * the schedule never drifts from the configuration.
 *
 * @param   {[Object]} providers  every enabled provider, secrets included
 * @returns {Integer} how many are scheduled
 */
const reschedule = (providers) => {
	const wanted = providers.filter((p) => p.is_enabled && isSyncable(p));
	const wantedIds = new Set(wanted.map((p) => p.id));

	for (const id of [...timers.keys()]) {
		if (!wantedIds.has(id)) {
			unschedule(id);
		}
	}

	for (const provider of wanted) {
		// A tight loop against a directory helps nobody
		const minutes = Math.max(MIN_INTERVAL_MINUTES, provider.meta.sync_interval || 60);
		const intervalMs = minutes * 60 * 1000;

		unschedule(provider.id);

		const timer = setInterval(() => {
			runSync(provider).catch(() => {
				// runSync already logged and recorded the failure
			});
		}, intervalMs);

		// Don't hold the process open just for a sync timer
		timer.unref?.();
		timers.set(provider.id, timer);

		logger.info(`Directory sync scheduled for "${provider.name}" every ${minutes} minutes`);
	}

	return wanted.length;
};

/**
 * Cancels every scheduled sync. Used by tests.
 */
const stopAll = () => {
	for (const id of [...timers.keys()]) {
		unschedule(id);
	}
};

export { runSync, reschedule, unschedule, stopAll, getLastResult, isRunning, isSyncable, disableMissing };
