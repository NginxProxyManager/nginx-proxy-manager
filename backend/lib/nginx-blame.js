/**
 * Decides which host an `nginx -t` failure is blamed on while a host is being configured.
 *
 * A failure must never take another host offline because of the change being saved: one user could
 * otherwise disable another user's host, eg. with `include /data/nginx/proxy_host/2.conf;` or a duplicate
 * `listen ... default_server` (nginx reports that at the second definition, which can be the other host's
 * file) in their own advanced config.
 *
 * This module has no database imports so it can be unit tested.
 */

import { parseManagedFile } from "./nginx-errors.js";
import { scanNginxConfig } from "./nginx-tokenize.js";

/**
 * @param   {String} message  nginx error message
 * @returns {String[]} the absolute paths quoted in the message, eg. the log file of
 *                     `open() "/data/logs/proxy-host-5_access.log" failed (13: Permission denied)`
 */
// nginx quotes the path as it is, spaces included (a path written quoted in the config can have them)
const errorPaths = (message) => [...`${message || ""}`.matchAll(/"(\/[^"\n]+)"/g)].map((m) => m[1]);

/**
 * @param   {String} configText
 * @param   {String} path
 * @returns {boolean} true when the config (not counting comments) mentions the path. Read with nginx's own
 *          rules (lib/nginx-tokenize.js): `#` starts a comment only at the start of a token, so it is part of
 *          `/a/#old.pem` and of a quoted path, and quoted tokens are unescaped, as nginx prints them.
 */
const mentionsPath = (configText, path) =>
	scanNginxConfig(`${configText || ""}`).statements.some((statement) =>
		statement.tokens.some((token) => token.includes(path)),
	);

/**
 * Some errors (eg. `cannot load certificate "/etc/letsencrypt/live/npm-1/fullchain.pem"` or
 * `open() "/data/logs/proxy-host-5_access.log" failed (13: Permission denied)`) don't name the config file.
 * Such an error is blamed on the host being configured when its new config mentions a path named in the
 * error. Other hosts are never blamed here, see blameUnattributed().
 *
 * @param   {Object}   parsed      parsed nginx -t output
 * @param   {Object}   [own]       {file, text} of the host being configured
 * @returns {Object} parsed, with file set to own.file when the host being configured is to blame
 */
const attributeToHostFile = (parsed, own) => {
	if (parsed.file || !own?.file || !own.text) {
		return parsed;
	}
	const paths = errorPaths(parsed.message);
	if (paths.some((p) => mentionsPath(own.text, p))) {
		return Object.assign({}, parsed, { file: own.file });
	}
	return parsed;
};

/**
 * nginx named ANOTHER managed host's file while a host was being configured. That host is only repaired
 * or taken offline when its file also fails without the new config of the host being configured.
 *
 * @param   {Object}   parsed         parsed nginx -t output, naming another host's file
 * @param   {Function} testWithout    async () => {ok, parsed}, nginx -t without the new config of the host
 *                                    being configured
 * @returns {Promise<{action: "conflict"|"heal"|"global", parsed: Object, other?: Object}>}
 *          conflict: the change being saved is at fault (host level error of that host)
 *          heal:     `other` ({host_type, host_id}) is broken by itself, `parsed` is its failure
 *          global:   something else is broken, `parsed` is that failure
 */
const blameOtherHost = async (parsed, testWithout) => {
	const alone = await testWithout();
	if (alone.ok) {
		return { action: "conflict", parsed };
	}
	const other = parseManagedFile(alone.parsed.file);
	if (other) {
		return { action: "heal", parsed: alone.parsed, other };
	}
	return { action: "global", parsed: alone.parsed };
};

/**
 * An error that names no config file and isn't the fault of the host being configured (see
 * attributeToHostFile()), eg. another host's log file that nginx can't open.
 *
 * The candidates are the managed host files that mention a path quoted in the error, with any directive.
 * A mention alone is never enough (a user could otherwise point their own config at another host's log
 * file to get that host taken offline). A candidate is only blamed when
 * 1. nginx -t still fails without the new config of the host being configured (when there is one), and
 * 2. the error goes away when the candidate is taken out as well: the test passes, or the remaining
 *    error no longer names that path (another, unrelated host is broken too and is handled next).
 * When no single candidate passes, eg. a certificate several hosts share (the same
 * /etc/letsencrypt/live/npm-N/fullchain.pem in each of their files) went missing, all candidates are taken
 * out together. When that passes they are all blamed (`others`) and repaired or moved aside one by one.
 *
 * @param   {Object}   parsed                     parsed nginx -t output, without a file
 * @param   {Object}   opts
 * @param   {Object}   [opts.own]                 {file} of the host being configured, if any
 * @param   {Function} opts.listFiles             () => [{file, text}], the managed host config files
 * @param   {Function} [opts.testWithout]         async () => {ok, parsed}: nginx -t without own.file
 * @param   {Function} opts.testWithoutCandidate  async (file) => {ok, parsed}: nginx -t without own.file
 *                                                (if any) and without the candidate's file
 * @param   {Function} [opts.testWithoutCandidates]  async (files) => {ok, parsed}: nginx -t without own.file
 *                                                (if any) and without all of the files
 * @returns {Promise<{action: "conflict"|"heal"|"global", parsed: Object, other?: Object, others?: Object[]}>}
 *          see blameOtherHost(); for "heal", `others` lists every host to repair ({host_type, host_id, file}),
 *          `other` is the first of them
 */
const blameUnattributed = async (
	parsed,
	{ own, listFiles, testWithout, testWithoutCandidate, testWithoutCandidates },
) => {
	let failure = parsed;
	if (own?.file && testWithout) {
		const alone = await testWithout();
		if (alone.ok) {
			return { action: "conflict", parsed };
		}
		failure = alone.parsed;
		if (failure.file) {
			const other = parseManagedFile(failure.file);
			return other ? { action: "heal", parsed: failure, other } : { action: "global", parsed: failure };
		}
	}

	const paths = errorPaths(failure.message);
	if (!paths.length) {
		return { action: "global", parsed: failure };
	}

	const fixes = (result) => result.ok || !paths.some((p) => `${result.parsed?.message || ""}`.includes(p));
	const heal = (candidates) => ({
		action: "heal",
		parsed: Object.assign({}, failure, { file: candidates[0].file, line: null }),
		other: candidates[0].other,
		others: candidates.map(({ file, other }) => Object.assign({ file }, other)),
	});

	const candidates = [];
	for (const { file, text } of listFiles()) {
		if (file === own?.file) {
			continue;
		}
		const other = parseManagedFile(file);
		if (!other || !paths.some((p) => mentionsPath(text, p))) {
			continue;
		}
		candidates.push({ file, other });
		if (fixes(await testWithoutCandidate(file))) {
			return heal([{ file, other }]);
		}
	}
	// A path several hosts mention (a shared certificate): only all of them together make the error go away
	if (candidates.length > 1 && testWithoutCandidates) {
		if (fixes(await testWithoutCandidates(candidates.map((c) => c.file)))) {
			return heal(candidates);
		}
	}
	return { action: "global", parsed: failure };
};

/**
 * A nested configure (regenerating another host while a host is being saved, see healOtherHost() in
 * internal/nginx.js) failed. When the host being saved (the protected files) is part of the cause, the other
 * host must not be disabled: the save is a conflict instead. That is the case when
 * - the failure names a protected file, or
 * - the test passes with the protected files moved aside (eg. both hosts claim `listen ... default_server`,
 *   reported in either file, or the other host's regenerated config only fails together with the new one).
 *
 * @param   {Object}   opts
 * @param   {Object}   opts.parsed               parsed nginx -t output of the failure
 * @param   {String[]} opts.protect              config files of the host(s) being saved
 * @param   {boolean}  [opts.namesProtected]     the blame step already found a protected file at fault
 * @param   {Function} opts.testWithoutProtected async () => {ok}: nginx -t with the protected files moved aside
 * @returns {Promise<boolean>} true when the host being saved is (part of) the cause
 */
const causedByProtected = async ({ parsed, protect, namesProtected, testWithoutProtected }) => {
	if (!protect?.length) {
		return false;
	}
	if (namesProtected || (parsed?.file && protect.includes(parsed.file))) {
		return true;
	}
	return (await testWithoutProtected()).ok === true;
};

/**
 * Repairs another host whose config file fails by itself: an enabled host is regenerated from its database
 * row first (that also undoes tampering with its file); only when that fails (eg. still a host level error)
 * or the host can't be regenerated is it disabled.
 *
 * @param   {Object}   opts
 * @param   {boolean}  opts.enabled     the host's row exists and is enabled
 * @param   {boolean}  [opts.mayRegenerate]  false when the host was already regenerated in this operation or the
 *                                      repair budget is used up (see newRepair() in internal/nginx.js)
 * @param   {Function} opts.regenerate  async (): configure the host again, throws when that fails
 * @param   {Function} opts.disable     async (regenerateError?): move the file aside, mark the host offline
 * @param   {Function} [opts.isAbort]   (err) => boolean: a regenerate error that must not disable the host
 *                                      (the host being saved caused it, see causedByProtected()), rethrown
 * @returns {Promise<"regenerated"|"disabled">}
 */
const regenerateOrDisable = async ({ enabled, mayRegenerate = true, regenerate, disable, isAbort }) => {
	let regenerateError = null;
	if (enabled && mayRegenerate) {
		try {
			await regenerate();
			return "regenerated";
		} catch (err) {
			if (isAbort?.(err)) {
				throw err;
			}
			regenerateError = err;
		}
	}
	await disable(regenerateError);
	return "disabled";
};

/**
 * The test functions the blame helpers above get while a host is configured.
 *
 * In a nested configure (another host is regenerated while `protect`, the host being saved, keeps its new
 * config, see healOtherHost()) the protected files are moved aside in every blame test as well. Otherwise a
 * conflict between the saved host and a third host would look like that third host failing by itself, and
 * the third host would be disabled for the saved host's change.
 *
 * @param   {Object}   opts
 * @param   {String}   opts.own             config file of the host being configured
 * @param   {String[]} [opts.protect]       config files of the host(s) being saved (nested configure only)
 * @param   {Function} opts.testWithoutOwn  async () => {ok, parsed}: nginx -t without own
 * @param   {Function} opts.testAside       async (files) => {ok, parsed}: nginx -t without the files
 * @returns {{testWithout: Function, testWithoutCandidate: Function, testWithoutCandidates: Function}}
 */
const blameTests = ({ own, protect = [], testWithoutOwn, testAside }) => {
	const aside = [own, ...protect.filter((file) => file !== own)];
	return {
		testWithout: aside.length > 1 ? () => testAside(aside) : testWithoutOwn,
		testWithoutCandidate: (file) => testAside([...aside, file]),
		testWithoutCandidates: (files) => testAside([...aside, ...files]),
	};
};

export {
	attributeToHostFile,
	blameOtherHost,
	blameTests,
	blameUnattributed,
	causedByProtected,
	errorPaths,
	mentionsPath,
	regenerateOrDisable,
};
