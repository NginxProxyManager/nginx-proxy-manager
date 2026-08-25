import fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import proxyHostModel from "../models/proxy_host.js";
import streamModel from "../models/stream.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const listenerConfigPath = "/data/nginx/http3/listener.conf";
const listenerConfigTempPath = `${listenerConfigPath}.${process.pid}.tmp`;
const resourceLockName = "udp-443";

const isEnabled = (value) => value === true || value === 1;
const hasCertificate = (value) => value === "new" || Number(value) > 0;
const advancedConfigHasQuicListener = (config) => {
	const uncommentedConfig = String(config || "").replace(/#.*$/gm, "");
	return /(?:^|[;{}\r\n])\s*listen\s+[^;]*\bquic\b[^;]*;/i.test(uncommentedConfig);
};
const isManagedHttp3Host = (host) =>
	isEnabled(host.enabled) && isEnabled(host.http3_support) && hasCertificate(host.certificate_id);
const isManualHttp3Host = (host) => isEnabled(host.enabled) && advancedConfigHasQuicListener(host.advanced_config);
let listenerSyncQueue = Promise.resolve();

const syncListenerNow = async (ipv6) => {
	const hosts = await proxyHostModel
		.query()
		.select("id")
		.where("is_deleted", 0)
		.andWhere("enabled", 1)
		.andWhere("http3_support", 1)
		.whereNot("certificate_id", 0);

	const hasRenderedHttp3Host = hosts.some((host) => fs.existsSync(`/data/nginx/proxy_host/${host.id}.conf`));

	if (!hasRenderedHttp3Host) {
		if (fs.existsSync(listenerConfigPath)) {
			fs.unlinkSync(listenerConfigPath);
		}
		return false;
	}

	let template;
	try {
		template = fs.readFileSync(`${__dirname}/../templates/http3_listener.conf`, { encoding: "utf8" });
	} catch (err) {
		throw new errs.ConfigurationError(err.message);
	}

	const configText = await utils.getRenderEngine().parseAndRender(template, {
		ipv6,
		public_https_port: internalHttp3.publicHttpsPort(),
	});
	if (fs.existsSync(listenerConfigPath) && fs.readFileSync(listenerConfigPath, "utf8") === configText) {
		return true;
	}

	fs.mkdirSync(dirname(listenerConfigPath), { recursive: true });
	try {
		fs.writeFileSync(listenerConfigTempPath, configText, { encoding: "utf8" });
		fs.renameSync(listenerConfigTempPath, listenerConfigPath);
	} finally {
		if (fs.existsSync(listenerConfigTempPath)) {
			fs.unlinkSync(listenerConfigTempPath);
		}
	}
	return true;
};

const internalHttp3 = {
	/**
	 * @returns {number}
	 */
	publicHttpsPort: () => {
		const value = process.env.NPM_PUBLIC_HTTPS_PORT;
		if (typeof value === "string" && /^\d+$/.test(value)) {
			const port = Number.parseInt(value, 10);
			if (port >= 1 && port <= 65535) {
				return port;
			}
		}
		return 443;
	},

	/**
	 * Serializes the UDP/443 validation and mutation in every supported database.
	 * Incrementing a single row holds a write lock until the callback transaction commits.
	 *
	 * @param {Function} callback
	 * @returns {Promise<*>}
	 */
	withPort443Lock: async (callback) => {
		const knex = proxyHostModel.knex();
		return knex.transaction(async (trx) => {
			const updated = await trx("resource_lock").where("name", resourceLockName).increment("version", 1);
			if (!updated) {
				throw new errs.ConfigurationError("UDP port 443 resource lock is not initialized");
			}
			return callback(trx);
		});
	},

	/**
	 * Rejects a Proxy Host that would claim UDP/443 while an enabled UDP stream owns it.
	 *
	 * @param {Object} host
	 * @returns {Promise<void>}
	 */
	assertProxyHostCanUseHttp3: async (host, trx) => {
		const enabled = typeof host.enabled === "undefined" ? true : isEnabled(host.enabled);
		const managedHttp3 = enabled && isEnabled(host.http3_support) && hasCertificate(host.certificate_id);
		const manualHttp3 = enabled && advancedConfigHasQuicListener(host.advanced_config);
		if (!managedHttp3 && !manualHttp3) {
			return;
		}

		if (managedHttp3 && manualHttp3) {
			throw new errs.ValidationError(
				"Managed HTTP/3 cannot be combined with manual QUIC listen directives in Advanced configuration",
			);
		}

		const otherHosts = await proxyHostModel
			.query(trx)
			.select("id", "enabled", "certificate_id", "http3_support", "advanced_config")
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.modify((query) => {
				if (host.id) {
					query.whereNot("id", host.id);
				}
			});
		const otherManagedHttp3 = otherHosts.some(isManagedHttp3Host);
		const otherManualHttp3 = otherHosts.some(isManualHttp3Host);
		if ((managedHttp3 && otherManualHttp3) || (manualHttp3 && otherManagedHttp3)) {
			throw new errs.ValidationError(
				"Managed HTTP/3 cannot share UDP port 443 with manual QUIC listen directives on another Proxy Host",
			);
		}

		const claim = await trx("resource_lock").where("name", resourceLockName).first();
		if (!claim) {
			throw new errs.ConfigurationError("UDP port 443 resource lock is not initialized");
		}
		if (claim.mode === "udp_stream") {
			throw new errs.ValidationError(
				"HTTP/3 cannot use UDP port 443 while an enabled UDP stream is configured on that port",
			);
		}
		if (claim.mode !== "http3") {
			await trx("resource_lock").where("name", resourceLockName).update({ mode: "http3" });
		}
	},

	/**
	 * Rejects a stream that would claim UDP/443 while an enabled HTTP/3 Proxy Host owns it.
	 *
	 * @param {Object} stream
	 * @returns {Promise<void>}
	 */
	assertStreamCanUseUdp443: async (stream, trx) => {
		const enabled = typeof stream.enabled === "undefined" ? true : isEnabled(stream.enabled);
		if (!enabled || !isEnabled(stream.udp_forwarding) || Number(stream.incoming_port) !== 443) {
			return;
		}

		const proxyHosts = await proxyHostModel
			.query(trx)
			.select("enabled", "certificate_id", "http3_support", "advanced_config")
			.where("is_deleted", 0)
			.andWhere("enabled", 1);
		if (proxyHosts.some((host) => isManagedHttp3Host(host) || isManualHttp3Host(host))) {
			throw new errs.ValidationError(
				"UDP port 443 cannot be used by a stream while an enabled Proxy Host has HTTP/3 support",
			);
		}

		const claim = await trx("resource_lock").where("name", resourceLockName).first();
		if (!claim) {
			throw new errs.ConfigurationError("UDP port 443 resource lock is not initialized");
		}
		if (claim.mode === "http3") {
			throw new errs.ValidationError(
				"UDP port 443 cannot be used by a stream while an enabled Proxy Host has HTTP/3 support",
			);
		}
		if (claim.mode !== "udp_stream") {
			await trx("resource_lock").where("name", resourceLockName).update({ mode: "udp_stream" });
		}
	},

	/**
	 * Reconciles the persistent UDP/443 claim after Nginx configuration changes.
	 * Enabled records intentionally retain the claim even when their generated config is offline.
	 *
	 * @returns {Promise<string|null>}
	 */
	syncPort443Claim: () => {
		return internalHttp3.withPort443Lock(async (trx) => {
			const proxyHosts = await proxyHostModel
				.query(trx)
				.select("id", "enabled", "certificate_id", "http3_support", "advanced_config")
				.where("is_deleted", 0)
				.andWhere("enabled", 1);
			const http3Host = proxyHosts.find((host) => isManagedHttp3Host(host) || isManualHttp3Host(host));
			const udpStream = await streamModel
				.query(trx)
				.select("id")
				.where("is_deleted", 0)
				.andWhere("enabled", 1)
				.andWhere("incoming_port", 443)
				.andWhere("udp_forwarding", 1)
				.first();

			if (http3Host && udpStream) {
				throw new errs.ConfigurationError("HTTP/3 and a UDP stream both claim UDP port 443");
			}

			const mode = http3Host ? "http3" : udpStream ? "udp_stream" : null;
			await trx("resource_lock").where("name", resourceLockName).update({ mode });
			return mode;
		});
	},

	/**
	 * Keeps exactly one reuseport owner for all generated HTTP/3 virtual hosts.
	 * The listener is absent unless at least one effective HTTP/3 host config exists.
	 *
	 * @param {boolean} ipv6
	 * @returns {Promise<boolean>}
	 */
	syncListener: async (ipv6) => {
		const sync = async () => {
			const listenerEnabled = await syncListenerNow(ipv6);
			await internalHttp3.syncPort443Claim();
			return listenerEnabled;
		};
		const queuedSync = listenerSyncQueue.then(
			() => sync(),
			() => sync(),
		);
		listenerSyncQueue = queuedSync.catch(() => undefined);
		return queuedSync;
	},
};

export default internalHttp3;
