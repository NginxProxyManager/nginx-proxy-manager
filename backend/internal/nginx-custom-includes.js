import fs from "node:fs/promises";
import { sha256 } from "./nginx-config-hash.js";
import { scanAdvancedConfig } from "./nginx-config-diagnostics.js";

const DEFAULT_CUSTOM_INCLUDE_PATHS = Object.freeze(["/data/nginx/custom/server_proxy.conf"]);

export const collectCustomIncludeManifest = async (paths = DEFAULT_CUSTOM_INCLUDE_PATHS) =>
	Promise.all(
		[...new Set(paths)].sort().map(async (path) => {
			try {
				const content = await fs.readFile(path);
				return {
					path,
					exists: true,
					hash: sha256(content),
					size: content.length,
					diagnostics: scanAdvancedConfig(content.toString("utf8")).map((item) => ({
						...item,
						scope: "custom_include",
						path,
						message: `Custom include ${path}: ${item.message}`,
					})),
				};
			} catch (error) {
				if (error.code === "ENOENT") return { path, exists: false, hash: null, size: 0, diagnostics: [] };
				throw error;
			}
		}),
	);

export default { collectCustomIncludeManifest };
