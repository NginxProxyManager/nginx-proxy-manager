import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const tag = `npm-nginx-live:${randomUUID()}`;
const container = tag.replace(":", "-");
const reports = join(root, "backend", "coverage", "nginx-live");
mkdirSync(reports, { recursive: true });
const run = (args) => {
	const result = spawnSync("docker", args, { cwd: root, stdio: "inherit", timeout: args[0] === "run" ? 240000 : 1200000 });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`docker ${args[0]} exited ${result.status}`);
};
try {
	const args = ["build", "-f", "docker/Dockerfile.nginx-integration", "-t", tag];
	if (process.env.NPM_TEST_IMAGE) args.push("--build-arg", `NPM_TEST_IMAGE=${process.env.NPM_TEST_IMAGE}`);
	run([...args, "."]);
	run(["run", "--rm", "--name", container, "--mount", `type=bind,source=${reports},target=/results`, tag]);
} finally {
	spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
	spawnSync("docker", ["image", "rm", tag], { stdio: "inherit" });
}
