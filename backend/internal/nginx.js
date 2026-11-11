import dns from "node:dns";
import fs from "node:fs";
import net from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import _ from "lodash";
import errs from "../lib/error.js";
import {
	attributeToHostFile,
	blameOtherHost,
	blameTests,
	blameUnattributed,
	causedByProtected,
	errorPaths,
	mentionsPath,
	regenerateOrDisable,
} from "../lib/nginx-blame.js";
import {
	capitalise,
	humaniseNginxMessage,
	mayResolveLater,
	parseManagedFile,
	parseNginxTestOutput,
	sentence,
} from "../lib/nginx-errors.js";
import { createIncludeReader } from "../lib/nginx-includes.js";
import { createLock } from "../lib/nginx-lock.js";
import {
	assertLocationsRenderable,
	CONFIG_VERSION_MARKER,
	chooseLocationMode,
	describeConfigLine,
	isolateFaultyLocations,
	isVariableHost,
	locationDnsMarker,
	MESSAGES as LOCATION_MESSAGES,
	parseLocationPath,
	preflightLocation,
	prepareLocation,
	publicLocationState,
	readLocationTemplate,
	renderLocation,
} from "../lib/nginx-locations.js";
import { createReloadWaiter } from "../lib/nginx-reload.js";
import { assertAccessListRenderable, assertHostRenderable, isTokenSafe, unsafeValueError } from "../lib/nginx-values.js";
import { createModeResolver, toBool } from "../lib/upstream-dns.js";
import utils from "../lib/utils.js";
import { debug, nginx as logger } from "../logger.js";
import accessListModel from "../models/access_list.js";
import certificateModel from "../models/certificate.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Meta keys owned by the server. They are stripped from incoming data and only set by configure().
 */
const SERVER_META_KEYS = ["nginx_online", "nginx_err", "nginx_locations", "nginx_checked_at", "nginx_details"];

const HOST_MODELS = {
	proxy_host: proxyHostModel,
	redirection_host: redirectionHostModel,
	dead_host: deadHostModel,
	stream: streamModel,
};

const HOST_LABELS = {
	proxy_host: "Proxy host",
	redirection_host: "Redirection host",
	dead_host: "404 host",
	stream: "Stream",
};

// How often broken files of other hosts may be repaired / moved aside in one configure or reload. Each repair
// runs a nested configure (DNS lookups, several nginx -t) while holding the lock, which blocks every save.
// A group of hosts sharing a broken path (see blameUnattributed()) counts once.
const MAX_HEAL_ITERATIONS = 10;
// Subject of the conflict error of a host whose regenerated config conflicts, see buildConflictError()
const REGENERATED_SUBJECT = "The regenerated configuration";
const TOO_MANY_BROKEN_HOSTS = `Too many broken host configs to repair in one go (more than ${MAX_HEAL_ITERATIONS}). Regenerate all host configs (restart NPM or run backend/scripts/regenerate-config), then try again.`;
// Extra configure iterations on top of one per location
const EXTRA_CONFIGURE_ITERATIONS = 10;
// When the startup reconcile tries hosts again whose upstream names did not resolve yet
const RECONCILE_RETRY_DELAYS = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];

/**
 * Every sequence that writes nginx config, tests it and reloads nginx runs through this lock,
 * otherwise concurrent saves test and rename each other's files. Re-entrant: code that already
 * holds the lock runs directly. Timers started inside the lock must use runOutsideLock, see lib/nginx-lock.js.
 */
const { withLock: withRawLock, runOutsideLock, isHeld } = createLock();

/**
 * Set when a reload was signalled but not confirmed (see reloadNginx()): the master may still be reading the
 * config, or it rejected it. Files changed after that (candidates, rollbacks) may then be what nginx applies.
 */
let reloadInDoubt = false;

/**
 * Hosts whose config a certificate request has removed until the request is done ("<host type>#<id>" ->
 * how many requests hold it), see suspendHosts(). Their config file is missing on purpose: recreating it
 * (eg. the startup reconcile) would put the host back in front of the HTTP challenge server and the
 * challenge requests would go to the host's upstream.
 */
const suspendedHosts = new Map();
const suspendKey = (hostType, id) => `${hostType}#${id}`;

/**
 * Hosts taken offline whose removed config nginx still ran because it did not apply the removal (their
 * nginx_details have previous_config_running, see takeUnsafeHostOffline()): "<host type>#<id>". The next
 * reload nginx applies stops that config, and the flag is cleared then, see clearPreviousConfigRunning().
 */
const previousConfigRunning = new Set();

/**
 * Set when the extra reload of settleReload() was not confirmed either: nginx doesn't apply the config at all
 * (eg. a listen port in use, which nginx -t doesn't catch). Until a reload is confirmed again, an unconfirmed
 * reload is not settled, otherwise every later save would wait for nginx twice.
 */
let reloadFailing = false;

/**
 * At the end of a locked section, after a reload that was not confirmed: reloads once more, now that every
 * candidate file is gone and every rollback is done, so the files on disk are what nginx runs.
 * Never throws, the section's own result is what the caller gets.
 *
 * @returns {Promise}
 */
const settleReload = async () => {
	if (!reloadInDoubt) {
		return;
	}
	// Only one more attempt: when this one isn't confirmed either, nginx fails to apply the config (eg. a listen
	// port in use, which nginx -t doesn't catch), and every section would wait for it again. reloadFailing then
	// keeps the next sections from settling until a reload is confirmed again.
	reloadInDoubt = false;
	try {
		const result = await internalNginx.runTest();
		if (!result.ok) {
			logger.error(`nginx reload not confirmed and the config fails the test: ${result.parsed?.message}`);
			return;
		}
		logger.warn("nginx reload not confirmed, reloading again");
		const outcome = await internalNginx.reloadWaiter.reloadAndWait();
		if (outcome.confirmed) {
			reloadFailing = false;
		} else {
			reloadFailing = true;
			logger.error(
				`nginx did not confirm the reload either (${outcome.reason}). The running config may be older than the config files, see /data/logs/fallback_error.log`,
			);
		}
	} catch (err) {
		logger.error(`Could not reload nginx again: ${err.message}`);
	}
};

/**
 * withRawLock() that settles a reload in doubt before the lock is released, see settleReload()
 *
 * @param   {Function} fn
 * @returns {Promise}
 */
const withLock = (fn) => {
	if (isHeld()) {
		return fn();
	}
	return withRawLock(async () => {
		try {
			return await fn();
		} finally {
			await settleReload();
		}
	});
};

const readFileOrNull = (filename) => {
	try {
		return fs.readFileSync(filename, { encoding: "utf8" });
	} catch {
		return null;
	}
};

const addListen = (found, address, protocol) => {
	if (!found.has(address)) {
		found.set(address, new Set());
	}
	found.get(address).add(protocol);
};

/**
 * The addresses the `listen` directives of a config bind, as nginx writes them in a failed bind() message:
 * "0.0.0.0:3333", "[::]:3333", "127.0.0.1:80", each with the protocols it listens with there ("tcp", or
 * "udp" for `listen 53 udp;` and `listen 443 quic;`). nginx's bind() message doesn't name the protocol, so
 * a TCP and a UDP listen on the same port have the same address. Comments are ignored, so are unix sockets.
 * Values written as a host name ("localhost:3341") are added to `names` as [name, port, protocol], see
 * resolvedListenAddresses().
 *
 * @param   {String} text
 * @param   {Array}  [names]
 * @returns {Map<String, Set<String>>}
 */
const listenAddresses = (text, names = []) => {
	const found = new Map();
	const code = text.replace(/#[^\n]*/g, "");
	for (const [, value, params] of code.matchAll(/(?:^|[\s;{}])listen\s+([^\s;]+)([^;]*)/g)) {
		const protocol = /(?:^|\s)(?:udp|quic)(?=\s|$)/.test(params) ? "udp" : "tcp";
		let m = /^(?:\*:)?(\d+)$/.exec(value);
		if (m) {
			addListen(found, `0.0.0.0:${m[1]}`, protocol);
			continue;
		}
		m = /^\[([0-9a-fA-F:.]*)\](?::(\d+))?$/.exec(value);
		if (m) {
			addListen(found, `[${m[1]}]:${m[2] || 80}`, protocol);
			continue;
		}
		m = /^(\d+\.\d+\.\d+\.\d+)(?::(\d+))?$/.exec(value);
		if (m) {
			addListen(found, `${m[1]}:${m[2] || 80}`, protocol);
			continue;
		}
		m = /^([a-zA-Z0-9][a-zA-Z0-9.-]*)(?::(\d+))?$/.exec(value);
		if (m) {
			names.push([m[1], m[2] || "80", protocol]);
		}
	}
	return found;
};

const LISTEN_LOOKUP_TIMEOUT = 2000;

/**
 * listenAddresses(), with the listen values written as a host name resolved: nginx binds every address of
 * the name ("listen localhost:3341;" fails with "bind() to 127.0.0.1:3341 failed"). A name that doesn't
 * resolve in time adds nothing.
 *
 * @param   {String} text
 * @returns {Promise<Map<String, Set<String>>>}
 */
const resolvedListenAddresses = async (text) => {
	const names = [];
	const found = listenAddresses(text, names);
	for (const [name, port, protocol] of names) {
		let timer;
		const addresses = await Promise.race([
			dns.promises.lookup(name, { all: true }).catch(() => []),
			new Promise((resolve) => {
				timer = setTimeout(() => resolve([]), LISTEN_LOOKUP_TIMEOUT);
			}),
		]);
		clearTimeout(timer);
		for (const { address, family } of addresses) {
			addListen(found, family === 6 ? `[${address}]:${port}` : `${address}:${port}`, protocol);
		}
	}
	return found;
};

/**
 * @param   {Object|null} outcome  a rejected reload, see lib/nginx-reload.js
 * @returns {Map<String, String>} the addresses nginx could not bind, each with its bind() message
 */
const failedBinds = (outcome) => {
	const found = new Map();
	for (const message of [...(outcome?.bindErrors || []), outcome?.emerg || ""]) {
		const m = /^bind\(\) to (\S+) failed/.exec(message);
		if (m && !found.has(m[1])) {
			found.set(m[1], message);
		}
	}
	return found;
};

/**
 * @param   {Object|null} outcome  a rejected reload, see lib/nginx-reload.js
 * @returns {String|null} the file nginx names in its [emerg] message, eg. "/data/nginx/stream/3.conf" for
 *          "unknown directive \"x\" in /data/nginx/stream/3.conf:2"
 */
const rejectedFile = (outcome) => / in (\/\S+):\d+$/.exec(outcome?.emerg || "")?.[1] || null;

const hostLabel = (hostType, host) => {
	const label = HOST_LABELS[hostType] || hostType;
	const names =
		Array.isArray(host?.domain_names) && host.domain_names.length ? ` (${host.domain_names.join(", ")})` : "";
	return `${label} #${host?.id}${names}`;
};

// The parts of NginxConfigError.details the UI words the message from (the message itself stays English, for API
// users and logs): `detail` is the humanised nginx error, shown as it is; `hint_code` names the hint's rule. Null
// when nginx gave no message.
const describedError = (humanised) => ({
	detail: humanised?.text ? sentence(capitalise(humanised.text)) : null,
	hint_code: humanised?.hint ? humanised.code || null : null,
});

// The parts of an unsafe_value's details the UI words the message from: `field` names the value (eg.
// forward_host), `detail` is the value itself, quoted, shown as it is. A value without a field (not one of
// lib/nginx-values.js's checks) has the English message as `detail`.
const unsafeValueDetails = (err) =>
	err.unsafeField ? { field: err.unsafeField, detail: err.unsafeValue } : { field: null, detail: err.message };

const tooManyBrokenDetails = () => ({
	kind: "nginx_config",
	scope: "global",
	reason: "too_many_broken_hosts",
	max: MAX_HEAL_ITERATIONS,
	detail: null,
});

/**
 * @param   {String|null} [saved]  config file of the host the operation saves; null when no host is saved,
 *                                 eg. the startup / reload test, where every repaired host comes from its row
 * @returns {{tried: Set<String>, budget: Number, saved: String|null, absent: Set<String>,
 *          previous: Map<String, String>}} the repair state of one operation: the config files already
 *          regenerated, how many regenerations are left, the host being saved, the config files of other hosts
 *          that were not on disk before this operation wrote them and the text of the others before it did
 */
const newRepair = (saved = null) => ({
	tried: new Set(),
	budget: MAX_HEAL_ITERATIONS,
	saved,
	absent: new Set(),
	previous: new Map(),
});

/**
 * @param   {Object} repair    see newRepair()
 * @param   {String} filename  config file of the host being configured
 * @returns {String[]} the config files of other hosts that this operation regenerated
 */
const repairedFiles = (repair, filename) => [...repair.tried].filter((file) => file !== filename);

/**
 * @param   {Object} repair    see newRepair()
 * @param   {String} filename  config file of the host being configured
 * @returns {String[]} those of repairedFiles() whose file was not on disk before: nginx doesn't run them in any
 *          version, see isolateRejectedReload()
 */
const unservedRepairs = (repair, filename) => repairedFiles(repair, filename).filter((file) => repair.absent.has(file));

/**
 * @param   {Array<{host_type: String, host_id: Number}>} hosts
 * @param   {Object} [into]  {host_type: [ids]} to add them to
 * @returns {Object} {host_type: [ids]}, see reconcile()'s opts.only
 */
const retryList = (hosts, into = {}) => {
	for (const { host_type, host_id } of hosts) {
		into[host_type] = into[host_type] || [];
		if (!into[host_type].includes(host_id)) {
			into[host_type].push(host_id);
		}
	}
	return into;
};

/**
 * @param   {String} advancedConfig
 * @param   {String} message  nginx error message
 * @returns {boolean} true when the advanced config (not counting comments) uses the variable or a path the
 *          message names
 */
const mentionedInAdvanced = (advancedConfig, message) => {
	if (!advancedConfig || !message) {
		return false;
	}
	const variable = `${message}`.match(/unknown "([^"]+)" variable/);
	const names = variable ? [`$${variable[1]}`] : errorPaths(message);
	return names.some((name) => mentionsPath(advancedConfig, name));
};

/**
 * The lines of nginx output a user who can't see all hosts gets: warnings (and notices) only when they name the
 * error's own file, errors when they name that file or none. Warnings printed before an error can name other
 * hosts' config files and server names.
 *
 * @param   {String}       output  nginx_output of an error
 * @param   {String|null}  file    the file the error is about
 * @returns {String}
 */
const ownNginxOutput = (output, file) =>
	`${output}`
		.split("\n")
		.filter((line) => {
			const named = / in (\/\S+?):\d+\s*$/.exec(line)?.[1] || null;
			if (named) {
				return !!file && named === file;
			}
			return !/\[(warn|notice|info|debug)\]/.test(line);
		})
		.join("\n");

const internalNginx = {
	SERVER_META_KEYS,

	/**
	 * Runs fn while holding the nginx lock
	 *
	 * @param   {Function} fn
	 * @returns {Promise}
	 */
	withLock: withLock,

	/**
	 * Signals reloads and waits until nginx has applied them, see lib/nginx-reload.js
	 */
	reloadWaiter: createReloadWaiter({
		signal: () => utils.execFile("/usr/sbin/nginx", ["-s", "reload"]),
		errorLog: "/data/logs/fallback_error.log",
	}),

	/**
	 * Marks hosts as removed for a certificate request: reconcile() and bulkGenerateConfigs() leave their
	 * config missing until the returned function is called. Call it before the configs are removed.
	 *
	 * @param   {String}  hostType
	 * @param   {Array}   hosts
	 * @returns {Function} ends the suspension, may be called more than once
	 */
	suspendHosts: (hostType, hosts) => {
		const type = internalNginx.getFileFriendlyHostType(hostType);
		const keys = (hosts || []).filter((h) => h?.id).map((h) => suspendKey(type, h.id));
		for (const key of keys) {
			suspendedHosts.set(key, (suspendedHosts.get(key) || 0) + 1);
		}
		let released = false;
		return () => {
			if (released) {
				return;
			}
			released = true;
			for (const key of keys) {
				const count = (suspendedHosts.get(key) || 0) - 1;
				if (count > 0) {
					suspendedHosts.set(key, count);
				} else {
					suspendedHosts.delete(key);
				}
			}
		};
	},

	/**
	 * @param   {String}  hostType  file friendly host type
	 * @param   {Number}  id
	 * @returns {boolean} true while a certificate request has removed the host's config, see suspendHosts()
	 */
	isSuspended: (hostType, id) => suspendedHosts.has(suspendKey(hostType, id)),

	/**
	 * Removes the server-owned meta keys from incoming data, in place.
	 *
	 * @param   {Object} data
	 * @returns {Object} data
	 */
	stripServerMeta: (data) => {
		if (data?.meta && typeof data.meta === "object") {
			for (const key of SERVER_META_KEYS) {
				delete data.meta[key];
			}
		}
		return data;
	},

	/**
	 * @param   {Error}  err
	 * @returns {boolean} true when configure() did not apply the change: nginx rejected the host itself (or the
	 *                    global config), or the config could not be rendered. The previous config is still active.
	 */
	isHostLevelError: (err) =>
		(err instanceof errs.NginxConfigError && ["host", "global"].includes(err.details?.scope)) ||
		(err instanceof errs.ConfigurationError && err.configureFailed === true),

	/**
	 * Writes the config for a host, makes sure nginx accepts it and reloads nginx.
	 *
	 * - Custom locations that nginx rejects are quarantined (replaced by a 503 stub, or left out),
	 *   the rest of the host stays online. See meta.nginx_locations.
	 * - Broken config files of OTHER hosts are repaired or moved aside (.err) and that host is marked offline.
	 * - When this host's config is rejected outside of a custom location, the previous config is
	 *   restored and an NginxConfigError (scope "host" or "global") is thrown.
	 * - The same when `nginx -t` passes but nginx rejects the reload (eg. a listen port another process uses):
	 *   nginx is reloaded with the previous config, see rollbackRejectedReload().
	 *
	 * @param   {Object|String}  model
	 * @param   {String}         host_type
	 * @param   {Object}         host
	 * @param   {Object}         [opts]
	 * @param   {Boolean}        [opts.reload]  default true
	 * @param   {Boolean}        [opts.dryRun]  only check that nginx accepts the host: the previous config
	 *                                          files are put back and the meta is not written, see configureHost()
	 * @returns {Promise<Object>} the new meta
	 */
	configure: (model, host_type, host, opts = {}) => {
		return withLock(() =>
			internalNginx.configureHost(model, host_type, host, {
				reload: opts.reload !== false && opts.dryRun !== true,
				applyRepairs: opts.reload !== false,
				depth: 0,
				dryRun: opts.dryRun === true,
			}),
		);
	},

	/**
	 * configure() without the lock. Only call this while holding the lock.
	 *
	 * @param   {Object}   model
	 * @param   {String}   host_type
	 * @param   {Object}   host
	 * @param   {Object}   opts
	 * @param   {Boolean}  opts.reload
	 * @param   {Number}   opts.depth           nesting level of repairs of other hosts (for logging)
	 * @param   {Object}   [opts.repair]        repair state shared by the nested repairs of one operation, see
	 *                                          newRepair(); a new one is created when missing
	 * @param   {Function} [opts.modeResolver]  shared DNS cache, see lib/upstream-dns.js
	 * @param   {Boolean}  [opts.offlineOnError] mark the host offline instead of throwing on host level errors
	 * @param   {Boolean}  [opts.dryRun]  check only: on success the host's previous config files are put back and
	 *                                    nothing is written to the database. Other hosts may still be repaired.
	 * @param   {Boolean}  [opts.applyRepairs] when this host's config is not applied (it is rejected, or this is a
	 *                                    dry run) but other hosts were repaired: reload nginx, so it runs the
	 *                                    repaired files their status already describes, see applyRepairs()
	 * @returns {Promise<Object>}
	 */
	configureHost: async (model, host_type, host, opts) => {
		const hostType = internalNginx.getFileFriendlyHostType(host_type);
		const filename = internalNginx.getConfigName(hostType, host.id);
		const previous = readFileOrNull(filename);
		// A config kept aside for inspection survives a failed attempt
		const previousErr = readFileOrNull(`${filename}.err`);
		const modeResolver = opts.modeResolver || createModeResolver();

		let states = null;
		if (hostType === "proxy_host" && Array.isArray(host.locations) && host.locations.length) {
			states = await internalNginx.computeLocationStates(host.locations, modeResolver);
		}

		// Each location can be quarantined twice (stub, then omitted)
		const maxQuarantines = (host.locations?.length || 0) * 2 + EXTRA_CONFIGURE_ITERATIONS;
		let quarantines = 0;
		let heals = 0;
		// Without a repair state this is the top of the operation: the host being saved
		const repair = opts.repair || newRepair(filename);
		if (previous === null && filename !== repair.saved) {
			// Regenerated on behalf of another host: nginx can't run a config that was not on disk
			repair.absent.add(filename);
		} else if (filename !== repair.saved && !repair.previous.has(filename) && !repair.absent.has(filename)) {
			// the version nginx may run, see isolateRejectedReload()
			repair.previous.set(filename, previous);
		}
		let configText = "";
		let failure = null;

		// An error without a line (eg. `unknown "x" variable`) can still come from a custom location. Before the
		// whole host is rejected, the locations are stubbed one by one to find it, see isolateFaultyLocations().
		const isolateLocations = async (parsed) => {
			const candidates = (states || [])
				.filter((s) => s.status === "ok" || s.status === "unresolved")
				.map((s) => s.index);
			if (!candidates.length) {
				return null;
			}
			// In a nested configure the host being saved may cause it, causedByProtected() decides that below
			if (opts.protect?.length && (await internalNginx.testAside(opts.protect)).ok) {
				return null;
			}
			try {
				return await isolateFaultyLocations({
					candidates,
					parsed,
					testWithStubs: async (indexes) => {
						const stubbed = states.map((s) =>
							indexes.includes(s.index)
								? Object.assign({}, s, { status: "quarantined", mode: null, stub: true })
								: s,
						);
						// writes the host's file, see below
						const text = await internalNginx.generateConfig(hostType, host, { locationStates: stubbed, modeResolver });
						return internalNginx.runTest({ file: filename, text });
					},
				});
			} finally {
				// Put the config that failed back: when no location is to blame, the host is rejected or (bulk
				// mode) its file is kept as .err for inspection, which must not show the last stubbed variant
				fs.writeFileSync(filename, configText, { encoding: "utf8" });
			}
		};
		const quarantineFaulty = (indexes, parsed) => {
			for (const index of indexes) {
				internalNginx.quarantineLocation(states[index], host, parsed, modeResolver);
			}
			quarantines += indexes.length;
		};

		for (;;) {
			if (quarantines > maxQuarantines) {
				failure = { scope: "host", parsed: { file: filename, line: null, message: "", output: "" } };
				break;
			}

			try {
				configText = await internalNginx.generateConfig(hostType, host, { locationStates: states, modeResolver });
			} catch (err) {
				if (err.unsafeNginxValue && !opts.dryRun) {
					// A stored value that could add nginx directives (saved before the API refused such values, see
					// lib/nginx-values.js). Nothing was written for it, and the previous config is not put back:
					// it may hold the same value. The change is kept and the host is offline until it is fixed.
					return internalNginx.takeUnsafeHostOffline(model, hostType, host, filename, err, {
						reload: opts.reload || (opts.applyRepairs && heals > 0),
						repaired: repairedFiles(repair, filename),
						unserved: unservedRepairs(repair, filename),
						previous: repair.previous,
					});
				}
				await internalNginx.restoreHost(model, host, filename, previous, previousErr, heals > 0);
				if (opts.applyRepairs && heals > 0) {
					await internalNginx.applyRepairs(
						hostType,
						host,
						repairedFiles(repair, filename),
						unservedRepairs(repair, filename),
						repair.previous,
					);
				}
				const error =
					err instanceof errs.ConfigurationError ? err : new errs.ConfigurationError(err.message, err);
				// the change was not applied, see isHostLevelError()
				error.configureFailed = true;
				throw error;
			}

			const result = await internalNginx.runTest({ file: filename, text: configText });
			if (result.ok) {
				failure = null;
				break;
			}

			const parsed = result.parsed;
			if (parsed.file === filename) {
				const where = describeConfigLine(configText, parsed.line);
				if (
					states &&
					where.location_index !== null &&
					states[where.location_index] &&
					internalNginx.quarantineLocation(states[where.location_index], host, parsed, modeResolver)
				) {
					quarantines++;
					continue;
				}
				// the file but no line, eg. a log path of a location that can't be opened
				const faulty = where.location_index === null && !parsed.line ? await isolateLocations(parsed) : null;
				if (faulty) {
					quarantineFaulty(faulty, parsed);
					continue;
				}
				failure = { scope: "host", parsed };
				break;
			}

			let blame = null;
			const tests = blameTests({
				own: filename,
				protect: opts.protect,
				testWithoutOwn: () => internalNginx.testWithout(filename, configText),
				testAside: (files) => internalNginx.testAside(files),
			});
			if (parseManagedFile(parsed.file)) {
				// nginx names another host's file. That host is only repaired or taken offline when its file
				// fails on its own, without this host's new config: an error can show up in a file that is
				// fine by itself, eg. a duplicate `listen ... default_server` is reported at the second
				// definition, or this host's advanced config includes the other host's file.
				// In a nested configure the host being saved is taken out as well, see blameTests().
				blame = await blameOtherHost(parsed, tests.testWithout);
			} else if (!parsed.file) {
				// No file named, eg. another host's log file can't be opened. Only a host whose file mentions
				// the path AND whose removal makes the error go away is blamed, see lib/nginx-blame.js
				blame = await blameUnattributed(parsed, {
					own: { file: filename },
					listFiles: internalNginx.listManagedFiles,
					testWithout: tests.testWithout,
					testWithoutCandidate: tests.testWithoutCandidate,
					testWithoutCandidates: tests.testWithoutCandidates,
				});
			}
			if (blame) {
				if (blame.action === "conflict") {
					// fails only with this host's config: maybe one of its locations
					const faulty = !parsed.file ? await isolateLocations(parsed) : null;
					if (faulty) {
						quarantineFaulty(faulty, parsed);
						continue;
					}
					// No location is to blame. When the error stays with every other host's config moved aside, this
					// host's own config causes it (eg. its advanced config uses an unknown variable): a host level
					// error, not a conflict with another host
					if (!parsed.file && (await internalNginx.failsAlone(filename, parsed))) {
						failure = { scope: "host", parsed };
						break;
					}
					failure = { scope: "host", parsed, conflict: true };
					break;
				}
				const protect = opts.protect || [];
				const others = blame.action === "heal" ? blame.others || [blame.other] : [];
				if (
					others.some((other) =>
						protect.includes(internalNginx.getConfigName(other.host_type, other.host_id)),
					)
				) {
					// A nested configure (regenerating another host, see healOtherHost()) never touches the
					// host being saved: the host being saved is at fault, see the protect check below
					failure = { scope: "host", parsed: blame.parsed, namesProtected: true };
					break;
				}
				if (others.length && heals >= MAX_HEAL_ITERATIONS) {
					logger.error(`${hostLabel(hostType, host)}: ${TOO_MANY_BROKEN_HOSTS}`);
					failure = { scope: "global", tooMany: true, parsed: blame.parsed };
					break;
				}
				let healed = false;
				try {
					for (const other of others) {
						const otherParsed =
							others.length > 1
								? Object.assign({}, blame.parsed, {
										file: internalNginx.getConfigName(other.host_type, other.host_id),
									})
								: blame.parsed;
						if (
							await internalNginx.healOtherHost(
								other,
								otherParsed,
								opts.depth,
								[...protect, filename],
								repair,
							)
						) {
							healed = true;
						}
					}
				} catch (err) {
					if (!err.protectedConflict) {
						// Unexpected (eg. the other host's offline status could not be written): this host's candidate
						// config is on disk, also in a dry run. Put its previous files back first, so a later reload
						// can't apply a candidate whose configure failed.
						await internalNginx.restoreHost(model, host, filename, previous, previousErr, heals > 0);
						throw err;
					}
					if (filename !== repair.saved) {
						// This host is itself being regenerated and the conflict involves the host being saved, see
						// healOtherHost(): pass it on, this host is not at fault
						await internalNginx.restoreHost(model, host, filename, previous, previousErr, heals > 0);
						throw err;
					}
					// Regenerating the other host failed because of this host's new config: this change conflicts
					// with it. The other host keeps its file, nothing is disabled.
					failure = { scope: "host", parsed: err.parsed, conflict: true };
					break;
				}
				if (healed) {
					heals++;
					continue;
				}
				failure = { scope: "global", parsed: blame.parsed };
				break;
			}

			failure = { scope: "global", parsed };
			break;
		}

		if (
			failure &&
			opts.protect?.length &&
			(await causedByProtected({
				parsed: failure.parsed,
				protect: opts.protect,
				namesProtected: failure.namesProtected,
				testWithoutProtected: () => internalNginx.testAside(opts.protect),
			}))
		) {
			// A nested configure (regenerating this host while repairing on behalf of the hosts above it) failed
			// because of a host above it.
			// involvesSaved: the host being saved is part of the cause (the test passes with only its file moved
			// aside). That save must fail as a conflict, this host must not be disabled for it. Otherwise the
			// conflict is with hosts above it that are themselves regenerated from their database rows (any of
			// them, also in the startup / reload test, where no host is saved): this host, which was broken
			// already, is the one to take offline, see healOtherHost().
			const saved = repair.saved;
			const involvesSaved =
				!!saved &&
				opts.protect.includes(saved) &&
				(failure.parsed?.file === saved ||
					opts.protect.length === 1 ||
					(await internalNginx.testAside([saved])).ok === true);
			await internalNginx.restoreHost(model, host, filename, previous, previousErr, heals > 0);
			const abort = new Error(
				involvesSaved
					? `Regenerating ${hostLabel(hostType, host)} conflicts with the host being saved`
					: `The regenerated config of ${hostLabel(hostType, host)} conflicts with another regenerated host`,
			);
			abort.protectedConflict = true;
			abort.involvesSaved = involvesSaved;
			abort.parsed = failure.parsed;
			throw abort;
		}

		if (failure) {
			const error = failure.tooMany
				? new errs.NginxConfigError(TOO_MANY_BROKEN_HOSTS, tooManyBrokenDetails())
				: failure.conflict
					? internalNginx.buildConflictError(hostType, host, failure.parsed)
					: internalNginx.buildConfigError(failure.scope, hostType, host, failure.parsed, configText);
			if (opts.offlineOnError && failure.scope === "host") {
				// Bulk mode: don't fail the whole operation because of one host, take it offline instead
				internalNginx.renameConfigAsErrorSync(filename);
				const meta = internalNginx.buildOfflineMeta(host.meta, error, states);
				await model.query().where("id", host.id).patch({ meta });
				logger.warn(`${hostLabel(hostType, host)} is offline: ${error.message}`);
				return meta;
			}
			await internalNginx.restoreHost(model, host, filename, previous, previousErr, heals > 0);
			if (opts.applyRepairs && heals > 0) {
				await internalNginx.applyRepairs(
					hostType,
					host,
					repairedFiles(repair, filename),
					unservedRepairs(repair, filename),
					repair.previous,
				);
			}
			throw error;
		}

		const meta = _.assign({}, host.meta, {
			nginx_online: true,
			nginx_err: null,
			nginx_details: null,
			nginx_checked_at: new Date().toISOString(),
		});
		if (hostType === "proxy_host") {
			meta.nginx_locations = states ? states.map(publicLocationState) : [];
		}

		if (opts.dryRun) {
			internalNginx.restoreConfig(filename, previous);
			internalNginx.restoreConfig(`${filename}.err`, previousErr);
			if (opts.applyRepairs && heals > 0) {
				await internalNginx.applyRepairs(
					hostType,
					host,
					repairedFiles(repair, filename),
					unservedRepairs(repair, filename),
					repair.previous,
				);
			}
			return meta;
		}

		internalNginx.deleteFile(`${filename}.err`);

		if (opts.reload) {
			// The config was just tested while holding the lock, no need to test again. The meta is written once
			// nginx has not rejected the reload, so the host never shows online for a config nginx doesn't run.
			let outcome;
			try {
				outcome = await internalNginx.reloadNginx({ skipTest: true });
			} catch (err) {
				// nginx could not be reloaded at all (eg. it is not running): it doesn't run this config yet. The
				// config stays (nginx loads it when it starts), the host is offline with the reason and tried again
				// later, which brings it online once nginx applies it
				const error = internalNginx.buildConfigError(
					"global",
					hostType,
					host,
					{ message: `Could not reload nginx: ${err.message}`, file: null, line: null, output: err.message },
					configText,
				);
				await model
					.query()
					.where("id", host.id)
					.patch({ meta: internalNginx.buildOfflineMeta(meta, error) });
				internalNginx.scheduleRetry(retryList([{ host_type: hostType, host_id: host.id }]));
				throw err;
			}
			if (outcome?.rejected) {
				// nginx -t passed but the master rejected the files, eg. a listen port another process uses
				// (-t doesn't bind ports): put the previous config back and have nginx apply it
				await internalNginx.restoreHost(model, host, filename, previous, previousErr, heals > 0);
				throw await internalNginx.rollbackRejectedReload(hostType, host, outcome, configText);
			}
		}
		await model.query().where("id", host.id).patch({ meta });
		return meta;
	},

	/**
	 * A host has a stored value that can't be written into its config safely, see lib/nginx-values.js: removes
	 * its config files and marks it offline. With opts.reload nginx is reloaded, so it stops running the removed
	 * config. Never throws for the reload, the host's status is what the caller reports. Only call this while
	 * holding the lock.
	 *
	 * When nginx doesn't apply that reload (it rejects it for a reason that is not one of the repaired configs,
	 * see isolateRejectedReload()), it still runs the host's previous config: the host is offline all the same
	 * (its config is gone, the next reload nginx applies stops it), and its nginx_details say so
	 * (previous_config_running).
	 *
	 * @param   {Object}  model
	 * @param   {String}  hostType
	 * @param   {Object}  host
	 * @param   {String}  filename  the host's config file
	 * @param   {Error}   err       the error of generateConfig(), with err.unsafeNginxValue
	 * @param   {Object}  opts
	 * @param   {Boolean} opts.reload
	 * @param   {String[]} [opts.repaired]  config files of other hosts this operation regenerated, see
	 *                                     isolateRejectedReload()
	 * @param   {String[]} [opts.unserved]  those of opts.repaired whose file was not on disk before
	 * @param   {Map<String, String>} [opts.previous]  the text of the others before they were repaired
	 * @returns {Promise<Object>} the new meta
	 */
	takeUnsafeHostOffline: async (model, hostType, host, filename, err, opts) => {
		// nothing was written for it: this is the config nginx may run
		const hadConfig = readFileOrNull(filename) !== null;
		internalNginx.deleteFile(filename);
		internalNginx.deleteFile(`${filename}.err`);
		let notApplied = null;
		if (opts.reload) {
			try {
				const outcome = await internalNginx.reloadNginx();
				if (outcome?.rejected) {
					const isolated = await internalNginx.applyRejectedRepairs(
						outcome,
						opts.repaired,
						opts.unserved,
						opts.previous,
					);
					if (isolated.applied !== true) {
						notApplied = isolated.global || outcome;
					}
				}
			} catch (reloadErr) {
				notApplied = { reason: reloadErr.message };
			}
		}
		// nginx keeps running the removed config until a reload applies
		const stillRunning = !!notApplied && hadConfig;
		const meta = internalNginx.buildOfflineMeta(host.meta, {
			message: err.message,
			details: {
				kind: "unsafe_value",
				scope: "host",
				host_type: hostType,
				host_id: host.id,
				...unsafeValueDetails(err),
				...(stillRunning ? { previous_config_running: true } : {}),
			},
		});
		await model.query().where("id", host.id).patch({ meta });
		if (stillRunning) {
			previousConfigRunning.add(suspendKey(hostType, host.id));
		} else {
			previousConfigRunning.delete(suspendKey(hostType, host.id));
		}
		logger.error(`${hostLabel(hostType, host)} is offline: ${err.message}`);
		if (notApplied) {
			logger.error(
				`${hostLabel(hostType, host)}: nginx did not apply the removal of its config (${notApplied.emerg || notApplied.reason || "rejected"})${stillRunning ? " and still runs its previous config until a reload succeeds" : ""}`,
			);
		}
		return meta;
	},

	/**
	 * Other hosts were repaired (regenerated, or moved aside and marked offline) while configuring a host whose
	 * own config is then not applied: reloads nginx, so it runs the repaired files their status already
	 * describes. Tests first (the files on disk, with this host's previous config, were not tested together).
	 * Never throws, the caller's own result is what the user gets. Only call this while holding the lock.
	 *
	 * @param   {String}   hostType
	 * @param   {Object}   host
	 * @param   {String[]} [repaired]  the config files of the repaired hosts, see isolateRejectedReload()
	 * @param   {String[]} [unserved]  those of `repaired` whose file was not on disk before
	 * @param   {Map<String, String>} [previous]  the text of the others before they were repaired
	 * @returns {Promise}
	 */
	applyRepairs: async (hostType, host, repaired = [], unserved = [], previous = new Map()) => {
		try {
			const outcome = await internalNginx.reloadNginx();
			if (
				outcome?.rejected &&
				(await internalNginx.applyRejectedRepairs(outcome, repaired, unserved, previous)).applied !== true
			) {
				logger.error(
					`${hostLabel(hostType, host)}: nginx did not apply the repairs of other hosts and still runs its previous config`,
				);
			}
		} catch (err) {
			logger.error(`${hostLabel(hostType, host)}: could not apply the repairs of other hosts: ${err.message}`);
		}
	},

	/**
	 * nginx rejected the reload that should apply the configs of repaired hosts (see applyRepairs() and
	 * takeUnsafeHostOffline()): finds the configs it rejects, see isolateRejectedReload(). The repaired configs
	 * whose file was not on disk before (nginx doesn't run them) are, when nginx rejects the reload without them
	 * as well, set aside and their hosts marked offline with that reason, then tried again with the startup
	 * reconcile's backoff (see scheduleRetry()); the others stay on disk. Only call this while holding the lock.
	 *
	 * @param   {Object}   outcome     the rejected reload
	 * @param   {String[]} [repaired]
	 * @param   {String[]} [unserved]  those of `repaired` whose file was not on disk before
	 * @param   {Map<String, String>} [previous]  the text of the others before they were repaired
	 * @returns {Promise<Object>} see isolateRejectedReload()
	 */
	applyRejectedRepairs: async (outcome, repaired = [], unserved = [], previous = new Map()) => {
		const isolated = await internalNginx.isolateRejectedReload(repaired, {
			outcome,
			unserved,
			previous,
			offlineOnGlobal: true,
		});
		if (isolated.global && isolated.offline.length) {
			internalNginx.scheduleRetry(retryList(isolated.offline));
		}
		return isolated;
	},

	/**
	 * Tries hosts again later that are offline because nginx rejected a reload for a reason that was not their
	 * config (see isolateRejectedReload()): runs reconcile() for them with its backoff (RECONCILE_RETRY_DELAYS).
	 *
	 * @param   {Object}  only       {host_type: [ids]}
	 * @param   {Number}  [attempt]  the retry attempt this schedules, 1 for the first
	 */
	scheduleRetry: (only, attempt = 1) => {
		if (attempt > RECONCILE_RETRY_DELAYS.length || !Object.values(only).some((ids) => ids.length)) {
			return;
		}
		// Outside the lock context: the retry has to queue for the lock like any other caller
		runOutsideLock(() => {
			const timer = setTimeout(
				() => {
					internalNginx.reconcile({ only, attempt });
				},
				RECONCILE_RETRY_DELAYS[attempt - 1],
			);
			timer.unref?.();
		});
	},

	/**
	 * After nginx rejected the reload with a host's new config and the previous config files were put back:
	 * reloads once more, so nginx runs the files on disk again. Only call this while holding the lock.
	 *
	 * @param   {String}  hostType
	 * @param   {Object}  host
	 * @param   {Object}  outcome     the rejected reload, see lib/nginx-reload.js
	 * @param   {String}  configText  the host's rejected config
	 * @returns {Promise<errs.NginxConfigError>} the error to fail the save with: scope "host" when nginx applies
	 *          the previous config, scope "global" when it rejects that as well (the new config is not the cause)
	 */
	rollbackRejectedReload: async (hostType, host, outcome, configText) => {
		const again = await internalNginx.reloadNginx({ skipTest: true }).catch((err) => {
			logger.error(`${hostLabel(hostType, host)}: could not reload the previous config: ${err.message}`);
			return null;
		});
		const rejected = again?.rejected ? again : outcome;
		const parsed = {
			message: rejected.emerg || rejected.reason || null,
			file: null,
			line: null,
			output: rejected.reason || null,
		};
		if (again?.rejected) {
			logger.error(`${hostLabel(hostType, host)}: nginx rejects the previous config as well: ${again.reason}`);
			return internalNginx.buildConfigError("global", hostType, host, parsed, "");
		}
		logger.warn(`${hostLabel(hostType, host)}: nginx rejected the new config, the previous config is back`);
		return internalNginx.buildConfigError("host", hostType, host, parsed, configText);
	},

	/**
	 * nginx rejected a reload although `nginx -t` passed (eg. a `listen` on a port another process uses: -t
	 * doesn't bind ports), and the hosts of `filenames` already show online for configs written since the
	 * config nginx runs. Finds the configs nginx rejects and moves them aside (`.err`, so the next reconcile
	 * regenerates them), marking their hosts offline with the reason; nginx then applies the others.
	 *
	 * nginx keeps running its previous config while it rejects a reload, but every reload it applies runs only
	 * the files on disk. So only configs that are provably rejected are set aside while nginx may run the
	 * others: the configs that listen on an address nginx could not bind (its bind() messages name them) and
	 * the config file its [emerg] message names, then the ones the next rejected reload names, and so on. A
	 * config whose address nginx still can't bind without it goes back, it is not the cause.
	 *
	 * nginx's bind() message doesn't name the protocol: a TCP and a UDP stream on the same port (eg. DNS on 53)
	 * listen on the same address. When several configs listen on an address nginx could not bind, only the
	 * ones that may not hold its socket in nginx yet are suspects: configs of opts.unserved, and configs whose
	 * previous version (opts.previous) did not listen there with the same protocols (nginx keeps the sockets
	 * it holds across a reload, so such a config can't be the cause). When that leaves one, it is set aside;
	 * when it leaves several, they are set aside one at a time (unserved first) until nginx binds the
	 * address, then each but the last is put back again and stays when nginx applies it. Configs that hold
	 * the socket already are tried only when no suspect frees the address.
	 *
	 * When nginx still rejects the reload for another reason, only the configs of opts.unserved (configs
	 * nginx doesn't run, nor an older version of them: their file was not on disk before, eg. hosts the
	 * startup reconcile brings back) are set aside together and put back in halves (bisecting the halves nginx
	 * rejects) with a reload after each, so one rejected config among many costs a few reloads. All other
	 * configs stay in place in every reload: taking them out would take hosts out of service that nginx serves
	 * now. When nginx rejects the reload with the unserved configs aside as well, they are not the cause: with
	 * opts.offlineOnGlobal they stay aside and their hosts are marked offline with that reason (nginx doesn't
	 * run them), otherwise they are put back. The served configs then stay on disk and nginx keeps running its
	 * previous config. The same holds when a reload throws (nginx could not be reloaded at all) in any step: the
	 * configs of opts.unserved that are not offline yet are offline with the reload error (or put back), and the
	 * result is not applied, with that error as its global reason.
	 *
	 * Never throws. Only call this while holding the lock.
	 *
	 * @param   {String[]} filenames  managed config files written since the last reload nginx applied
	 * @param   {Object}   [opts]
	 * @param   {Object}   [opts.outcome]          the rejected reload, see lib/nginx-reload.js
	 * @param   {String[]} [opts.unserved]         those of `filenames` that nginx doesn't run in any version
	 * @param   {Map<String, String>} [opts.previous]  the text of each of `filenames` (the others) before this
	 *                                             operation wrote it, ie. the version nginx may run
	 * @param   {Boolean}  [opts.offlineOnGlobal]  for the configs of opts.unserved
	 * @returns {Promise<{applied: boolean, offline: Array<{host_type: String, host_id: Number}>,
	 *          global: Object|null}>} applied: nginx runs the config files on disk now; offline: the hosts
	 *          marked offline; global: the reload nginx still rejects, for a reason that is not one of the
	 *          configs set aside
	 */
	isolateRejectedReload: async (filenames, opts = {}) => {
		const result = { applied: false, offline: [], global: null };
		const entries = [...new Set(filenames)]
			.map((filename) => ({ filename, managed: parseManagedFile(filename), text: readFileOrNull(filename) }))
			.filter((entry) => entry.managed && HOST_MODELS[entry.managed.host_type] && entry.text !== null);
		if (!entries.length) {
			return result;
		}
		const unserved = new Set(opts.unserved || []);
		for (const entry of entries) {
			entry.addresses = await resolvedListenAddresses(entry.text);
			const previous = unserved.has(entry.filename) ? null : opts.previous?.get(entry.filename);
			entry.previousAddresses = typeof previous === "string" ? await resolvedListenAddresses(previous) : null;
		}
		// the error of the last reload that threw, see reloadFailure()
		let reloadError = null;
		const reload = () =>
			internalNginx.reloadNginx({ skipTest: true }).catch((err) => {
				logger.error(`Could not reload nginx: ${err.message}`);
				reloadError = err;
				return null;
			});
		const reloadFailure = () => ({ reason: `Could not reload nginx: ${reloadError?.message || "unknown error"}` });
		const putBack = (entry) => {
			internalNginx.restoreConfig(entry.filename, entry.text);
			internalNginx.deleteFile(`${entry.filename}.err`);
		};
		// the config file is aside (.err) already
		const takeOffline = async (entry, scope, outcome) => {
			result.offline.push(entry.managed);
			const { host_type: type, host_id: id } = entry.managed;
			const parsed = {
				message: outcome.emerg || outcome.reason || null,
				file: null,
				line: null,
				output: outcome.reason || null,
			};
			try {
				const row = await internalNginx.loadHostRow(type, id);
				const error = internalNginx.buildConfigError(scope, type, row || { id }, parsed, entry.text);
				if (row) {
					const meta = internalNginx.buildOfflineMeta(row.meta, error);
					await HOST_MODELS[type].query().where("id", id).patch({ meta });
				}
				logger.warn(`${hostLabel(type, row || { id })} is offline: ${error.message}`);
			} catch (err) {
				logger.error(`Could not mark ${hostLabel(type, { id })} offline: ${err.message}`);
			}
		};
		// A reload threw (nginx could not be reloaded at all, see reloadFailure()): nginx keeps running its previous
		// config, so it runs none of the configs of opts.unserved in `list`, whether they are on disk or aside now.
		// As when nginx rejects the reload without them, they are offline (aside, tried again later) with
		// opts.offlineOnGlobal, or back on disk. The served configs stay as they are, and the result is not applied.
		const abortUnserved = async (list) => {
			const failure = reloadFailure();
			for (const entry of list.filter((e) => unserved.has(e.filename))) {
				if (opts.offlineOnGlobal) {
					if (fs.existsSync(entry.filename)) {
						internalNginx.renameConfigAsErrorSync(entry.filename);
					}
					await takeOffline(entry, "global", failure);
				} else {
					putBack(entry);
				}
			}
			result.global = failure;
			return result;
		};

		// 1. the configs nginx names: the ones that listen on an address it could not bind, and the file its
		// [emerg] message names. They are set aside while the others stay in place.
		let remaining = entries;
		const rejectedAside = [];
		let last = opts.outcome || { rejected: true };
		const boundAddress = (entry, binds) => [...entry.addresses.keys()].find((a) => binds.has(a));
		const bindOutcome = (outcome, message) => ({
			...outcome,
			emerg: message,
			reason: `nginx could not apply the config: ${message}`,
		});
		// Can the config be the one nginx could not bind `address` for? Not when nginx holds the socket for it
		// already: its previous version listened there with the same protocols (nginx keeps the sockets it holds
		// across a reload). Unknown previous versions are suspects.
		const mayFailBind = (entry, address) => {
			if (unserved.has(entry.filename) || !entry.previousAddresses) {
				return true;
			}
			const before = entry.previousAddresses.get(address);
			return !before || [...entry.addresses.get(address)].some((protocol) => !before.has(protocol));
		};
		// Several configs listen on `address` (eg. a TCP and a UDP stream on one port): sets them aside one at a
		// time, in this order, until nginx binds it, then puts back each but the last again, one at a time: it
		// stays when nginx applies the reload with it (or rejects it for another reason). Returns the configs
		// that stay aside (none when nginx can't bind the address without any of them) and the outcome of the
		// last reload of the files now on disk (null when a reload threw: all are back then).
		const isolateShared = async (address, group) => {
			const aside = [];
			let outcome = null;
			for (const entry of group) {
				internalNginx.renameConfigAsErrorSync(entry.filename);
				aside.push(entry);
				outcome = await reload();
				if (!outcome || !failedBinds(outcome).has(address)) {
					break;
				}
			}
			if (!outcome || failedBinds(outcome).has(address)) {
				for (const entry of aside) {
					putBack(entry);
				}
				return { aside: [], outcome };
			}
			const kept = [...aside];
			for (const entry of aside.slice(0, -1)) {
				putBack(entry);
				const again = await reload();
				if (!again) {
					for (const other of kept) {
						putBack(other);
					}
					return { aside: [], outcome: null };
				}
				if (again.rejected && failedBinds(again).has(address)) {
					internalNginx.renameConfigAsErrorSync(entry.filename);
					continue;
				}
				kept.splice(kept.indexOf(entry), 1);
				outcome = again;
			}
			return { aside: kept, outcome };
		};
		const suspectOrder = (address, group) => {
			const rank = (entry) => (unserved.has(entry.filename) ? 0 : mayFailBind(entry, address) ? 1 : 2);
			return [...group].sort((a, b) => rank(a) - rank(b));
		};
		while (last?.rejected) {
			const binds = failedBinds(last);
			const file = rejectedFile(last);
			const named = remaining.filter((entry) => entry.filename === file);
			// an address several configs listen on, when nothing else is named
			let shared = null;
			for (const address of binds.keys()) {
				const group = remaining.filter((entry) => entry.addresses.has(address));
				if (!group.length || group.some((entry) => named.includes(entry))) {
					continue;
				}
				const suspects = group.length === 1 ? group : group.filter((entry) => mayFailBind(entry, address));
				if (suspects.length === 1) {
					named.push(suspects[0]);
				} else if (!shared) {
					shared = [address, suspectOrder(address, group)];
				}
			}
			if (!named.length && shared) {
				const [address, group] = shared;
				const { aside, outcome } = await isolateShared(address, group);
				for (const entry of aside) {
					entry.outcome = bindOutcome(last, binds.get(address));
				}
				remaining = remaining.filter((entry) => !aside.includes(entry));
				rejectedAside.push(...aside);
				last = outcome;
				if (!aside.length) {
					break;
				}
				continue;
			}
			if (!named.length) {
				break;
			}
			for (const entry of named) {
				internalNginx.renameConfigAsErrorSync(entry.filename);
				// the reason of this host: the bind() message of its own address, or the message naming its file
				const address = boundAddress(entry, binds);
				entry.outcome = address
					? bindOutcome(last, binds.get(address))
					: { ...last, reason: `nginx could not apply the config: ${last.emerg}` };
			}
			remaining = remaining.filter((entry) => !named.includes(entry));
			const next = await reload();
			// nginx still can't bind an address without the configs that listen on it: they are not the cause
			const still = next?.rejected ? failedBinds(next) : new Map();
			const back = next ? named.filter((entry) => boundAddress(entry, still)) : named;
			for (const entry of back) {
				putBack(entry);
			}
			remaining.push(...back);
			rejectedAside.push(...named.filter((entry) => !back.includes(entry)));
			last = next;
			if (back.length) {
				break;
			}
		}
		for (const entry of rejectedAside) {
			await takeOffline(entry, "host", entry.outcome);
		}
		if (!last) {
			// the configs not set aside for a reason nginx gave, see abortUnserved()
			return abortUnserved(remaining);
		}
		if (!last.rejected) {
			result.applied = true;
			return result;
		}
		// 2. the configs nginx doesn't run: set them aside together and put them back in halves. The served
		// configs stay in place.
		const candidates = remaining.filter((entry) => unserved.has(entry.filename));
		if (!candidates.length) {
			result.global = last;
			return result;
		}
		for (const entry of candidates) {
			internalNginx.renameConfigAsErrorSync(entry.filename);
		}
		const without = await reload();
		if (!without) {
			return abortUnserved(candidates);
		}
		if (without.rejected) {
			if (opts.offlineOnGlobal) {
				for (const entry of candidates) {
					await takeOffline(entry, "global", without);
				}
			} else {
				for (const entry of candidates) {
					putBack(entry);
				}
			}
			result.global = without;
			return result;
		}
		// Bisects: a group nginx applies stays, a group it rejects goes aside again (nginx keeps running the files
		// it applied before, which are on disk again then) and its halves are tried on their own. A reload that
		// is not rejected counts as applied, also when it is not confirmed (eg. a timeout): as everywhere else, see
		// lib/nginx-reload.js, which reports a rejection as soon as the error log shows one.
		const settled = new Set();
		let aborted = false;
		const tryGroup = async (group) => {
			if (aborted) {
				return;
			}
			for (const entry of group) {
				putBack(entry);
			}
			const outcome = await reload();
			if (!outcome) {
				// nginx could not be reloaded at all: the search stops, see below
				aborted = true;
				return;
			}
			if (!outcome.rejected) {
				for (const entry of group) {
					settled.add(entry);
				}
				return;
			}
			for (const entry of group) {
				internalNginx.renameConfigAsErrorSync(entry.filename);
			}
			if (group.length === 1) {
				settled.add(group[0]);
				await takeOffline(group[0], "host", outcome);
				return;
			}
			await splitGroup(group);
		};
		const splitGroup = async (group) => {
			const middle = Math.ceil(group.length / 2);
			await tryGroup(group.slice(0, middle));
			await tryGroup(group.slice(middle));
		};
		// all of them together were rejected already
		if (candidates.length === 1) {
			await tryGroup(candidates);
		} else {
			await splitGroup(candidates);
		}
		if (aborted) {
			// the configs not settled yet: the group of the reload that threw (on disk) and the groups not tried
			// yet (aside), see abortUnserved()
			return abortUnserved(candidates.filter((c) => !settled.has(c)));
		}
		result.applied = true;
		return result;
	},

	/**
	 * Runs `nginx -t` with the config file of the host being configured taken out, then puts it back.
	 * Only call this while holding the lock.
	 *
	 * @param   {String} filename    the config file of the host being configured
	 * @param   {String} configText  its new content
	 * @returns {Promise<{ok: boolean, parsed?: Object}>}
	 */
	testWithout: async (filename, configText) => {
		internalNginx.deleteFile(filename);
		try {
			return await internalNginx.runTest();
		} finally {
			try {
				fs.writeFileSync(filename, configText, { encoding: "utf8" });
			} catch (err) {
				logger.error(`Could not write ${filename} back: ${err.message}`);
			}
		}
	},

	/**
	 * Runs `nginx -t` with the given config files moved aside (to `<file>.npm-aside`, which nginx doesn't
	 * include), then puts them back. Only call this while holding the lock.
	 *
	 * @param   {String[]} filenames
	 * @returns {Promise<{ok: boolean, parsed?: Object}>}
	 */
	testAside: async (filenames) => {
		const moved = [];
		try {
			for (const filename of filenames) {
				if (fs.existsSync(filename)) {
					fs.renameSync(filename, `${filename}.npm-aside`);
					moved.push(filename);
				}
			}
			return await internalNginx.runTest();
		} finally {
			for (const filename of moved) {
				try {
					fs.renameSync(`${filename}.npm-aside`, filename);
				} catch (err) {
					logger.error(`Could not move ${filename} back: ${err.message}`);
				}
			}
		}
	},

	/**
	 * Runs `nginx -t` with the config files of all other managed hosts moved aside. Only call this while
	 * holding the lock.
	 *
	 * @param   {String} filename  the config file of the host being configured
	 * @param   {Object} parsed    the parsed error to look for
	 * @returns {Promise<boolean>} true when the same error remains: the host's own config causes it
	 */
	failsAlone: async (filename, parsed) => {
		const others = internalNginx
			.listManagedFiles()
			.map(({ file }) => file)
			.filter((file) => file !== filename);
		const result = await internalNginx.testAside(others);
		return !result.ok && result.parsed?.message === parsed.message;
	},

	/**
	 * nginx reported the error in another host's file, but that file passes without this host's new config:
	 * this change is at fault. The other host's file name is not passed on, the user may not be allowed to
	 * see that host.
	 *
	 * @param   {String}  hostType
	 * @param   {Object}  host
	 * @param   {Object}  parsed  parsed nginx -t output
	 * @param   {String}  [subject]  what conflicts, the start of the message
	 * @returns {errs.NginxConfigError}
	 */
	buildConflictError: (hostType, host, parsed, subject = "This change") => {
		const humanised = parsed.message
			? humaniseNginxMessage(parsed.message)
			: { text: "nginx rejected the configuration", hint: null };
		const output = `${parsed.output || ""}`.replace(
			/\/data\/nginx\/(proxy_host|redirection_host|dead_host|stream)\/\d+\.conf(:\d+)?/g,
			"<another host's config>",
		);
		return new errs.NginxConfigError(
			sentence(`${subject} conflicts with the configuration of another host: ${humanised.text}`),
			{
				kind: "nginx_config",
				scope: "host",
				host_type: hostType,
				host_id: host.id,
				file: internalNginx.getConfigName(hostType, host.id),
				line: null,
				location_index: null,
				location_path: null,
				nginx_output: output || null,
				hint:
					humanised.hint ||
					"Another host already uses this setting (for example the same listen port with default_server), or the advanced configuration includes another host's config file.",
				reason: subject === REGENERATED_SUBJECT ? "regenerated_conflict" : "conflict",
				detail: describedError(parsed.message ? humanised : null).detail,
				hint_code: humanised.hint ? humanised.code : "conflict",
			},
		);
	},

	/**
	 * Puts a host back the way it was before a configure attempt that did not apply: its config file,
	 * the .err file kept for inspection and, when other hosts were repaired during the attempt, its meta.
	 * Repairing another host runs a nested configure that can blame this host's new file and mark this host
	 * offline, although its previous config stays active.
	 *
	 * @param   {Object}       model
	 * @param   {Object}       host
	 * @param   {String}       filename
	 * @param   {String|null}  previous     previous content of the config file
	 * @param   {String|null}  previousErr  previous content of the .err file
	 * @param   {Boolean}      restoreMeta
	 * @returns {Promise}
	 */
	restoreHost: async (model, host, filename, previous, previousErr, restoreMeta) => {
		internalNginx.restoreConfig(filename, previous);
		internalNginx.restoreConfig(`${filename}.err`, previousErr);
		if (restoreMeta) {
			try {
				await model
					.query()
					.where("id", host.id)
					.patch({ meta: host.meta || {} });
			} catch (err) {
				logger.warn(`Could not restore the meta of the host of ${filename}: ${err.message}`);
			}
		}
	},

	/**
	 * @param   {Array}    locations
	 * @param   {Function} modeResolver
	 * @returns {Promise<Array>}
	 */
	computeLocationStates: (locations, modeResolver) => {
		// the files included by the advanced configs are read once per call
		const includes = createIncludeReader();
		return Promise.all(
			locations.map(async (raw, index) => {
				const loc = prepareLocation(raw);
				const state = { index, path: loc.path, status: "ok", mode: null, message: null, stub: true };
				const problem = preflightLocation(loc);
				if (problem) {
					return Object.assign(state, problem);
				}
				// A variable upstream (`$backend`) is resolved by nginx itself, there is nothing to look up
				const resolved = isVariableHost(loc.forward_host)
					? { mode: "static", status: "ok" }
					: await modeResolver(loc.forward_host);
				const result = chooseLocationMode(loc, resolved, includes);
				state.mode = result.mode;
				state.status = result.status;
				if (result.status === "unresolved") {
					state.message = LOCATION_MESSAGES.unresolved(loc.forward_host);
				}
				return state;
			}),
		);
	},

	/**
	 * Takes a location out of service after nginx rejected it.
	 *
	 * @param   {Object}   state
	 * @param   {Object}   host
	 * @param   {Object}   parsed        parsed nginx -t output
	 * @param   {Function} modeResolver
	 * @returns {boolean}  false when nothing more can be done for this location
	 */
	quarantineLocation: (state, host, parsed, modeResolver) => {
		const humanised = humaniseNginxMessage(parsed.message);

		// A static location whose host vanished between the DNS check and nginx -t:
		// switch to dynamic resolution instead of dropping it
		if (
			state.status === "ok" &&
			state.mode === "static" &&
			/host not found in upstream/.test(parsed.message) &&
			modeResolver.hasResolver &&
			modeResolver.dynamicEnabled
		) {
			const loc = prepareLocation(host.locations[state.index]);
			state.mode = "dynamic";
			state.status = "unresolved";
			state.message = LOCATION_MESSAGES.unresolved(loc.forward_host);
			return true;
		}

		if (state.status === "ok" || state.status === "unresolved") {
			state.status = "quarantined";
			state.mode = null;
			state.stub = true;
			state.message = LOCATION_MESSAGES.rejected(sentence(humanised.text));
			return true;
		}

		if (state.status === "quarantined" && state.stub) {
			state.stub = false;
			state.message = LOCATION_MESSAGES.omitted(sentence(humanised.text));
			return true;
		}

		return false;
	},

	/**
	 * Another host's config file breaks `nginx -t` by itself. An enabled host is first regenerated from its
	 * database row (without reload, with its own location quarantine): that repairs files written by older
	 * versions and files that were tampered with, eg. by a log directive of another host's advanced config
	 * writing into them. Only when the regenerated config still fails at host level (or the host is
	 * disabled / has no row) is the file moved to .err and the host marked offline.
	 *
	 * @param   {Object}   other      {host_type, host_id}
	 * @param   {Object}   parsed     parsed nginx -t output
	 * @param   {Number}   depth      nesting level of this repair
	 * @param   {String[]} [protect]  config files the regeneration must not repair or move aside (the host
	 *                                being saved)
	 * @param   {Object}   [repair]   the operation's repair state, see newRepair(): each host is regenerated at
	 *                                most once per operation and all levels share one budget
	 * @returns {Promise<boolean>} true when something was changed and the test should be repeated
	 */
	healOtherHost: async (other, parsed, depth, protect = [], repair = newRepair()) => {
		const model = HOST_MODELS[other.host_type];
		const filename = internalNginx.getConfigName(other.host_type, other.host_id);
		const fileText = readFileOrNull(filename);
		if (fileText === null) {
			return false;
		}

		let row = null;
		try {
			row = await model
				.query()
				.where("is_deleted", 0)
				.andWhere("id", other.host_id)
				.allowGraph(model.defaultAllowGraph)
				.withGraphFetched(`[${model.defaultExpand.join(", ")}]`)
				.first();
		} catch (err) {
			logger.warn(`Could not load ${other.host_type} #${other.host_id}: ${err.message}`);
		}

		// Every host gets one regeneration attempt per operation, also when it is found broken while another host
		// is being regenerated. The protect list keeps the recursion from coming back to a host above it.
		const mayRegenerate = !repair.tried.has(filename) && repair.budget > 0;
		if (row?.enabled && mayRegenerate) {
			repair.tried.add(filename);
			repair.budget--;
		}
		await regenerateOrDisable({
			enabled: !!row?.enabled,
			mayRegenerate,
			// The host being saved caused the failure: no disabling, configureHost() turns it into a conflict.
			// A conflict only with hosts above it that are themselves regenerated (their config comes from their
			// database rows) takes this host, which was broken already, offline instead, see configureHost().
			isAbort: (err) => err?.protectedConflict === true && err.involvesSaved === true,
			regenerate: async () => {
				const meta = await internalNginx.configureHost(model, other.host_type, row, {
					reload: false,
					depth: (depth || 0) + 1,
					protect,
					repair,
				});
				if (meta?.nginx_details?.kind === "unsafe_value") {
					// Its config was removed and it is marked offline, see takeUnsafeHostOffline()
					return;
				}
				logger.warn(
					`Regenerated the nginx config of ${hostLabel(other.host_type, row)} because nginx rejected it`,
				);
			},
			disable: async (regenerateError) => {
				if (regenerateError) {
					debug(logger, `Regenerating ${other.host_type} #${other.host_id} failed:`, regenerateError.message);
				}
				// The regenerated config's own failure explains best what is wrong with the host
				const regenerated =
					regenerateError instanceof errs.NginxConfigError && regenerateError.details?.scope === "host";
				let error;
				if (regenerateError?.unsafeNginxValue) {
					// A stored value that can't be written into its config, see lib/nginx-values.js
					error = new errs.NginxConfigError(regenerateError.message, {
						kind: "unsafe_value",
						scope: "other_host",
						host_type: other.host_type,
						host_id: other.host_id,
						...unsafeValueDetails(regenerateError),
					});
				} else if (regenerateError?.protectedConflict) {
					// Its regenerated config conflicts with the regenerated config of a host above it
					const conflict = internalNginx.buildConflictError(
						other.host_type,
						row || { id: other.host_id },
						regenerateError.parsed || parsed,
						REGENERATED_SUBJECT,
					);
					error = new errs.NginxConfigError(
						conflict.message,
						Object.assign({}, conflict.details, { scope: "other_host" }),
					);
				} else if (regenerated) {
					error = new errs.NginxConfigError(
						regenerateError.message,
						Object.assign({}, regenerateError.details, { scope: "other_host" }),
					);
				} else {
					error = internalNginx.buildConfigError(
						"other_host",
						other.host_type,
						row || { id: other.host_id },
						parsed,
						readFileOrNull(filename) || fileText,
					);
				}
				internalNginx.renameConfigAsErrorSync(filename);

				if (row) {
					const meta = internalNginx.buildOfflineMeta(row.meta, error, null, "Disabled automatically: ");
					await model.query().where("id", row.id).patch({ meta });
				}
				logger.warn(
					`Disabled the nginx config of ${hostLabel(other.host_type, row || { id: other.host_id })}: ${error.message}`,
				);
			},
		});
		return true;
	},

	/**
	 * @param   {Object}  oldMeta
	 * @param   {Error}   error   NginxConfigError
	 * @param   {Array}   [states]
	 * @param   {String}  [prefix]
	 * @returns {Object}
	 */
	buildOfflineMeta: (oldMeta, error, states, prefix = "") => {
		// The host's owner reads its meta and may not see other hosts: keep only the nginx output lines about
		// this error (warnings printed before it can name other hosts' files and domains)
		const details =
			error.details?.nginx_output
				? Object.assign({}, error.details, {
						nginx_output: ownNginxOutput(error.details.nginx_output, error.details.file) || null,
					})
				: error.details;
		const meta = _.assign({}, oldMeta, {
			nginx_online: false,
			nginx_err: `${prefix}${error.message}`,
			// the UI words the prefix itself
			nginx_details: prefix ? Object.assign({}, details, { auto_disabled: true }) : details,
			nginx_checked_at: new Date().toISOString(),
		});
		if (states) {
			meta.nginx_locations = states.map(publicLocationState);
		}
		return meta;
	},

	/**
	 * @param   {String}  scope       host | other_host | global
	 * @param   {String}  hostType
	 * @param   {Object}  host
	 * @param   {Object}  parsed      parsed nginx -t output
	 * @param   {String}  configText  the host's generated config, used to locate the error
	 * @returns {errs.NginxConfigError}
	 */
	buildConfigError: (scope, hostType, host, parsed, configText) => {
		const filename = internalNginx.getConfigName(hostType, host.id);
		const humanised = parsed.message
			? humaniseNginxMessage(parsed.message)
			: { text: "nginx kept rejecting the configuration", hint: null };
		const ownFile = parsed.file === filename;
		const where = ownFile ? describeConfigLine(configText, parsed.line) : { location_index: null, area: null };
		const location = where.location_index !== null ? host.locations?.[where.location_index] : null;
		const locationPath = location ? `${location.path || ""}`.trim() : null;

		let message;
		// where the UI says the error is, see the details below
		let area = scope === "global" ? null : where.area;
		if (scope === "global") {
			const managed = parseManagedFile(parsed.file);
			const fileInfo = parsed.file ? ` in ${parsed.file}${parsed.line ? ` (line ${parsed.line})` : ""}` : "";
			message = managed
				? `Nginx rejected ${hostLabel(managed.host_type, { id: managed.host_id })}: ${humanised.text}`
				: `Nginx configuration error${fileInfo}: ${humanised.text}`;
		} else if (where.area === "host_advanced") {
			message = `Advanced configuration: ${humanised.text} (line ${where.relative_line})`;
		} else if (where.area === "location_advanced") {
			message = `Custom location "${locationPath}" advanced configuration: ${humanised.text} (line ${where.relative_line})`;
		} else if (where.area === "location") {
			message = `Custom location "${locationPath}": ${humanised.text}`;
		} else if (!parsed.line && mentionedInAdvanced(host.advanced_config, parsed.message)) {
			// An error without a line (eg. an unknown variable) that names something the advanced config uses
			message = `Advanced configuration: ${humanised.text}`;
			area = "host_advanced";
		} else {
			message = capitalise(humanised.text);
		}

		const managed = scope === "global" ? parseManagedFile(parsed.file) : null;
		return new errs.NginxConfigError(sentence(message), {
			kind: "nginx_config",
			scope,
			host_type: managed ? managed.host_type : scope === "global" ? null : hostType,
			host_id: managed ? managed.host_id : scope === "global" ? null : host.id,
			file: parsed.file || null,
			line: parsed.line || null,
			location_index: location ? where.location_index : null,
			location_path: locationPath,
			nginx_output: parsed.output || null,
			hint: humanised.hint || null,
			area: area || null,
			relative_line: area && area === where.area ? where.relative_line : null,
			...describedError(parsed.message ? humanised : null),
		});
	},

	/**
	 * An NginxConfigError of scope "global" can name another host and include its nginx output. A user who
	 * can't see that host only gets a generic message. The same for a global error that names no host (a file
	 * NPM doesn't manage, eg. /data/nginx/custom/http.conf, or none): only users who can see all hosts get its
	 * details. For everyone else, nginx_output only keeps the lines about the error itself: warnings printed
	 * before it can name other hosts' files and domains. Never throws, redacts when in doubt.
	 *
	 * @param   {Object}  access  the request's Access object
	 * @param   {Error}   err
	 * @returns {Promise<Error>} err, modified in place
	 */
	redactConfigError: async (access, err) => {
		if (!(err instanceof errs.NginxConfigError) || !err.details) {
			return err;
		}
		const seesAll = internalNginx.canSeeAllHosts(access);
		if (seesAll) {
			return err;
		}
		const { host_type: hostType, host_id: hostId } = err.details;
		// too_many_broken_hosts is a fixed message without nginx output
		let visible = err.details.scope !== "global" || err.details.reason === "too_many_broken_hosts";
		if (!visible && hostId) {
			try {
				const permission = hostType === "stream" ? "streams" : `${hostType}s`;
				const accessData = await access.can(`${permission}:list`);
				if (
					accessData === true ||
					accessData?.permission_visibility === "all" ||
					accessData?.roles?.includes("admin")
				) {
					visible = true;
				} else if (HOST_MODELS[hostType]) {
					const row = await HOST_MODELS[hostType].query().where("id", hostId).first();
					// Proxy hosts can also be shared with a user explicitly, see permissions.meta.proxy_host_ids
					const permissions = access.getPermissions ? access.getPermissions() : {};
					const allowedIds =
						hostType === "proxy_host"
							? permissions?.meta?.proxy_host_ids || permissions?.meta?.proxyHostIds || []
							: [];
					visible =
						!!row &&
						(row.owner_user_id === access.token.getUserId(1) ||
							(!row.is_deleted && allowedIds.map(Number).includes(Number(row.id))));
				}
			} catch {
				visible = false;
			}
		}
		if (!visible) {
			err.message = "Nginx rejected the configuration of another host. Please ask an administrator to check it.";
			err.details = Object.assign({}, err.details, {
				host_type: null,
				host_id: null,
				file: null,
				line: null,
				location_index: null,
				location_path: null,
				nginx_output: null,
				hint: null,
				reason: "redacted",
				area: null,
				relative_line: null,
				detail: null,
				hint_code: null,
			});
		} else if (err.details.nginx_output) {
			err.details = Object.assign({}, err.details, {
				nginx_output: ownNginxOutput(err.details.nginx_output, err.details.file) || null,
			});
		}
		return err;
	},

	/**
	 * @param   {Object}  access  the request's Access object
	 * @returns {boolean} true for admins, and for users whose visibility is "all" and who may list every host
	 *                    type (eg. not a streams-only manager whose proxy hosts are hidden): they may see every
	 *                    host's nginx errors. Doesn't depend on a host row, never throws.
	 */
	canSeeAllHosts: (access) => {
		try {
			if (access?.isAdmin?.()) {
				return true;
			}
			const permissions = access?.getPermissions?.();
			return (
				permissions?.visibility === "all" &&
				["proxy_hosts", "redirection_hosts", "dead_hosts", "streams"].every((type) =>
					["view", "manage"].includes(permissions[type]),
				)
			);
		} catch {
			return false;
		}
	},

	/**
	 * @param   {Object} [own]       the host being configured
	 * @param   {String} [own.file]  its config file
	 * @param   {String} [own.text]  its new config
	 * @returns {Promise<{ok: boolean, parsed?: Object}>}
	 */
	runTest: async (own) => {
		try {
			await internalNginx.test();
			return { ok: true };
		} catch (err) {
			const output = err?.message || `${err}`;
			debug(logger, "Nginx test failed:", output);
			return { ok: false, parsed: internalNginx.attributeToHostFile(parseNginxTestOutput(output), own) };
		}
	},

	/**
	 * Blames an error that names no config file on the host being configured when its new config mentions
	 * a path named in the error, see lib/nginx-blame.js
	 *
	 * @param   {Object} parsed  parsed nginx -t output
	 * @param   {Object} [own]   {file, text} of the host being configured
	 * @returns {Object} parsed, with file set when the host being configured is to blame
	 */
	attributeToHostFile: (parsed, own) => attributeToHostFile(parsed, own),

	/**
	 * @returns {Array<{file: String, text: String}>} the managed host config files, in the order nginx and
	 *          prepare/55-nginx-validate.sh read them in
	 */
	listManagedFiles: () => {
		const out = [];
		for (const hostType of Object.keys(HOST_MODELS)) {
			const dir = `/data/nginx/${hostType}`;
			let files = [];
			try {
				files = fs
					.readdirSync(dir)
					.filter((f) => /^\d+\.conf$/.test(f))
					.sort();
			} catch {
				continue;
			}
			for (const file of files) {
				out.push({ file: `${dir}/${file}`, text: readFileOrNull(`${dir}/${file}`) || "" });
			}
		}
		return out;
	},

	/**
	 * Plain `nginx -t` of the whole configuration
	 *
	 * @returns {Promise}
	 */
	test: () => {
		debug(logger, "Testing Nginx configuration");
		return utils.execFile("/usr/sbin/nginx", ["-t", "-g", "error_log off;"]);
	},

	/**
	 * Tests the config, repairing or moving aside broken files of managed hosts.
	 * Throws an NginxConfigError (scope global) when the config can't be repaired.
	 * Only call this while holding the lock.
	 *
	 * @returns {Promise}
	 */
	testAndHeal: async () => {
		const repair = newRepair();
		for (let i = 0; i <= MAX_HEAL_ITERATIONS; i++) {
			const result = await internalNginx.runTest();
			if (result.ok) {
				return;
			}
			if (i === MAX_HEAL_ITERATIONS) {
				break;
			}
			const parsed = result.parsed;
			const named = parseManagedFile(parsed.file);
			let targets = named ? [{ other: named, parsed }] : [];
			if (!named && !parsed.file) {
				// eg. a log file that can't be opened: blame the host(s) whose removal makes the error go away
				const blame = await blameUnattributed(parsed, {
					listFiles: internalNginx.listManagedFiles,
					testWithoutCandidate: (file) => internalNginx.testAside([file]),
					testWithoutCandidates: (files) => internalNginx.testAside(files),
				});
				if (blame.action === "heal") {
					targets = (blame.others || [blame.other]).map((other) => ({
						other,
						parsed: Object.assign({}, blame.parsed, {
							file: internalNginx.getConfigName(other.host_type, other.host_id),
						}),
					}));
				}
			}
			let healed = false;
			for (const target of targets) {
				if (await internalNginx.healOtherHost(target.other, target.parsed, 0, [], repair)) {
					healed = true;
				}
			}
			if (healed) {
				continue;
			}
			throw internalNginx.buildConfigError("global", "default", { id: 0 }, result.parsed, "");
		}
		logger.error(TOO_MANY_BROKEN_HOSTS);
		throw new errs.NginxConfigError(TOO_MANY_BROKEN_HOSTS, tooManyBrokenDetails());
	},

	/**
	 * Only call this while holding the lock.
	 *
	 * @param   {Object}  [opts]
	 * @param   {Boolean} [opts.skipTest]
	 * @returns {Promise<Object>} the outcome of the reload, see lib/nginx-reload.js. `rejected` is set when the
	 *          master read the config files and rejected them: it still runs the config it ran before.
	 */
	reloadNginx: async (opts = {}) => {
		if (!opts.skipTest) {
			await internalNginx.testAndHeal();
		}
		logger.info("Reloading Nginx");
		// Waits until the master has applied the config: only then may the lock be released, see
		// lib/nginx-reload.js
		const outcome = await internalNginx.reloadWaiter.reloadAndWait();
		if (outcome.confirmed) {
			reloadInDoubt = false;
			reloadFailing = false;
			debug(logger, `nginx reload applied after ${outcome.waitedMs} ms`);
		} else if (outcome.noMaster) {
			debug(logger, `Could not confirm the nginx reload: ${outcome.reason}`);
		} else if (outcome.rejected) {
			// The master has read the files on disk and rejected them: nothing is in doubt, another reload of the
			// same files would fail the same way
			logger.error(`${outcome.reason}. The running config is older than the config files.`);
		} else if (reloadFailing) {
			logger.warn(`Could not confirm the nginx reload: ${outcome.reason}`);
		} else {
			reloadInDoubt = true;
			logger.warn(`Could not confirm the nginx reload: ${outcome.reason}`);
		}
		if (!outcome.rejected && previousConfigRunning.size) {
			await internalNginx.clearPreviousConfigRunning();
		}
		return outcome;
	},

	/**
	 * nginx applied a reload: it no longer runs the removed configs of the hosts in previousConfigRunning, so
	 * their nginx_details stop saying so. Never throws. Only call this while holding the lock.
	 *
	 * @returns {Promise}
	 */
	clearPreviousConfigRunning: async () => {
		const keys = [...previousConfigRunning];
		previousConfigRunning.clear();
		for (const key of keys) {
			const [type, id] = key.split("#");
			try {
				const row = await HOST_MODELS[type]?.query().where("id", Number(id)).first();
				if (!row?.meta?.nginx_details?.previous_config_running) {
					continue;
				}
				const { previous_config_running: _gone, ...details } = row.meta.nginx_details;
				await HOST_MODELS[type]
					.query()
					.where("id", row.id)
					.patch({ meta: _.assign({}, row.meta, { nginx_details: details }) });
			} catch (err) {
				logger.warn(`Could not update ${hostLabel(type, { id })}: ${err.message}`);
			}
		}
	},

	/**
	 * Tests (repairing broken files of other hosts) and reloads nginx
	 *
	 * @returns {Promise}
	 */
	reload: () => withLock(() => internalNginx.reloadNginx()),

	/**
	 * Removes the config of a host and reloads nginx.
	 *
	 * Removing a config can't make nginx reject a reload, but another file can (or the test fails and can't be
	 * healed): then nginx still serves the host. Its config goes back and the error is thrown (a rejected reload
	 * as rejectedReloadError()), so the caller can undo its delete or disable instead of reporting a removal
	 * nginx didn't apply. A host without a config (offline, only its .err file) isn't served: its removal stands
	 * whatever the reload does.
	 *
	 * @param   {String}  host_type
	 * @param   {Object}  host
	 * @returns {Promise} the reload outcome
	 */
	removeConfigAndReload: (host_type, host) =>
		withLock(async () => {
			const filename = internalNginx.getConfigName(internalNginx.getFileFriendlyHostType(host_type), host.id);
			const previous = internalNginx.readConfigFile(filename);
			await internalNginx.deleteConfig(host_type, host);
			let outcome;
			try {
				outcome = await internalNginx.reloadNginx();
			} catch (err) {
				if (previous === null) {
					logger.warn(`Removed ${hostLabel(host_type, host)}, but nginx could not reload: ${err.message}`);
					return { failed: true };
				}
				internalNginx.restoreConfig(filename, previous);
				throw err;
			}
			if (outcome?.rejected && previous !== null) {
				internalNginx.restoreConfig(filename, previous);
				throw internalNginx.rejectedReloadError(host_type, host, outcome);
			}
			return outcome;
		}),

	/**
	 * Regenerates the default site config and reloads nginx.
	 * On failure the default site config is removed, nginx falls back to the built-in default. When nginx
	 * rejects the reload for another file, the new config stays (it is not the cause) and a global
	 * NginxConfigError says that nginx still runs the previous default site.
	 *
	 * @param   {Object}  setting  the default-site setting row
	 * @returns {Promise}
	 */
	configureDefaultSite: (setting) =>
		withLock(async () => {
			let outcome;
			try {
				// Inside the try: a config that fails to render (or is written only in part) is removed again and
				// nginx reloaded, so it neither keeps the old default site nor breaks every later `nginx -t`
				await internalNginx.deleteConfig("default");
				await internalNginx.generateConfig("default", setting);
				outcome = await internalNginx.reloadNginx();
				if (outcome?.rejected && rejectedFile(outcome) === internalNginx.getConfigName("default")) {
					throw internalNginx.rejectedReloadError("default", { id: 0 }, outcome);
				}
			} catch (err) {
				await internalNginx.deleteConfig("default");
				await internalNginx.reloadNginx().catch((reloadErr) => {
					logger.error(`Could not reload nginx: ${reloadErr.message}`);
				});
				if (err instanceof errs.NginxConfigError) {
					throw new errs.NginxConfigError(
						`Could not reconfigure the default site. ${err.message}`,
						Object.assign({}, err.details, { context: "default_site" }),
						err,
					);
				}
				throw new errs.ValidationError("Could not reconfigure Nginx. Please check logs.", err);
			}
			if (outcome?.rejected) {
				// nginx -t passed (reloadNginx() tests first) and the master rejected the reload for another file,
				// eg. a host config nginx can't bind: the new default site is not the cause, it stays and applies
				// with the next reload nginx accepts. Until then nginx runs the previous default site.
				const error = internalNginx.rejectedReloadError("default", { id: 0 }, outcome);
				throw new errs.NginxConfigError(
					`Could not apply the default site. ${error.message} The new default site applies with the next reload nginx accepts.`,
					Object.assign({}, error.details, { context: "default_site" }),
				);
			}
		}),

	/**
	 * @param   {String}  hostType
	 * @param   {Object}  host
	 * @param   {Object}  outcome  a reload nginx rejected, see lib/nginx-reload.js
	 * @returns {errs.NginxConfigError} scope "global": the reload nginx rejected, with the file it names
	 */
	rejectedReloadError: (hostType, host, outcome) =>
		internalNginx.buildConfigError(
			"global",
			hostType,
			host,
			{
				message: outcome.emerg || outcome.reason || null,
				file: rejectedFile(outcome),
				line: null,
				output: outcome.reason || null,
			},
			"",
		),

	/**
	 * @param   {String}  filename
	 * @returns {String|null} the file's text, null when it doesn't exist
	 */
	readConfigFile: (filename) => readFileOrNull(filename),

	/**
	 * @param   {String}       filename
	 * @param   {String|null}  previous
	 */
	restoreConfig: (filename, previous) => {
		if (previous === null) {
			internalNginx.deleteFile(filename);
			return;
		}
		try {
			fs.writeFileSync(filename, previous, { encoding: "utf8" });
		} catch (err) {
			logger.error(`Could not restore ${filename}: ${err.message}`);
		}
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Integer} host_id
	 * @returns {String}
	 */
	getConfigName: (host_type, host_id) => {
		if (host_type === "default") {
			return "/data/nginx/default_host/site.conf";
		}
		return `/data/nginx/${internalNginx.getFileFriendlyHostType(host_type)}/${host_id}.conf`;
	},

	/**
	 * Generates custom locations
	 *
	 * @param   {Object}  host
	 * @param   {Array}   states  from computeLocationStates()
	 * @returns {Promise<String>}
	 */
	renderLocations: async (host, states) => {
		let template;
		try {
			template = readLocationTemplate();
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}

		const renderEngine = utils.getRenderEngine();
		// the files included by the advanced configs are read once per render
		const includes = createIncludeReader();
		let renderedLocations = "";

		for (let i = 0; i < host.locations.length; i++) {
			const state = states[i];
			const locationCopy = Object.assign(
				{},
				{ access_list_id: host.access_list_id },
				{ certificate_id: host.certificate_id },
				{ ssl_forced: host.ssl_forced },
				{ caching_enabled: host.caching_enabled },
				{ block_exploits: host.block_exploits },
				{ allow_websocket_upgrade: host.allow_websocket_upgrade },
				{ http2_support: host.http2_support },
				{ hsts_enabled: host.hsts_enabled },
				{ hsts_subdomains: host.hsts_subdomains },
				{ access_list: host.access_list },
				{ certificate: host.certificate },
				prepareLocation(host.locations[i]),
			);

			if (state.status === "ok" || state.status === "unresolved") {
				// A location with its own access list overrides the host's,
				// otherwise it inherits the host's access list
				let locationAccessList = null;
				if (locationCopy.access_list_id > 0 && locationCopy.access_list_id !== host.access_list?.id) {
					locationAccessList = await accessListModel
						.query()
						.where("is_deleted", 0)
						.andWhere("id", locationCopy.access_list_id)
						.withGraphFetched("[clients,items]")
						.first();
				}
				if (locationAccessList) {
					assertAccessListRenderable(`Proxy Host #${host.id} location ${locationCopy.path}`, locationAccessList);
					locationCopy.access_list = locationAccessList;
				} else if (locationCopy.access_list_id > 0 && locationCopy.access_list_id !== host.access_list?.id) {
					// The location names its own list but it's gone. Don't fall back to the
					// host's (possibly less restrictive) list; _access.conf denies all instead.
					logger.error(
						`Proxy Host #${host.id} location "${locationCopy.path}" references Access List #${locationCopy.access_list_id} which does not exist, all access will be denied`,
					);
					locationCopy.access_list = null;
				} else {
					locationCopy.access_list_id = host.access_list_id;
					locationCopy.access_list = host.access_list;
				}
			}

			renderedLocations += await renderLocation(renderEngine, template, locationCopy, { ...state, includes });
		}
		return renderedLocations;
	},

	/**
	 * Renders and writes the config file of a host.
	 *
	 * @param   {String}  host_type
	 * @param   {Object}  host_row
	 * @param   {Object}  [opts]
	 * @param   {Array}   [opts.locationStates]  from computeLocationStates(), computed when missing
	 * @param   {Function} [opts.modeResolver]   the DNS setting is recorded in the config, see locationDnsMarker()
	 * @returns {Promise<String>} the written config
	 */
	generateConfig: async (host_type, host_row, opts = {}) => {
		// Prevent modifying the original object:
		const host = JSON.parse(JSON.stringify(host_row));
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);

		await internalNginx.loadRenderRelations(nice_host_type, host);

		// Values are written into the config as-is; refuse any that could add directives. Locations are
		// checked as they are rendered (trimmed), see assertLocationsRenderable().
		assertHostRenderable(nice_host_type, nice_host_type === "proxy_host" ? { ...host, locations: [] } : host);
		if (nice_host_type === "proxy_host") {
			assertLocationsRenderable(`proxy host #${host.id}`, host.locations);
		}

		debug(logger, `Generating ${nice_host_type} Config:`, JSON.stringify(host, null, 2));

		const renderEngine = utils.getRenderEngine();
		const filename = internalNginx.getConfigName(nice_host_type, host.id);

		let template = null;
		try {
			template = fs.readFileSync(`${__dirname}/../templates/${nice_host_type}.conf`, { encoding: "utf8" });
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}

		// Manipulate the data a bit before sending it to the template
		if (nice_host_type !== "default") {
			host.use_default_location = true;
			if (typeof host.advanced_config !== "undefined" && host.advanced_config) {
				host.use_default_location = !internalNginx.advancedConfigHasDefaultLocation(host.advanced_config);
			}
		}

		// For redirection hosts, if the scheme is not http or https, set it to $scheme
		if (
			nice_host_type === "redirection_host" &&
			["http", "https"].indexOf(host.forward_scheme.toLowerCase()) === -1
		) {
			host.forward_scheme = "$scheme";
		}

		// A stream forwarding to an IPv6 literal must have the address wrapped in
		// square brackets before nginx appends ":<port>". Without the brackets nginx
		// reads the trailing ":<port>" as part of the address and rejects the upstream
		// ("invalid port in upstream"), so the stream saves but never activates (#5740).
		if (nice_host_type === "stream" && net.isIPv6(host.forwarding_host)) {
			host.forwarding_host = `[${host.forwarding_host}]`;
		}

		if (Array.isArray(host.locations) && host.locations.length) {
			const modeResolver = opts.modeResolver || createModeResolver();
			const states = opts.locationStates || (await internalNginx.computeLocationStates(host.locations, modeResolver));
			host.npm_location_dns = locationDnsMarker(modeResolver);

			// Allow someone who is using / custom location path to use it, and skip the default / location.
			// A location the user disabled doesn't count, the default location takes over.
			host.locations.forEach((location, index) => {
				if (parseLocationPath(location.path).normalised === "/" && states[index].status !== "disabled") {
					host.use_default_location = false;
				}
			});

			try {
				host.locations = await internalNginx.renderLocations(host, states);
			} catch (err) {
				debug(logger, `Could not render locations for ${filename}:`, err.message);
				if (err.unsafeNginxValue) {
					// Keep the flag, configureHost() handles these
					throw err;
				}
				throw new errs.ConfigurationError(err.message);
			}
		} else if (Array.isArray(host.locations)) {
			host.locations = "";
		}

		// Set the IPv6 setting for the host
		host.ipv6 = internalNginx.ipv6Enabled();

		let config_text;
		try {
			config_text = await renderEngine.parseAndRender(template, host);
			fs.writeFileSync(filename, config_text, { encoding: "utf8" });
		} catch (err) {
			debug(logger, `Could not write ${filename}:`, err.message);
			throw new errs.ConfigurationError(err.message);
		}
		debug(logger, "Wrote config:", filename, config_text);
		return config_text;
	},

	/**
	 * The templates rely on the certificate and access list relations being loaded.
	 * Not every caller fetches them (or fetches them fully), and when they're missing
	 * the config silently renders without SSL or without any access rules (#5919).
	 * Load anything that is referenced but not loaded onto the given host object.
	 *
	 * @param   {String}  host_type
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	loadRenderRelations: async (host_type, host) => {
		if (host.certificate_id > 0 && host.certificate?.id !== host.certificate_id) {
			const certificate = await certificateModel
				.query()
				.where("is_deleted", 0)
				.andWhere("id", host.certificate_id)
				.first();
			host.certificate = certificate ? JSON.parse(JSON.stringify(certificate)) : null;
		}

		if (host_type === "proxy_host" && host.access_list_id > 0) {
			if (
				host.access_list?.id !== host.access_list_id ||
				!Array.isArray(host.access_list.clients) ||
				!Array.isArray(host.access_list.items)
			) {
				const accessList = await accessListModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", host.access_list_id)
					.withGraphFetched("[clients,items]")
					.first();
				host.access_list = accessList ? JSON.parse(JSON.stringify(accessList)) : null;
			}

			if (!host.access_list) {
				// _access.conf renders "deny all" when the list is missing, so fail closed
				logger.error(
					`Proxy Host #${host.id} references Access List #${host.access_list_id} which does not exist, all access will be denied`,
				);
			} else if (!host.access_list.clients.length && !host.access_list.items.length) {
				logger.warn(
					`Proxy Host #${host.id} uses Access List #${host.access_list_id} which has no clients or authorizations, no access restrictions will apply`,
				);
			}
		}
	},

	/**
	 * This generates a temporary nginx config listening on port 80 for the domain names listed
	 * in the certificate setup. It allows the letsencrypt acme challenge to be requested by letsencrypt
	 * when requesting a certificate without having a hostname set up already.
	 *
	 * @param   {Object}  certificate
	 * @returns {Promise}
	 */
	generateLetsEncryptRequestConfig: (certificate) => {
		debug(logger, "Generating LetsEncrypt Request Config:", certificate);
		const renderEngine = utils.getRenderEngine();

		const unsafe = (certificate.domain_names || []).find((name) => !isTokenSafe(name));
		if (typeof unsafe !== "undefined") {
			return Promise.reject(
				unsafeValueError(
					`Certificate #${certificate.id}: domain name ${JSON.stringify(unsafe)} is not allowed`,
				),
			);
		}

		return new Promise((resolve, reject) => {
			let template = null;
			const filename = `/data/nginx/temp/letsencrypt_${certificate.id}.conf`;

			try {
				template = fs.readFileSync(`${__dirname}/../templates/letsencrypt-request.conf`, { encoding: "utf8" });
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			certificate.ipv6 = internalNginx.ipv6Enabled();

			renderEngine
				.parseAndRender(template, certificate)
				.then((config_text) => {
					fs.writeFileSync(filename, config_text, { encoding: "utf8" });
					debug(logger, "Wrote config:", filename, config_text);
					resolve(true);
				})
				.catch((err) => {
					debug(logger, `Could not write ${filename}:`, err.message);
					reject(new errs.ConfigurationError(err.message));
				});
		});
	},

	/**
	 * A simple wrapper around unlinkSync that writes to the logger
	 *
	 * @param   {String}  filename
	 */
	deleteFile: (filename) => {
		if (!fs.existsSync(filename)) {
			return;
		}
		try {
			debug(logger, `Deleting file: ${filename}`);
			fs.unlinkSync(filename);
		} catch (err) {
			debug(logger, "Could not delete file:", JSON.stringify(err, null, 2));
		}
	},

	/**
	 *
	 * @param   {String} host_type
	 * @returns String
	 */
	getFileFriendlyHostType: (host_type) => {
		return host_type.replace(/-/g, "_");
	},

	/**
	 * This removes the temporary nginx config file generated by `generateLetsEncryptRequestConfig`
	 *
	 * @param   {Object}  certificate
	 * @returns {Promise}
	 */
	deleteLetsEncryptRequestConfig: (certificate) => {
		const config_file = `/data/nginx/temp/letsencrypt_${certificate.id}.conf`;
		return new Promise((resolve /*, reject*/) => {
			internalNginx.deleteFile(config_file);
			resolve();
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @param   {Boolean} [delete_err_file]
	 * @returns {Promise}
	 */
	deleteConfig: (host_type, host, delete_err_file) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);
		const config_file_err = `${config_file}.err`;

		return new Promise((resolve /*, reject*/) => {
			internalNginx.deleteFile(config_file);
			if (delete_err_file) {
				internalNginx.deleteFile(config_file_err);
			}
			resolve();
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	renameConfigAsError: (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);
		return new Promise((resolve) => {
			internalNginx.renameConfigAsErrorSync(config_file);
			resolve();
		});
	},

	/**
	 * Moves a config to <file>.err, which nginx does not include, keeping it for inspection.
	 *
	 * @param   {String}  config_file
	 */
	renameConfigAsErrorSync: (config_file) => {
		const config_file_err = `${config_file}.err`;
		try {
			fs.rmSync(config_file_err, { force: true });
			if (fs.existsSync(config_file)) {
				fs.renameSync(config_file, config_file_err);
			}
		} catch (err) {
			logger.warn(`Could not move ${config_file} to ${config_file_err}: ${err.message}`);
			internalNginx.deleteFile(config_file);
		}
	},

	/**
	 * Regenerates the configs of several hosts (eg. after an access list or certificate change).
	 * Each host goes through configure without reloading, a host that nginx rejects is taken
	 * offline instead of failing the whole operation. The caller reloads nginx afterwards.
	 *
	 * @param   {String}  hostType
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkGenerateConfigs: (hostType, hosts) =>
		withLock(async () => {
			const type = internalNginx.getFileFriendlyHostType(hostType);
			const model = HOST_MODELS[type];
			const modeResolver = createModeResolver();
			for (const staleHost of hosts || []) {
				if (!staleHost?.id) {
					continue;
				}
				if (internalNginx.isSuspended(type, staleHost.id)) {
					// A certificate request has removed it, it is configured once the request is done
					continue;
				}
				// The rows were loaded before the lock was taken, sometimes minutes before (a certificate
				// request). Configure from the current row, or a concurrent edit (its locations, its meta)
				// would be overwritten with the old values.
				const host = await internalNginx.loadHostRow(type, staleHost.id);
				if (!host?.enabled) {
					continue;
				}
				await internalNginx.configureHost(model, type, host, {
					reload: false,
					depth: 0,
					modeResolver,
					offlineOnError: true,
				});
			}
		}),

	/**
	 * @param   {String}  hostType  file friendly host type
	 * @param   {Number}  id
	 * @returns {Promise<Object|undefined>} the non-deleted row with the relations the templates need
	 */
	loadHostRow: (hostType, id) => {
		const model = HOST_MODELS[hostType];
		return model
			.query()
			.where("is_deleted", 0)
			.andWhere("id", id)
			.allowGraph(model.defaultAllowGraph)
			.withGraphFetched(`[${model.defaultExpand.join(", ")}]`)
			.first();
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkDeleteConfigs: (host_type, hosts) => {
		const promises = [];
		hosts.map((host) => {
			promises.push(internalNginx.deleteConfig(host_type, host, true));
			return true;
		});

		return Promise.all(promises);
	},

	/**
	 * Called once after the backend started: regenerates hosts whose config is missing, was moved aside
	 * (by the prepare/55-nginx-validate.sh startup check or a failed test), or was written by an older
	 * version (literal custom location upstreams). Never throws. Hosts that a running certificate request
	 * has removed (see suspendHosts()) are skipped, the request puts them back.
	 *
	 * Upstream names often don't resolve yet right after a host reboot (all containers start at once).
	 * Hosts that end offline because of that, and proxy hosts with unresolved custom locations, are tried
	 * again a few times with backoff (RECONCILE_RETRY_DELAYS), so they come back on their own. Proxy hosts
	 * whose stored location status is still unresolved (eg. NPM restarted before a retry ran) are configured
	 * again at startup too.
	 *
	 * The regenerated configs pass `nginx -t`, but nginx can still reject the reload (eg. a stream's port is used
	 * by another process, -t doesn't bind ports). The hosts whose configs it rejects are then taken offline, see
	 * isolateRejectedReload(). nginx starts with the backend and serves the configs on disk, so only the
	 * regenerated configs that were not on disk before may be set aside while it looks for them. When it
	 * rejects the reload without those as well, they are offline and tried again like the hosts above; the
	 * hosts whose configs were on disk stay as they are (nginx keeps running their previous config).
	 *
	 * @param   {Object}  [opts]
	 * @param   {Object}  [opts.only]     {host_type: [ids]}, configure exactly these hosts (retry pass)
	 * @param   {Number}  [opts.attempt]  retry attempt, 0 for the startup pass
	 * @returns {Promise<Object>} summary
	 */
	reconcile: (opts = {}) =>
		withLock(async () => {
			const attempt = opts.attempt || 0;
			const summary = { checked: 0, regenerated: 0, offline: 0, failed: 0, suspended: 0, retry: {} };
			// the hosts saved as online, for a reload that nginx rejects
			const written = [];
			// those of them whose config was not on disk before: nginx doesn't run them
			const unserved = [];
			// the others' text before they were regenerated: the version nginx may run
			const previous = new Map();
			const modeResolver = createModeResolver();
			// config files put back from an interrupted test: nginx may not run them (eg. another process reloaded
			// it while they were aside), the reload below brings them in
			const restored = opts.only ? 0 : internalNginx.restoreStaleAside();

			for (const [hostType, model] of Object.entries(HOST_MODELS)) {
				const only = opts.only ? opts.only[hostType] : null;
				if (opts.only && !only?.length) {
					continue;
				}
				let rows = [];
				try {
					const query = model
						.query()
						.where("is_deleted", 0)
						.andWhere("enabled", 1)
						.allowGraph(model.defaultAllowGraph)
						.withGraphFetched(`[${model.defaultExpand.join(", ")}]`);
					if (only) {
						query.whereIn("id", only);
					}
					rows = await query;
				} catch (err) {
					logger.error(`Startup reconcile: could not load ${hostType} rows: ${err.message}`);
					continue;
				}

				for (const row of rows) {
					if (internalNginx.isSuspended(hostType, row.id)) {
						summary.suspended++;
						continue;
					}
					summary.checked++;
					const filename = internalNginx.getConfigName(hostType, row.id);
					const text = readFileOrNull(filename);
					const needsWork =
						!!only ||
						text === null ||
						fs.existsSync(`${filename}.err`) ||
						(hostType === "proxy_host" &&
							Array.isArray(row.locations) &&
							row.locations.length > 0 &&
							(text.indexOf(CONFIG_VERSION_MARKER) === -1 ||
								// written for another NPM_LOCATION_DYNAMIC_DNS / resolver setting
								text.indexOf(locationDnsMarker(modeResolver)) === -1 ||
								// The DNS retry timer only lives in memory: after a restart within its window
								// nobody would try these locations again and the status would stay unresolved
								(row.meta?.nginx_locations || []).some((state) => state?.status === "unresolved")));
					if (!needsWork) {
						continue;
					}
					try {
						const meta = await internalNginx.configureHost(model, hostType, row, {
							reload: false,
							depth: 0,
							modeResolver,
							offlineOnError: true,
						});
						if (meta.nginx_online === false) {
							summary.offline++;
						} else {
							summary.regenerated++;
							written.push(filename);
							if (text === null) {
								unserved.push(filename);
							} else {
								previous.set(filename, text);
							}
						}
						if (mayResolveLater(meta)) {
							summary.retry[hostType] = summary.retry[hostType] || [];
							summary.retry[hostType].push(row.id);
						}
					} catch (err) {
						summary.failed++;
						logger.error(`Startup reconcile: ${hostLabel(hostType, row)}: ${err.message}`);
					}
				}
			}

			if (summary.regenerated || summary.offline || restored) {
				try {
					const outcome = await internalNginx.reloadNginx();
					if (outcome?.rejected) {
						// `nginx -t` passed but nginx rejects the files, eg. a stream's port is used by another
						// process: take the hosts whose configs it rejects offline, so nginx applies the others
						// nginx serves the hosts whose config was on disk already (it starts with the backend,
						// and hosts are regenerated for other reasons too): only the others may be set aside
						// together while it bisects
						const isolated = await internalNginx.isolateRejectedReload(written, {
							outcome,
							unserved,
							previous,
							offlineOnGlobal: true,
						});
						summary.regenerated -= isolated.offline.length;
						summary.offline += isolated.offline.length;
						if (isolated.global) {
							// not caused by these hosts: try them again later
							retryList(isolated.offline, summary.retry);
						}
					}
				} catch (err) {
					logger.error(`Startup reconcile: nginx reload failed: ${err.message}`);
					// nginx may still run its previous config without the regenerated hosts: try them again later,
					// that reloads again
					retryList(written.map(parseManagedFile).filter(Boolean), summary.retry);
				}
			}
			const retries = Object.values(summary.retry).reduce((sum, ids) => sum + ids.length, 0);
			logger.info(
				`Startup reconcile${attempt ? ` (retry ${attempt})` : ""}: checked ${summary.checked} hosts, regenerated ${summary.regenerated}, offline ${summary.offline}, failed ${summary.failed}${summary.suspended ? `, ${summary.suspended} skipped for a certificate request` : ""}${retries ? `, ${retries} to try again` : ""}`,
			);

			if (retries) {
				internalNginx.scheduleRetry(summary.retry, attempt + 1);
			}
			return summary;
		}).catch((err) => {
			logger.error(`Startup reconcile failed: ${err.message}`);
			return null;
		}),

	/**
	 * testAside() moves config files to `<file>.npm-aside` for a moment. A backend killed right then leaves
	 * them there: put them back, or delete them when the config was written again since. Only call this
	 * while holding the lock.
	 *
	 * @returns {Number} how many files were put back (not counting the ones deleted)
	 */
	restoreStaleAside: () => {
		let restored = 0;
		for (const hostType of [...Object.keys(HOST_MODELS), "default_host"]) {
			const dir = `/data/nginx/${hostType}`;
			let files = [];
			try {
				files = fs.readdirSync(dir).filter((f) => f.endsWith(".conf.npm-aside"));
			} catch {
				continue;
			}
			for (const file of files) {
				const aside = `${dir}/${file}`;
				const conf = aside.slice(0, -".npm-aside".length);
				try {
					if (fs.existsSync(conf)) {
						fs.rmSync(aside, { force: true });
					} else {
						fs.renameSync(aside, conf);
						logger.warn(`Restored ${conf} from an interrupted config test`);
						restored++;
					}
				} catch (err) {
					logger.error(`Could not restore ${conf} from ${aside}: ${err.message}`);
				}
			}
		}
		return restored;
	},

	/**
	 * Called after the backend started instead of reconcile() when NPM_RECONCILE_ON_START is false: marks the
	 * enabled hosts offline whose config the prepare/55-nginx-validate.sh startup check moved aside (`.err`, no
	 * live config), so they don't show online for a config nginx doesn't run. Nothing is regenerated or
	 * reloaded. Never throws.
	 *
	 * @returns {Promise<Number|null>} how many hosts were marked offline
	 */
	markRejectedAtStartup: () =>
		withLock(async () => {
			let marked = 0;
			for (const [hostType, model] of Object.entries(HOST_MODELS)) {
				let rows = [];
				try {
					rows = await model.query().where("is_deleted", 0).andWhere("enabled", 1);
				} catch (err) {
					logger.error(`Startup check: could not load ${hostType} rows: ${err.message}`);
					continue;
				}
				for (const row of rows) {
					const filename = internalNginx.getConfigName(hostType, row.id);
					if (
						internalNginx.isSuspended(hostType, row.id) ||
						fs.existsSync(filename) ||
						!fs.existsSync(`${filename}.err`) ||
						// offline before the restart already: keep the specific reason (bind error, unsafe value, ...)
						row.meta?.nginx_online === false
					) {
						continue;
					}
					const error = new errs.NginxConfigError(
						"Nginx rejected this host's config when the container started. Save the host again to bring it back.",
						{
							kind: "nginx_config",
							scope: "host",
							reason: "rejected_at_startup",
							host_type: hostType,
							host_id: row.id,
							detail: null,
							hint_code: "rejected_at_startup",
						},
					);
					try {
						await model
							.query()
							.where("id", row.id)
							.patch({ meta: internalNginx.buildOfflineMeta(row.meta, error) });
						marked++;
					} catch (err) {
						logger.error(
							`Startup check: could not mark ${hostLabel(hostType, row)} offline: ${err.message}`,
						);
					}
				}
			}
			if (marked) {
				logger.warn(
					`Startup check: ${marked} hosts are offline, nginx rejected their config at startup (NPM_RECONCILE_ON_START is off)`,
				);
			}
			return marked;
		}).catch((err) => {
			logger.error(`Startup check failed: ${err.message}`);
			return null;
		}),

	/**
	 * @returns {boolean}
	 */
	reconcileOnStartEnabled: () => toBool(process.env.NPM_RECONCILE_ON_START, true),

	/**
	 * @param   {string}  config
	 * @returns {boolean}
	 */
	advancedConfigHasDefaultLocation: (cfg) => !!cfg.match(/^(?:.*;)?\s*?location\s*?\/\s*?{/im),

	/**
	 * @returns {boolean}
	 */
	ipv6Enabled: () => {
		if (typeof process.env.DISABLE_IPV6 !== "undefined") {
			const disabled = process.env.DISABLE_IPV6.toLowerCase();
			return !(disabled === "on" || disabled === "true" || disabled === "1" || disabled === "yes");
		}

		return true;
	},
};

export default internalNginx;
