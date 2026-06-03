import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, Field } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import CodeEditor from "@uiw/react-textarea-code-editor";
import { createCredential, updateCredential } from "src/api/backend";
import type { StoredCredential } from "src/api/backend/getCredentials";
import { Button } from "src/components";
import { useDnsProviders } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showCredentialModal = (item?: StoredCredential) => {
	EasyModal.show(CredentialModal, { item });
};

interface Props extends InnerModalProps {
	item?: StoredCredential;
}

const CredentialModal = EasyModal.create(({ item, visible, remove }: Props) => {
	const { data: dnsProviders, isLoading } = useDnsProviders();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isNew = !item?.id;

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			if (isNew) {
				await createCredential(values);
				showObjectSuccess("credential", "saved");
			} else {
				await updateCredential(item.id, values);
				showObjectSuccess("credential", "saved");
			}
			remove();
		} catch (err: any) {
			setErrorMsg(err.message || "Error");
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Modal show={visible} onHide={remove} size="lg">
			<Formik
				initialValues={{
					name: item?.name || "",
					dnsProvider: item?.dnsProvider || "",
					credentials: "",
				}}
				onSubmit={onSubmit}
			>
				{() => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T id={isNew ? "object.add" : "object.edit"} tData={{ object: "credential" }} />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>
							<div className="mb-3">
								<label className="form-label" htmlFor="credName">
									<T id="column.name" />
								</label>
								<Field id="credName" name="name" className="form-control" required />
							</div>
							<div className="mb-3">
								<label className="form-label" htmlFor="credProvider">
									<T id="certificates.dns.provider" />
								</label>
								<Field as="select" id="credProvider" name="dnsProvider" className="form-select" disabled={!isNew}>
									<option value="">{isLoading ? "..." : ""}</option>
									{dnsProviders?.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
										</option>
									))}
								</Field>
							</div>
							<div className="mb-3">
								<label className="form-label">
									<T id="certificates.dns.credentials" />
									{!isNew ? " (leave empty to keep existing)" : null}
								</label>
								<Field name="credentials">
									{({ field }: any) => (
										<CodeEditor
											language="ini"
											data-color-mode="dark"
											minHeight={120}
											value={field.value}
											onChange={(e) => field.onChange({ target: { name: field.name, value: e.target.value } })}
										/>
									)}
								</Field>
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button variant="link" onClick={remove}>
								<T id="cancel" />
							</Button>
							<Button type="submit" className="btn-cyan" disabled={isSubmitting}>
								<T id="save" />
							</Button>
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});

export { showCredentialModal };
