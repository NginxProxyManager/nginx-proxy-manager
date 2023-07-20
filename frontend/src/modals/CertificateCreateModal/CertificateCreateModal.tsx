import {
	Button,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	ModalFooter,
	Stack,
	useToast,
} from "@chakra-ui/react";
import { Formik, Form } from "formik";

import { Certificate } from "src/api/npm";
import { PrettyButton } from "src/components";
import { useSetCertificate } from "src/hooks";
import { intl } from "src/locale";

import CustomForm from "./CustomForm";
import DNSForm from "./DNSForm";
import HTTPForm from "./HTTPForm";
import MKCertForm from "./MKCertForm";

interface CertificateCreateModalProps {
	isOpen: boolean;
	onClose: () => void;
	certType: string;
}
function CertificateCreateModal({
	isOpen,
	onClose,
	certType,
}: CertificateCreateModalProps) {
	const toast = useToast();
	const { mutate: setCertificate } = useSetCertificate();

	const onModalClose = () => {
		onClose();
	};

	const onSubmit = async (
		payload: Certificate,
		{ /*setErrors,*/ setSubmitting }: any,
	) => {
		payload.type = certType;
		const showErr = (msg: string) => {
			toast({
				description: intl.formatMessage({
					id: `error.${msg}`,
				}),
				status: "error",
				position: "top",
				duration: 3000,
				isClosable: true,
			});
		};

		setCertificate(payload, {
			onError: (err: any) => {
				showErr(err.message);
				/*
				if (err.message === "ca-bundle-does-not-exist") {
					setErrors({
						caBundle: intl.formatMessage({
							id: `error.${err.message}`,
						}),
					});
				} else {
					showErr(err.message);
				}*/
			},
			onSuccess: () => onModalClose(),
			onSettled: () => setSubmitting(false),
		});
	};

	const getInitialValues = (type: string): any => {
		switch (type) {
			case "http":
				return {
					certificateAuthorityId: 0,
					name: "",
					domainNames: [],
					isEcc: false,
				} as any;
			case "dns":
				return {
					certificateAuthorityId: 0,
					dnsProviderId: 0,
					name: "",
					domainNames: [],
					isEcc: false,
				} as any;
			case "custom":
				return {
					name: "",
					domainNames: [],
					// isEcc: false, // todo, required?
					// todo: add meta?
				} as any;
			case "mkcert":
				return {
					name: "",
					domainNames: [],
					// isEcc: false, // todo, supported?
					// todo: add meta?
				} as any;
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onModalClose} closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent>
				<Formik initialValues={getInitialValues(certType)} onSubmit={onSubmit}>
					{({ isSubmitting }) => (
						<Form>
							<ModalHeader>
								{intl.formatMessage({ id: "certificate.create" })}
							</ModalHeader>
							<ModalCloseButton />
							<ModalBody>
								<Stack spacing={4}>
									{certType === "http" ? <HTTPForm /> : null}
									{certType === "dns" ? <DNSForm /> : null}
									{certType === "custom" ? <CustomForm /> : null}
									{certType === "mkcert" ? <MKCertForm /> : null}
								</Stack>
							</ModalBody>
							<ModalFooter>
								<PrettyButton mr={3} isLoading={isSubmitting}>
									{intl.formatMessage({ id: "form.save" })}
								</PrettyButton>
								<Button onClick={onModalClose} isLoading={isSubmitting}>
									{intl.formatMessage({ id: "form.cancel" })}
								</Button>
							</ModalFooter>
						</Form>
					)}
				</Formik>
			</ModalContent>
		</Modal>
	);
}

export { CertificateCreateModal };
