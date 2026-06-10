import * as api from "./base";

export async function migrateLegacyCredentials(dryRun = false) {
	return await api.post({ url: "/credentials/migrate-legacy", data: { dryRun } });
}
