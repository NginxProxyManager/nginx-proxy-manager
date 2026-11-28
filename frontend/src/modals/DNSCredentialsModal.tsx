import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { updateCertificateDnsCredentials } from "src/api/backend";
import { Button, DNSProviderFields, Loading } from "src/components";
import { FormModal } from "src/components/Form";
import { useCertificate } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

interface Props extends InnerModalProps {
	id: number;
}

const showDNSCredentialsModal = (id: number) => {
	EasyModal.show(DNSCredentialsModal, { id });
};

const DNSCredentialsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useCertificate(id);
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setErrorMsg(null);

		const ref = values.meta?.credentialRef;
		const inline = values.meta?.dnsProviderCredentials;
		const hasRef = ref?.type === "internal" ? !!ref.id : ref?.type === "external" ? !!ref.providerId : false;
		if (!hasRef && !inline?.trim()) {
			setErrorMsg(<T id="certificates.dns.credentials-required" />);
			setSubmitting(false);
			return;
		}

		setIsSubmitting(true);
		try {
			await updateCertificateDnsCredentials(
				id,
				hasRef ? { credentialRef: ref } : { dnsProviderCredentials: inline },
			);
			showObjectSuccess("certificate", "saved");
			queryClient.invalidateQueries({ queryKey: ["certificates"] });
			queryClient.invalidateQueries({ queryKey: ["certificate", id] });
			remove();
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	if (isLoading || error || !data) {
		return (
			<Modal show={visible} onHide={remove}>
				<Modal.Body>
					{isLoading ? <Loading noLogo /> : null}
					{error ? <Alert variant="danger">{error.message || "Unknown error"}</Alert> : null}
				</Modal.Body>
			</Modal>
		);
	}

	const currentRef = data.meta?.credentialRef;
	const initialSource =
		currentRef?.type === "internal" ? "internal" : currentRef?.type === "external" ? "external" : "manual";

	return (
		<FormModal
			show={visible}
			onHide={remove}
			preventHide={isSubmitting}
			initialValues={
				{
					meta: {
						dnsProvider: data.meta?.dnsProvider,
						credentialRef: currentRef,
					},
				} as any
			}
			onSubmit={onSubmit}
		>
			{({ onHide }) => (
				<Form>
					<Modal.Header closeButton>
						<Modal.Title>
							<T id="certificates.dns.change-credentials" />
						</Modal.Title>
					</Modal.Header>
					<Modal.Body className="p-0">
						<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
							{errorMsg}
						</Alert>
						<div className="card m-0 border-0">
							<div className="card-body">
								<p className="text-muted">
									<T id="certificates.dns.change-credentials.help" />
								</p>
								<DNSProviderFields
									fixedProvider={data.meta?.dnsProvider}
									initialSource={initialSource}
								/>
							</div>
						</div>
					</Modal.Body>
					<Modal.Footer>
						<Button data-bs-dismiss="modal" onClick={onHide} disabled={isSubmitting}>
							<T id="cancel" />
						</Button>
						<Button
							type="submit"
							actionType="primary"
							className="ms-auto bg-pink"
							isLoading={isSubmitting}
							disabled={isSubmitting}
						>
							<T id="save" />
						</Button>
					</Modal.Footer>
				</Form>
			)}
		</FormModal>
	);
});

export { showDNSCredentialsModal };
