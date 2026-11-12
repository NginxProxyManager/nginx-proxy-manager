import net from "node:net";

const local = new net.BlockList();
for (const [addr, bits] of [
	["10.0.0.0", 8],
	["172.16.0.0", 12],
	["192.168.0.0", 16],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
]) {
	local.addSubnet(addr, bits, "ipv4");
}
for (const [addr, bits] of [
	["fc00::", 7],
	["fe80::", 10],
]) {
	local.addSubnet(addr, bits, "ipv6");
}
local.addAddress("::1", "ipv6");

/**
 * True for addresses that can't be geolocated: private, loopback, link-local and CGNAT ranges.
 *
 * @param   {String} ip
 * @returns {Boolean}
 */
const isLocalIp = (ip) => {
	const family = net.isIP(ip);
	if (!family) {
		return false;
	}
	// IPv4 clients can show up as ::ffff:a.b.c.d
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped) {
		return local.check(mapped[1], "ipv4");
	}
	return local.check(ip, family === 4 ? "ipv4" : "ipv6");
};

export { isLocalIp };
