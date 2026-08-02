import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { candidateArtifactPath } from "../../internal/nginx-config-artifacts.js";
import { validateInMirror } from "../../internal/nginx-config-validator.js";

const temporaryRoot = async () => fs.mkdtemp(join(os.tmpdir(), "npm-nginx-validator-"));

test("validation mirror is created outside nginxRoot and receives the candidate artifact", async (context) => {
	const nginxRoot = await temporaryRoot();
	context.after(() => fs.rm(nginxRoot, { recursive: true, force: true }));
	const targetPath = join(nginxRoot, "proxy_host", "2.conf");
	const candidatePath = candidateArtifactPath("proxy_host", 2, "operation-2", nginxRoot);
	const nginxPrefix = join(nginxRoot, "nginx-prefix");
	const nginxConfigPath = join(nginxRoot, "test-nginx.conf");
	await fs.mkdir(join(nginxPrefix, "conf.d", "include"), { recursive: true });
	await fs.writeFile(join(nginxPrefix, "conf.d", "include", "shared.conf"), "shared config\n");
	await fs.mkdir(join(targetPath, ".."), { recursive: true });
	await fs.mkdir(join(candidatePath, ".."), { recursive: true });
	await fs.writeFile(targetPath, "old config\n");
	await fs.writeFile(candidatePath, "candidate config\n");
	await fs.writeFile(nginxConfigPath, `include ${nginxRoot}/proxy_host/*.conf;\n`);

	let generatedMaster = null;
	const result = await validateInMirror({
		nginxRoot,
		nginxConfigPath,
		nginxPrefix,
		operationId: "operation-2",
		candidatePath,
		targetPath,
		commandRunner: async (_command, args) => {
			assert.equal(args[args.indexOf("-g") + 1], "error_log /dev/null crit;");
			generatedMaster = args[args.indexOf("-c") + 1];
			const mirror = join(generatedMaster, "..");
			assert.equal(
				await fs.readFile(join(mirror, "nginx", "proxy_host", "2.conf"), "utf8"),
				"candidate config\n",
			);
			assert.match(await fs.readFile(generatedMaster, "utf8"), /\.nginx-validation-/);
			return { stdout: "", stderr: "" };
		},
	});

	assert.equal(result.valid, true);
	assert.ok(generatedMaster);
	await assert.rejects(() => fs.access(generatedMaster), { code: "ENOENT" });
});
