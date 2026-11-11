import { useQueryClient } from "@tanstack/react-query";
import { useField } from "formik";
import { useMemo } from "react";
import CreatableSelect from "react-select/creatable";
import { intl, T } from "src/locale";

const MAX_LENGTH = 50;

interface FolderOption {
	readonly value: string;
	readonly label: string;
}

interface Props {
	// Query key of the host list, used to suggest the folders already in use
	queryKey: string;
	name?: string;
	id?: string;
}
export function FolderField({ queryKey, name = "meta.folder", id = "folder" }: Props) {
	const queryClient = useQueryClient();
	const [field, , helpers] = useField<string | undefined>(name);

	// Reads the host lists already in the query cache instead of fetching them again
	const options: FolderOption[] = useMemo(() => {
		const hosts = queryClient
			.getQueriesData<{ meta?: Record<string, any> }[]>({ queryKey: [queryKey] })
			.flatMap(([, data]) => data ?? []);
		const folders = new Set(hosts.map((host) => host.meta?.folder?.trim()).filter(Boolean) as string[]);
		return [...folders].sort((a, b) => a.localeCompare(b)).map((folder) => ({ value: folder, label: folder }));
	}, [queryClient, queryKey]);

	return (
		<div className="mb-3">
			<label htmlFor={id} className="form-label">
				<T id="folder" />
			</label>
			<CreatableSelect<FolderOption>
				inputId={id}
				className="react-select-container"
				classNamePrefix="react-select"
				isClearable
				options={options}
				value={field.value ? { value: field.value, label: field.value } : null}
				// The backend merges meta on update, so clearing has to send an empty string
				onChange={(option) => helpers.setValue(option?.value.trim() ?? "")}
				onInputChange={(value) => value.slice(0, MAX_LENGTH)}
				isValidNewOption={(value) => value.trim() !== ""}
				formatCreateLabel={(value) => intl.formatMessage({ id: "folder.create" }, { name: value.trim() })}
				placeholder={intl.formatMessage({ id: "folder.placeholder" })}
			/>
		</div>
	);
}
