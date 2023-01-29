import { useState } from "react";

import {
	Button,
	ButtonGroup,
	FormControl,
	FormErrorMessage,
	FormLabel,
	Input,
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
import { Certificate } from "api/npm";
import { PrettyButton } from "components";
import { Formik, Form, Field } from "formik";
import { useSetCertificate } from "hooks";
import { intl } from "locale";
import { validateString } from "modules/Validations";

import HTTPForm from "./HTTPForm";

interface CertificateCreateModalProps {
	isOpen: boolean;
	onClose: () => void;
}
function CertificateCreateModal({
	isOpen,
	onClose,
}: CertificateCreateModalProps) {
	const [certType, setCertType] = useState("");
	const toast = useToast();
	const { mutate: setCertificate } = useSetCertificate();

	const onModalClose = () => {
		onClose();
		setCertType("");
	};

	const onSubmit = async (
		payload: Certificate,
		{ setErrors, setSubmitting }: any,
	) => {
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
				if (err.message === "ca-bundle-does-not-exist") {
					setErrors({
						caBundle: intl.formatMessage({
							id: `error.${err.message}`,
						}),
					});
				} else {
					showErr(err.message);
				}
			},
			onSuccess: () => onModalClose(),
			onSettled: () => setSubmitting(false),
		});
	};

	return (
		<Modal isOpen={isOpen} onClose={onModalClose} closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent>
				<Formik
					initialValues={
						{
							name: "",
							acmeshServer: "",
							caBundle: "",
							maxDomains: 5,
							isWildcardSupported: false,
						} as Certificate
					}
					onSubmit={onSubmit}>
					{({ isSubmitting }) => (
						<Form>
							<ModalHeader>
								{intl.formatMessage({ id: "certificate.create" })}
							</ModalHeader>
							<ModalCloseButton />
							<ModalBody>
								{certType === "" ? (
									<FormControl>
										<FormLabel htmlFor="type">
											Select the Certificate Validation method
										</FormLabel>
										<ButtonGroup style={{ width: "100%" }}>
											<Button
												onClick={() => setCertType("http")}
												style={{ width: "33%" }}>
												{intl.formatMessage({ id: "type.http" })}
											</Button>
											<Button
												onClick={() => setCertType("dns")}
												style={{ width: "34%" }}>
												{intl.formatMessage({ id: "type.dns" })}
											</Button>
											<Button
												onClick={() => setCertType("custom")}
												style={{ width: "33%" }}>
												{intl.formatMessage({ id: "type.custom" })}
											</Button>
										</ButtonGroup>
									</FormControl>
								) : null}

								{certType !== "" ? (
									<Stack spacing={4}>
										<Field name="name" validate={validateString(1, 100)}>
											{({ field, form }: any) => (
												<FormControl
													isRequired
													isInvalid={form.errors.name && form.touched.name}>
													<FormLabel htmlFor="name">
														{intl.formatMessage({
															id: "name",
														})}
													</FormLabel>
													<Input
														{...field}
														id="name"
														placeholder={intl.formatMessage({
															id: "name",
														})}
													/>
													<FormErrorMessage>
														{form.errors.name}
													</FormErrorMessage>
												</FormControl>
											)}
										</Field>
									</Stack>
								) : null}

								{certType === "http" ? <HTTPForm /> : null}
							</ModalBody>
							<ModalFooter>
								{certType !== "" ? (
									<PrettyButton mr={3} isLoading={isSubmitting}>
										{intl.formatMessage({ id: "form.save" })}
									</PrettyButton>
								) : null}
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
