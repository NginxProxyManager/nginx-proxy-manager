import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createSingleSignOnClient,
	getSingleSignOnClient,
	type ProvisionRoleMap,
	type SingleSignOnClient,
	SingleSignOnClientType,
	type SingleSignOnConfigExpansion,
	updateSingleSignOnClient,
} from "src/api/backend";

export const SingleSignOnClientBaseConfig = {
	enabled: true,
	name: "",
	clientType: "",
	configuration: {},
	buttonText: "",
	requireVerifiedEmail: false,
	allowInternal: true,
	allowInternalIfAdmin: false,
	requireGroup: false,
	requireGroupName: "",
	provisionUsers: false,
	requireProvisionGroup: false,
	requireProvisionGroupName: "",
	provisionRoleMap: [] as ProvisionRoleMap[],
};

export const Auth0Config = {
	clientId: "",
	clientSecret: "",
	domain: "",
	redirectUrl: "",
};

export const GitHubConfig = {
	githubClientId: "",
	clientSecret: "",
	redirectUrl: "",
};

export const OpenIDConfig = {
	clientId: "",
	clientSecret: "",
	configurationUrl: "",
	redirectUrl: "",
};

export const SAMLConfig = {
	samlEndpoint: "",
};

const fetchSingleSignOnClient = async (id: number | string, clientType?: SingleSignOnClientType) => {
	if (!clientType) {
		throw new Error("Client type required");
	}
	if (id.toString().startsWith("new")) {
		const props = { clientType: "", configuration: {} };
		if (clientType === SingleSignOnClientType.OpenID) {
			props.clientType = SingleSignOnClientType.OpenID;
			props.configuration = OpenIDConfig;
		} else if (clientType === SingleSignOnClientType.GitHub) {
			props.clientType = SingleSignOnClientType.GitHub;
			props.configuration = GitHubConfig;
		} else if (clientType === SingleSignOnClientType.SAML) {
			props.clientType = SingleSignOnClientType.SAML;
			props.configuration = SAMLConfig;
		} else if (clientType === SingleSignOnClientType.Auth0) {
			props.clientType = SingleSignOnClientType.Auth0;
			props.configuration = Auth0Config;
		}
		return Promise.resolve({
			...SingleSignOnClientBaseConfig,
			clientType: props.clientType,
			configuration: props.configuration,
		} as SingleSignOnClient);
	}
	const expand = [`configuration_${clientType.toLocaleLowerCase()}` as SingleSignOnConfigExpansion];

	return getSingleSignOnClient(id, expand);
};

interface UT {
	clientType?: SingleSignOnClientType;
}
const useSingleSignOnClient = (id: string | number, options: UT = {}) => {
	return useQuery<SingleSignOnClient, Error>({
		queryKey: ["sso-client", id],
		queryFn: () => fetchSingleSignOnClient(id, options.clientType),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetSingleSignOnClient = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: SingleSignOnClient) =>
			values.id ? updateSingleSignOnClient(values) : createSingleSignOnClient(values),
		onMutate: (values: SingleSignOnClient) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["sso_client", values.id]);
			queryClient.setQueryData(["sso_client", values.id], (old: SingleSignOnClient) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["sso_client", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback?.(),
		onSuccess: async ({ id }: SingleSignOnClient) => {
			queryClient.invalidateQueries({ queryKey: ["sso-client", id] });
			queryClient.invalidateQueries({ queryKey: ["sso-clients"] });
		},
	});
};

export { useSetSingleSignOnClient, useSingleSignOnClient };
