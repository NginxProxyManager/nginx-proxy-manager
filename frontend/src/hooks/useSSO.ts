import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	deleteSSOConnection,
	getSSOAllowlist,
	getSSOConnections,
	getSSOLegacyStatus,
	getSSOPolicy,
	importLegacySSO,
	previewSSOMetadata,
	saveSSOConnection,
	testSSOConnection,
	updateSSOAllowlist,
	updateSSOPolicy,
} from "src/api/backend";

const policyKey = ["sso", "policy"] as const;
const connectionsKey = ["sso", "connections"] as const;
const allowlistKey = ["sso", "allowlist"] as const;
const legacyKey = ["sso", "legacy"] as const;

export function useSSOSettings() {
	const queryClient = useQueryClient();
	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: ["sso"] });
		await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
	};

	const policy = useQuery({ queryKey: policyKey, queryFn: getSSOPolicy });
	const connections = useQuery({ queryKey: connectionsKey, queryFn: getSSOConnections });
	const allowlist = useQuery({ queryKey: allowlistKey, queryFn: getSSOAllowlist });
	const legacyStatus = useQuery({ queryKey: legacyKey, queryFn: getSSOLegacyStatus });

	return {
		policy,
		connections,
		allowlist,
		legacyStatus,
		updatePolicy: useMutation({ mutationFn: updateSSOPolicy, onSuccess: invalidate }),
		updateAllowlist: useMutation({ mutationFn: updateSSOAllowlist, onSuccess: invalidate }),
		saveConnection: useMutation({ mutationFn: saveSSOConnection, onSuccess: invalidate }),
		deleteConnection: useMutation({ mutationFn: deleteSSOConnection, onSuccess: invalidate }),
		testConnection: useMutation({ mutationFn: testSSOConnection }),
		previewSAML: useMutation({ mutationFn: previewSSOMetadata }),
		importLegacy: useMutation({ mutationFn: importLegacySSO, onSuccess: invalidate }),
		refetchAll: async () => {
			await queryClient.refetchQueries({ queryKey: ["sso"] });
		},
	};
}
