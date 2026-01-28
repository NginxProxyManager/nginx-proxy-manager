import * as api from "./base";

export async function downloadMkcertCA(): Promise<void> {
	await api.download(
		{
			url: "/nginx/certificates/mkcert/ca",
		},
		"mkcert-ca.pem",
	);
}
