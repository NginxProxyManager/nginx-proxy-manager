import * as api from "./base";
import type { MkcertStatus } from "./models";

export async function getMkcertStatus(): Promise<MkcertStatus> {
	return await api.get({
		url: "/nginx/certificates/mkcert/status",
	});
}
