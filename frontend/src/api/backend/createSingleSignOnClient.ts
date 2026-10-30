import * as api from "./base";
import type { SingleSignOnClient, SingleSignOnClientConfigurationType, SingleSignOnClientType } from "./models";

export interface NewSingleSignOnClientConfiguration {
	name: string;
	clientType: SingleSignOnClientType;
	configuration?: SingleSignOnClientConfigurationType;
}

export async function createSingleSignOnClient(item: NewSingleSignOnClientConfiguration): Promise<SingleSignOnClient> {
	return await api.post({
		url: "/sso/clients",
		data: item,
	});
}
