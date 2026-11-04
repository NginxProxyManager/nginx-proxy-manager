import { Field } from "formik";
import { T } from "src/locale";

export interface CertificateFilesValues {
	certificate: File | null;
	certificateKey: File | null;
	intermediateCertificate: File | null;
}

export const certificateFilesInitialValues: CertificateFilesValues = {
	certificate: null,
	certificateKey: null,
	intermediateCertificate: null,
};

/**
 * Builds the multipart payload expected by the certificate validate/upload endpoints
 */
export const certificateFilesToFormData = ({
	certificate,
	certificateKey,
	intermediateCertificate,
}: CertificateFilesValues): FormData => {
	const formData = new FormData();
	formData.append("certificate", certificate as Blob);
	formData.append("certificate_key", certificateKey as Blob);
	if (intermediateCertificate !== null) {
		formData.append("intermediate_certificate", intermediateCertificate);
	}
	return formData;
};

interface FileFieldProps {
	name: keyof CertificateFilesValues;
	label: string;
	required?: boolean;
	onChange?: () => void;
}
function CertificateFileField({ name, label, required, onChange }: FileFieldProps) {
	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label htmlFor={name} className="form-label">
						<T id={label} />
					</label>
					<input
						id={name}
						type="file"
						required={required}
						autoComplete="off"
						className="form-control"
						onChange={(event) => {
							form.setFieldValue(
								field.name,
								event.currentTarget.files?.length ? event.currentTarget.files[0] : null,
							);
							onChange?.();
						}}
					/>
					{form.errors[name] ? (
						<div className="invalid-feedback">
							{form.errors[name] && form.touched[name] ? form.errors[name] : null}
						</div>
					) : null}
				</div>
			)}
		</Field>
	);
}

interface Props {
	// Called after any of the files changes
	onChange?: () => void;
}
export function CertificateFilesFields({ onChange }: Props) {
	return (
		<>
			<CertificateFileField
				name="certificateKey"
				label="certificate.custom-certificate-key"
				required
				onChange={onChange}
			/>
			<CertificateFileField
				name="certificate"
				label="certificate.custom-certificate"
				required
				onChange={onChange}
			/>
			<CertificateFileField
				name="intermediateCertificate"
				label="certificate.custom-intermediate"
				onChange={onChange}
			/>
		</>
	);
}
