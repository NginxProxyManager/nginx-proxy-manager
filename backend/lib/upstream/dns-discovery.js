import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import {
	DOCKER_EMBEDDED_DNS,
	intToIpv4,
	ipv4ToInt,
	parseIpv4Cidr,
	parseProcNetRouteGateways,
	parsePtrName,
	readResolvConfNameservers,
	withTimeout,
} from "./util.js";

/**
 * Container discovery without the Docker socket: a bounded reverse (PTR) sweep of our own subnets
 * against Docker's embedded DNS (127.0.0.11), which answers "<container>.<network>." for every
 * container on a user-defined network.
 *
 * Verified on Docker 2x (see docs/src/advanced-config/upstream-discovery.md):
 * - containers:   PTR -> ["app.mynet"]
 * - own address:  PTR -> [] (empty answer)
 * - gateway (.1): PTR is forwarded to the host's resolver and returns the host's own name,
 *                 so gateways are skipped and every hit is verified with a forward lookup.
 * - free address: ENOTFOUND
 * Docker IPAM assigns addresses sequentially from base+2, so the sweep goes upward from base+1
 * and stops after a run of misses.
 */

const DEFAULTS = {
	timeoutMs: 500,
	concurrency: 16,
	maxConsecutiveMisses: 32,
	maxAddresses: 1024,
	deadlineMs: 5000,
};

class DnsDiscoveryUnavailable extends Error {
	constructor(message) {
		super(message);
		this.name = "DnsDiscoveryUnavailable";
	}
}

/**
 * @param   {object} interfaces  os.networkInterfaces()
 * @returns {Array<{cidr: string, address: string, iface: string}>}
 */
const ownIpv4Subnets = (interfaces) => {
	const out = [];
	for (const [iface, list] of Object.entries(interfaces || {})) {
		for (const addr of list || []) {
			if (!addr || addr.internal || (addr.family !== "IPv4" && addr.family !== 4)) {
				continue;
			}
			// link-local
			if (addr.address.startsWith("169.254.")) {
				continue;
			}
			out.push({ cidr: addr.cidr, address: addr.address, iface });
		}
	}
	return out;
};

/**
 * Sweeps one subnet.
 *
 * @param   {object}   ctx
 * @param   {object}   ctx.resolver   dns.promises.Resolver-like (reverse, resolve4)
 * @param   {object}   ctx.range      parseIpv4Cidr() output
 * @param   {Set}      ctx.skip       addresses to skip (own, gateways)
 * @param   {number}   ctx.deadline   epoch ms
 * @param   {object}   ctx.limits
 * @param   {Map}      ctx.found      host -> item (shared across subnets)
 * @param   {object}   [ctx.budget]   {scanned} shared across subnets so maxAddresses is global
 * @returns {Promise<{scanned: number, truncated: boolean}>}
 */
const sweepRange = async ({ resolver, range, skip, deadline, limits, found, budget = { scanned: 0 } }) => {
	let consecutiveMisses = 0;
	let scanned = 0;
	let next = range.first;
	let late = false;

	const lookup = async (ip) => {
		let names;
		try {
			names = await resolver.reverse(ip);
		} catch (_) {
			return { hit: false };
		}
		if (!Array.isArray(names) || !names.length) {
			// Docker answers our own address with an empty list; treat other empty answers as in use
			return { hit: true };
		}
		for (const name of names) {
			for (const candidate of parsePtrName(name)) {
				if (Date.now() >= deadline) {
					return { hit: true };
				}
				try {
					const forward = await resolver.resolve4(candidate.host);
					if (Array.isArray(forward) && forward.includes(ip)) {
						return { hit: true, item: { ...candidate, ip } };
					}
				} catch (_) {
					// try the next candidate
				}
			}
		}
		return { hit: true };
	};

	// Every probe is cut off at the global deadline, so a slow batch can't overrun it
	const probe = (ip) =>
		withTimeout(lookup(ip), Math.max(0, deadline - Date.now()), () => {
			late = true;
			return { hit: false };
		});

	while (next <= range.last) {
		if (Date.now() >= deadline || budget.scanned >= limits.maxAddresses) {
			return { scanned, truncated: true };
		}

		const batch = [];
		while (
			batch.length < limits.concurrency &&
			next <= range.last &&
			budget.scanned + batch.length < limits.maxAddresses
		) {
			const ip = intToIpv4(next);
			next++;
			if (!skip.has(ip)) {
				batch.push(ip);
			}
		}
		if (!batch.length) {
			continue;
		}
		scanned += batch.length;
		budget.scanned += batch.length;

		const results = await Promise.all(batch.map(probe));
		results.forEach((result) => {
			if (result.hit) {
				consecutiveMisses = 0;
			} else {
				consecutiveMisses++;
			}
			if (result.item && !found.has(result.item.host.toLowerCase())) {
				found.set(result.item.host.toLowerCase(), result.item);
			}
		});

		if (late) {
			return { scanned, truncated: true };
		}
		if (consecutiveMisses >= limits.maxConsecutiveMisses) {
			return { scanned, truncated: false };
		}
	}
	return { scanned, truncated: false };
};

/**
 * @param   {object}   [opts]
 * @param   {string[]} [opts.nameservers]  defaults to /etc/resolv.conf
 * @param   {object}   [opts.interfaces]   defaults to os.networkInterfaces()
 * @param   {string[]} [opts.gateways]     defaults to /proc/net/route
 * @param   {object}   [opts.resolver]     dns.promises.Resolver-like (tests)
 * @param   {string}   [opts.server]       DNS server to query, default 127.0.0.11
 * @returns {Promise<{items: Array, scanned: number, truncated: boolean}>}
 */
const discoverDns = async (opts = {}) => {
	const limits = { ...DEFAULTS, ...(opts.limits || {}) };
	const server = opts.server || DOCKER_EMBEDDED_DNS;
	const nameservers = opts.nameservers || readResolvConfNameservers();

	if (!nameservers.includes(server)) {
		throw new DnsDiscoveryUnavailable(
			"Nginx Proxy Manager is not on a user-defined Docker network (no Docker embedded DNS in /etc/resolv.conf), so containers can't be discovered by name. Put NPM and your apps on a shared Docker network.",
		);
	}

	const subnets = ownIpv4Subnets(opts.interfaces || os.networkInterfaces());
	if (!subnets.length) {
		throw new DnsDiscoveryUnavailable("No IPv4 network interface found to scan.");
	}

	let gateways = opts.gateways;
	if (!gateways) {
		try {
			gateways = parseProcNetRouteGateways(fs.readFileSync("/proc/net/route", "utf8"));
		} catch (_) {
			gateways = [];
		}
	}

	const skip = new Set([...subnets.map((s) => s.address), ...gateways]);
	const resolver = opts.resolver || new dns.promises.Resolver({ timeout: limits.timeoutMs, tries: 1 });
	if (!opts.resolver) {
		resolver.setServers([server]);
	}

	const deadline = Date.now() + limits.deadlineMs;
	const found = new Map();
	const budget = { scanned: 0 };
	let truncated = false;
	const seenRanges = new Set();

	try {
		for (const subnet of subnets) {
			const range = parseIpv4Cidr(subnet.cidr);
			if (!range || seenRanges.has(range.network)) {
				continue;
			}
			seenRanges.add(range.network);
			const result = await sweepRange({ resolver, range, skip, deadline, limits, found, budget });
			truncated = truncated || result.truncated;
			if (Date.now() >= deadline || budget.scanned >= limits.maxAddresses) {
				truncated = true;
				break;
			}
		}
	} finally {
		if (!opts.resolver && typeof resolver.cancel === "function") {
			resolver.cancel();
		}
	}

	const items = [...found.values()]
		.sort((a, b) => ipv4ToInt(a.ip) - ipv4ToInt(b.ip))
		.map((entry) => ({
			host: entry.host,
			label: `${entry.host} (on ${entry.network})`,
			source: "dns",
			ports: [],
			hint_port: null,
			hint_scheme: null,
			network: entry.network,
			state: null,
			ip: entry.ip,
			used_by: 0,
		}));

	return { items, scanned: budget.scanned, truncated };
};

export { DnsDiscoveryUnavailable, discoverDns, ownIpv4Subnets, sweepRange };
