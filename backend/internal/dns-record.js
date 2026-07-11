import _ from "lodash";
import { dnsRecord as logger } from "../logger.js";
import dnsProviderModel from "../models/dns_provider.js";
import { getDriver } from "./dns/index.js";

/**
 * @param {string[]} desired
 * @param {Array<{domain:string,zone_id:string,rrset_id:string}>} existingRecords
 */
export const diffDomains = (desired, existingRecords) => {
	const existingByDomain = _.keyBy(existingRecords || [], "domain");
	const desiredSet = new Set(desired || []);
	const toCreate = (desired || []).filter((d) => !existingByDomain[d]);
	const toDelete = (existingRecords || []).filter((r) => !desiredSet.has(r.domain));
	return { toCreate, toDelete };
};

const loadProvider = async (providerId) => dnsProviderModel.query().where("id", providerId).first();

/**
 * Synchronises DNS A-records for a proxy host with its configured provider.
 * Never throws — failures are returned in dns_err.
 *
 * @param {{dns_provider_id:number, domain_names:string[], meta:object}} host
 * @returns {Promise<{dns_synced:boolean, dns_err:string|null, dns_records:Array}>}
 */
export const sync = async (host) => {
	if (!host.dns_provider_id) {
		return { dns_synced: false, dns_err: null, dns_records: [] };
	}
	const existing = host.meta?.dns_records || [];
	try {
		const provider = await loadProvider(host.dns_provider_id);
		if (!provider) {
			throw new Error(`DNS provider ${host.dns_provider_id} not found`);
		}
		const driver = getDriver(provider.type);
		const { toCreate, toDelete } = diffDomains(host.domain_names || [], existing);

		const kept = existing.filter((r) => !toDelete.includes(r));

		for (const rec of toDelete) {
			await driver.deleteRecord(provider.credentials, { zone_id: rec.zone_id, rrset_id: rec.rrset_id });
		}
		const created = [];
		for (const domain of toCreate) {
			const { zone_id, rrset_id } = await driver.createRecord(
				provider.credentials,
				domain,
				provider.default_ip,
				provider.ttl,
			);
			created.push({ domain, zone_id, rrset_id });
		}
		return { dns_synced: true, dns_err: null, dns_records: [...kept, ...created] };
	} catch (err) {
		logger.error(`sync failed for host domains ${JSON.stringify(host.domain_names)}: ${err.message}`);
		return { dns_synced: false, dns_err: err.message, dns_records: existing };
	}
};

/**
 * Removes all DNS records previously created for a host. Never throws.
 * @param {{dns_provider_id:number, meta:object}} host
 */
export const cleanup = async (host) => {
	if (!host.dns_provider_id) {
		return;
	}
	const existing = host.meta?.dns_records || [];
	if (!existing.length) {
		return;
	}
	try {
		const provider = await loadProvider(host.dns_provider_id);
		if (!provider) {
			return;
		}
		const driver = getDriver(provider.type);
		for (const rec of existing) {
			await driver.deleteRecord(provider.credentials, { zone_id: rec.zone_id, rrset_id: rec.rrset_id });
		}
	} catch (err) {
		logger.error(`cleanup failed: ${err.message}`);
	}
};

export default { diffDomains, sync, cleanup };
