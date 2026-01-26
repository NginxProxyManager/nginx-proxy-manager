import * as api from "./base";

export interface ImportResult {
	success: boolean;
	message: string;
}

export async function exportBackup(password?: string): Promise<void> {
	const params = password ? `?password=${encodeURIComponent(password)}` : "";
	await api.download(
		{
			url: `/backup/export${params}`,
		},
		`npm-backup-${Date.now()}.zip`,
	);
}

export async function importBackup(file: File, password?: string): Promise<ImportResult> {
	const formData = new FormData();
	formData.append("backup", file);
	if (password) {
		formData.append("password", password);
	}

	return await api.post({
		url: "/backup/import",
		data: formData,
	});
}
