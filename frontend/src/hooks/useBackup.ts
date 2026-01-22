import { useMutation, useQueryClient } from "@tanstack/react-query";
import { exportBackup, importBackup, type ImportResult } from "src/api/backend";
import AuthStore from "src/modules/AuthStore";

const useExportBackup = () => {
	return useMutation<void, Error, string | undefined>({
		mutationFn: (password?: string) => exportBackup(password),
	});
};

interface ImportBackupParams {
	file: File;
	password?: string;
}

const useImportBackup = () => {
	const queryClient = useQueryClient();

	return useMutation<ImportResult, Error, ImportBackupParams>({
		mutationFn: ({ file, password }: ImportBackupParams) => importBackup(file, password),
		onSuccess: () => {
			// Force logout user and do a full navigation to ensure fresh state
			AuthStore.clear();
			queryClient.clear();
			// Small delay to ensure backend has fully completed
			setTimeout(() => {
				window.location.href = "/";
			}, 1000);
		},
	});
};

export { useExportBackup, useImportBackup };
