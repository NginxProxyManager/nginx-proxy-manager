import * as api from "./base";

export async function testCredentialProvider(id: number) {
	return await api.post({ url: `/credential-providers/${id}/test` });
}

export async function testCredentialProviderResolve(id: number, path: string, field?: string) {
	return await api.post({ url: `/credential-providers/${id}/test-resolve`, data: { path, field } });
}
