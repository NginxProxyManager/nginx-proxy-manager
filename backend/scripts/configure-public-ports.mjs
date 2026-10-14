import fs from "node:fs";
import {
	getPublicPorts,
	renderPublicPortsConfig,
	renderPublicPortsServerConfig,
} from "../lib/public-ports.js";

const filename = process.argv[2] || "/etc/nginx/conf.d/public-ports.conf";
const serverFilename = process.argv[3] || "/etc/nginx/conf.d/include/public-ports-ssl.conf";
const ports = getPublicPorts();
fs.writeFileSync(filename, renderPublicPortsConfig(ports), { mode: 0o644 });
fs.writeFileSync(serverFilename, renderPublicPortsServerConfig(ports), { mode: 0o644 });
