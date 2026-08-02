import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import utils from "../lib/utils.js";
import { deploymentRoot } from "./nginx-config-artifacts.js";

const cleanOutput = (output, mirror) =>
	String(output || "")
		.replaceAll(mirror, "/data/nginx")
		.replace(/\/data\/nginx\/.deploy\/validation\/[^/]+/g, "/data/nginx/.deploy/validation/<operation>");

/**
 * Builds a read-only mirror of the managed nginx directory and rewrites the
 * master configuration to point its managed includes at that mirror. No active
 * artifact is touched during preview validation.
 */
export const validateInMirror = async ({
	nginxRoot = "/data/nginx",
	nginxConfigPath = "/etc/nginx/nginx.conf",
	nginxPrefix = "/etc/nginx",
	operationId = randomUUID(),
	candidatePath,
	targetPath,
	commandRunner = utils.execFileResult,
}) => {
	const root = deploymentRoot(nginxRoot);
	// fs.cp rejects copying a directory into any of its own descendants before
	// its filter callback runs. Keep the validation tree beside nginxRoot rather
	// than under nginxRoot/.deploy so the mirror can be created safely.
	const validationId = String(operationId)
		.replace(/[^a-zA-Z0-9_-]/g, "-")
		.slice(0, 64);
	const validationRoot = await fs.mkdtemp(join(dirname(resolve(nginxRoot)), `.nginx-validation-${validationId}-`));
	const mirror = join(validationRoot, "nginx");
	const master = join(validationRoot, "nginx.conf");
	try {
		await fs.cp(nginxRoot, mirror, { recursive: true, filter: (source) => !source.includes(root) });
		// Included files such as /etc/nginx/conf.d/default.conf may themselves use
		// paths relative to the main config directory. Mirror conf.d beside the
		// temporary main config so those includes resolve without touching them.
		await fs.cp(join(nginxPrefix, "conf.d"), join(validationRoot, "conf.d"), { recursive: true });
		const replacement = join(mirror, targetPath.slice(nginxRoot.length).replace(/^[/\\]/, ""));
		await fs.mkdir(join(replacement, ".."), { recursive: true });
		await fs.copyFile(candidatePath, replacement);
		const sourceMaster = await fs.readFile(nginxConfigPath, "utf8");
		await fs.writeFile(master, sourceMaster.replaceAll(nginxRoot, mirror.replace(/\\/g, "/")), "utf8");
		const result = await commandRunner("/usr/sbin/nginx", [
			"-t",
			"-c",
			master,
			"-p",
			nginxPrefix,
			"-g",
			"error_log /dev/null crit;",
		]);
		return {
			valid: true,
			stdout: cleanOutput(result.stdout, mirror),
			stderr: cleanOutput(result.stderr, mirror),
			validation_scope: "full",
		};
	} catch (error) {
		return {
			valid: false,
			stdout: cleanOutput(error.stdout, mirror),
			stderr: cleanOutput(error.stderr || error.message, mirror),
			validation_scope: "full",
			error,
		};
	} finally {
		await fs.rm(validationRoot, { recursive: true, force: true }).catch(() => undefined);
	}
};

export default { validateInMirror };
