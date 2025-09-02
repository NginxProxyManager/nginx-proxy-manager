import * as api from "./base";
import type { HealthResponse } from "./responseTypes";

export async function getHealth(abortController?: AbortController): Promise<HealthResponse> {
	return await api.get(
		{
			url: "/",
		},
		abortController,
	);
}
