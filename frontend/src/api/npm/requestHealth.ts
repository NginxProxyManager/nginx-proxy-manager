import * as api from "./base";
import { HealthResponse } from "./responseTypes";

export async function requestHealth(
	abortController?: AbortController,
): Promise<HealthResponse> {
	const { result } = await api.get(
		{
			url: "",
		},
		abortController,
	);
	return result;
}
