import * as api from "./base";
import type {
	OpenIDClientConfiguration,
	SAMLClientConfiguration,
	SingleSignOnClient,
	SingleSignOnClientType,
} from "./models";

export interface NewSingleSignOnClientConfiguration {
	name: string;
	clientType: SingleSignOnClientType;
	configuration?: OpenIDClientConfiguration | SAMLClientConfiguration;
}

export async function createSingleSignOnClient(item: NewSingleSignOnClientConfiguration): Promise<SingleSignOnClient> {
	return await api.post({
		url: "/sso/clients",
		data: item,
	});
}
