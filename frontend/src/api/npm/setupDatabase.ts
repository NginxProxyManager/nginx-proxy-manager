import * as api from "./base";

export interface DatabaseConfig {
	driver: string;
	host?: string;
	port?: number;
	username?: string;
	password?: string;
	name?: string;
	sslmode?: string;
}

export async function setupDatabase(
	data: DatabaseConfig,
	abortController?: AbortController,
): Promise<boolean> {
	const { result } = await api.post(
		{
			url: "/setup/database",
			data,
		},
		abortController,
	);
	return result;
}
