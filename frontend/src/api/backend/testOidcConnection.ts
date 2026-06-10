import * as api from "./base";

export interface TestOidcConnectionPayload {
	discoveryUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	providerId?: string;
}

export interface TestOidcConnectionResult {
	success: boolean;
	credentials: "valid" | "invalid" | "unsupported";
	credentialsMessage: string;
	scopesValid: boolean;
	unsupportedScopes: string[];
}

export async function testOidcConnection(data: TestOidcConnectionPayload): Promise<TestOidcConnectionResult> {
	return await api.post({
		url: "/oidc/test-connection",
		data,
	});
}
