import errs from "../lib/error.js";
import { asn as logger } from "../logger.js";
import accessListClientModel from "../models/access_list_client.js";
import proxyHostModel from "../models/proxy_host.js";
import internalIpRanges from "./ip_ranges.js";
import internalNginx from "./nginx.js";

const RIPE_ANNOUNCED_PREFIXES_URL = "https://stat.ripe.net/data/announced-prefixes/data.json?resource=";

const internalAsn = {
	interval_timeout: 1000 * 60 * 60 * 6, // 6 hours
	interval: null,
	interval_processing: false,

	regex: /^AS\d+$/i,

	initTimer: () => {
		logger.info("ASN Prefixes Renewal Timer initialized");
		internalAsn.interval = setInterval(internalAsn.refresh, internalAsn.interval_timeout);
	},

	/**
	 * Resolves the announced prefixes for an AS number via the RIPEstat API
	 *
	 * @param   {String}  address  eg "AS12345"
	 * @returns {Promise} resolving to an array of prefix strings
	 */
	resolvePrefixes: async (address) => {
		const asn = address.toUpperCase();
		logger.info(`Resolving announced prefixes for ${asn}`);

		let prefixes;
		try {
			const raw = await internalIpRanges.fetchUrl(`${RIPE_ANNOUNCED_PREFIXES_URL}${asn}`);
			prefixes = (JSON.parse(raw)?.data?.prefixes || []).map((item) => item.prefix);
		} catch (err) {
			throw new errs.ValidationError(`Could not resolve announced prefixes for ${asn}: ${err.message}`);
		}

		// Never accept an empty result: a deny rule that expands to nothing would fail open
		if (!prefixes.length) {
			throw new errs.ValidationError(`No announced prefixes found for ${asn}`);
		}
		return prefixes;
	},

	/**
	 * Triggered by a timer, this refreshes the cached prefixes of all ASN access
	 * rules and regenerates the configs of affected proxy hosts. Rules whose
	 * resolution fails keep their previously cached prefixes.
	 *
	 * @returns {Promise}
	 */
	refresh: async () => {
		if (internalAsn.interval_processing) {
			return;
		}
		internalAsn.interval_processing = true;

		try {
			const clients = await accessListClientModel.query().withGraphFetched("access_list");
			const asnClients = clients.filter(
				(client) => client.access_list && internalAsn.regex.test(client.address),
			);

			if (asnClients.length) {
				logger.info(`Refreshing announced prefixes for ${asnClients.length} ASN access rules...`);

				// Resolve each distinct ASN once
				const prefixesByAsn = {};
				for (const asn of new Set(asnClients.map((client) => client.address.toUpperCase()))) {
					try {
						prefixesByAsn[asn] = await internalAsn.resolvePrefixes(asn);
					} catch (err) {
						logger.error(`Keeping cached prefixes for ${asn}: ${err.message}`);
					}
				}

				const changedListIds = new Set();
				for (const client of asnClients) {
					const prefixes = prefixesByAsn[client.address.toUpperCase()];
					if (!prefixes) {
						continue;
					}
					if (JSON.stringify(prefixes) !== JSON.stringify(client.meta?.asn_prefixes || [])) {
						changedListIds.add(client.access_list_id);
					}
					await accessListClientModel
						.query()
						.where("id", client.id)
						.patch({
							meta: {
								...client.meta,
								asn_prefixes: prefixes,
								asn_fetched_on: new Date().toISOString(),
							},
						});
				}

				if (changedListIds.size) {
					const hosts = await proxyHostModel
						.query()
						.where("is_deleted", 0)
						.whereIn("access_list_id", Array.from(changedListIds))
						.withGraphFetched("[certificate,access_list.[clients,items]]");

					if (hosts.length) {
						logger.info(`ASN prefixes changed, regenerating ${hosts.length} proxy host configs`);
						await internalNginx.bulkGenerateConfigs("proxy_host", hosts);
						await internalNginx.reload();
					}
				}
			}
		} catch (err) {
			logger.error(`ASN prefix refresh failed: ${err.message}`);
		} finally {
			internalAsn.interval_processing = false;
		}
	},
};

export default internalAsn;
