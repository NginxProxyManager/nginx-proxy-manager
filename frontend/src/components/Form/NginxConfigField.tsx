import CodeEditor from "@uiw/react-textarea-code-editor";
import { Field } from "formik";
import { intl, T } from "src/locale";

interface Props {
	id?: string;
	name?: string;
	label?: string;
}
export function NginxConfigField({
	name = "advancedConfig",
	label = "nginx-config.label",
	id = "advancedConfig",
}: Props) {
	return (
		<Field name={name}>
			{({ field }: any) => (
				<div className="mt-3">
					<label htmlFor={id} className="form-label">
						<T id={label} />
					</label>
					<CodeEditor
						language="nginx"
						placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
						padding={15}
						data-color-mode="dark"
						minHeight={200}
						indentWidth={2}
						style={{
							fontFamily: "ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
							borderRadius: "0.3rem",
							minHeight: "200px",
							backgroundColor: "var(--tblr-bg-surface-dark)",
						}}
						{...field}
					/>
				</div>
			)}
		</Field>
	);
}
