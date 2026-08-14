import fs from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { getActivePath } from "./nginx-host-adapters.js";

export const deploymentRoot = (nginxRoot = "/data/nginx") => join(nginxRoot, ".deploy");

export const assertInside = (root, path) => {
	const rootPath = resolve(root);
	const target = resolve(path);
	if (target !== rootPath && !target.startsWith(`${rootPath}${process.platform === "win32" ? "\\" : "/"}`)) {
		throw new Error(`Path escapes configured nginx root: ${path}`);
	}
	return target;
};

export const activeArtifactPath = (hostType, hostId, nginxRoot = "/data/nginx") => getActivePath(hostType, hostId, nginxRoot);
export const candidateArtifactPath = (hostType, hostId, operationId, nginxRoot = "/data/nginx") =>
	assertInside(deploymentRoot(nginxRoot), join(deploymentRoot(nginxRoot), "candidates", hostType, String(hostId), `${operationId}.conf`));
export const stagingArtifactPath = (hostType, hostId, operationId, nginxRoot = "/data/nginx") =>
	assertInside(deploymentRoot(nginxRoot), join(deploymentRoot(nginxRoot), "staging", operationId, hostType, `${hostId}.conf`));
export const backupArtifactPath = (hostType, hostId, operationId, nginxRoot = "/data/nginx") =>
	assertInside(deploymentRoot(nginxRoot), join(deploymentRoot(nginxRoot), "backups", operationId, hostType, `${hostId}.conf`));
export const journalPath = (operationId, nginxRoot = "/data/nginx") => assertInside(deploymentRoot(nginxRoot), join(deploymentRoot(nginxRoot), "journal", `${operationId}.json`));

export const readArtifact = async (path) => {
	try {
		return await fs.readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
};

/** Atomic within one filesystem: write, fsync, rename and fsync directory. */
export const atomicWrite = async (path, content) => {
	await fs.mkdir(dirname(path), { recursive: true });
	const temp = join(dirname(path), `.${randomUUID()}.tmp`);
	let handle;
	try {
		handle = await fs.open(temp, "wx", 0o600);
		await handle.writeFile(content, "utf8");
		await handle.sync();
		await handle.close();
		handle = null;
		await fs.rename(temp, path);
		try {
			const directory = await fs.open(dirname(path), "r");
			await directory.sync();
			await directory.close();
		} catch (error) {
			if (!["EINVAL", "EPERM", "ENOTSUP"].includes(error.code)) throw error;
		}
	} finally {
		if (handle) await handle.close();
		await fs.rm(temp, { force: true }).catch(() => undefined);
	}
};

export const removeArtifact = async (path) => fs.rm(path, { force: true });

export const writeJournal = async (journal, nginxRoot = "/data/nginx") => atomicWrite(journalPath(journal.operation_id, nginxRoot), `${JSON.stringify(journal, null, 2)}\n`);
export const readJournals = async (nginxRoot = "/data/nginx") => {
	const directory = join(deploymentRoot(nginxRoot), "journal");
	try {
		const names = await fs.readdir(directory);
		return Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => JSON.parse(await fs.readFile(join(directory, name), "utf8"))));
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
};
export const deleteJournal = async (operationId, nginxRoot = "/data/nginx") => fs.rm(journalPath(operationId, nginxRoot), { force: true });

export const toLogicalPath = (path, nginxRoot = "/data/nginx") => {
	const value = relative(nginxRoot, path).replace(/\\/g, "/");
	if (!value || value.startsWith("../") || isAbsolute(value)) throw new Error("Artifact path is outside nginx root");
	return value;
};

export default { deploymentRoot, assertInside, activeArtifactPath, candidateArtifactPath, stagingArtifactPath, backupArtifactPath, journalPath, readArtifact, atomicWrite, removeArtifact, writeJournal, readJournals, deleteJournal, toLogicalPath };
