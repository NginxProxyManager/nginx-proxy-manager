import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSetting, type Setting, updateSetting } from "src/api/backend";

const fetchSetting = (id: string) => {
	return getSetting(id);
};

const useSetting = (id: string, options = {}) => {
	return useQuery<Setting, Error>({
		queryKey: ["setting", id],
		queryFn: () => fetchSetting(id),
		staleTime: 60 * 1000, // 1 minute
		...options,
	});
};

const useSetSetting = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Setting) => updateSetting(values),
		onMutate: (values: Setting) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["setting", values.id]);
			queryClient.setQueryData(["setting", values.id], (old: Setting) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["setting", values.id], previousObject);
		},
		onError: (_, __, rollback: any) => rollback(),
		onSuccess: async ({ id }: Setting) => {
			queryClient.invalidateQueries({ queryKey: ["setting", id] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useSetting, useSetSetting };
