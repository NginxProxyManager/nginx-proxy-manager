import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createSingleSignOnClient,
	getSingleSignOnClient,
	type SingleSignOnClient,
	SingleSignOnClientType,
	updateSingleSignOnClient,
} from "src/api/backend";

export const SingleSignOnClientBaseConfig = {
	enabled: true,
	name: "",
	clientType: "",
	configuration: "",
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
	if (id.toString().startsWith("new")) {
		const props = { clientType: "", configuration: {} };
		if (clientType === SingleSignOnClientType.OpenID) {
			props.clientType = SingleSignOnClientType.OpenID;
			props.configuration = OpenIDConfig;
		} else if (clientType === SingleSignOnClientType.SAML) {
			props.clientType = SingleSignOnClientType.SAML;
			props.configuration = SAMLConfig;
		}
		return Promise.resolve({
			...SingleSignOnClientBaseConfig,
			clientType: props.clientType,
			configuration: props.configuration,
		} as SingleSignOnClient);
	}
	const expand = clientType === SingleSignOnClientType.OpenID ? "configuration_openid" : "configuration_saml";
	return getSingleSignOnClient(id, [expand]);
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
