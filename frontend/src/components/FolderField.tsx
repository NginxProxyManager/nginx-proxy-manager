import { useQueryClient } from "@tanstack/react-query";
import { useField } from "formik";
import { useMemo } from "react";
import type { ActionMeta, SingleValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { intl, T } from "src/locale";

type FolderOption = {
	label: string;
	value: string;
};

interface Props {
	queryKey: string;
	metaPath?: string;
}

export function FolderField({ queryKey, metaPath = "meta.folder" }: Props) {
	const queryClient = useQueryClient();
	const [field, , helpers] = useField(metaPath);

	const options: FolderOption[] = useMemo(() => {
		const allData = queryClient.getQueriesData<any[]>({ queryKey: [queryKey] }).flatMap(([, data]) => data ?? []);
		return [...new Set(allData.map((h: any) => h.meta?.folder).filter(Boolean) as string[])]
			.sort()
			.map((f) => ({ label: f, value: f }));
	}, [queryClient, queryKey]);

	const currentValue: FolderOption | null = field.value ? { label: field.value, value: field.value } : null;

	const handleChange = (newValue: SingleValue<FolderOption>, _actionMeta: ActionMeta<FolderOption>) => {
		helpers.setValue(newValue?.value || undefined);
	};

	return (
		<div className="mb-3">
			<label htmlFor="folder-select" className="form-label">
				<T id="folder" />
			</label>
			<CreatableSelect
				inputId="folder-select"
				className="react-select-container"
				classNamePrefix="react-select"
				isClearable
				options={options}
				value={currentValue}
				onChange={handleChange}
				placeholder={intl.formatMessage({ id: "folder.placeholder" })}
			/>
		</div>
	);
}
