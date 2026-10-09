import fs from "node:fs";
import { getPublicPorts, renderPublicPortsConfig } from "../lib/public-ports.js";

const filename = process.argv[2] || "/etc/nginx/conf.d/public-ports.conf";
fs.writeFileSync(filename, renderPublicPortsConfig(getPublicPorts()), { mode: 0o644 });
