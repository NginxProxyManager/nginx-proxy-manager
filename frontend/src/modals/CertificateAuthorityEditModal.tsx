import {
	Button,
	Checkbox,
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
import { CertificateAuthority } from "api/npm";
import { PrettyButton } from "components";
import { Formik, Form, Field } from "formik";
import { useCertificateAuthority, useSetCertificateAuthority } from "hooks";
import { intl } from "locale";
import { validateNumber, validateString } from "modules/Validations";

interface CertificateAuthorityEditModalProps {
	editId: number;
	isOpen: boolean;
	onClose: () => void;
}
function CertificateAuthorityEditModal({
	editId,
	isOpen,
	onClose,
}: CertificateAuthorityEditModalProps) {
	const toast = useToast();
	const { status, data } = useCertificateAuthority(editId);
	const { mutate: setCertificateAuthority } = useSetCertificateAuthority();

	const onSubmit = async (
		payload: CertificateAuthority,
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

		setCertificateAuthority(payload, {
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
			onSuccess: () => onClose(),
			onSettled: () => setSubmitting(false),
		});
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={() => {
				onClose();
			}}
			closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent>
				{status === "loading" ? (
					// todo nicer
					<p>loading</p>
				) : (
					<Formik
						initialValues={
							{
								id: data?.id,
								name: data?.name,
								acmeshServer: data?.acmeshServer,
								caBundle: data?.caBundle,
								maxDomains: data?.maxDomains,
								isWildcardSupported: data?.isWildcardSupported,
							} as CertificateAuthority
						}
						onSubmit={onSubmit}>
						{({ isSubmitting }) => (
							<Form>
								<ModalHeader>
									{intl.formatMessage({ id: "certificate-authority.edit" })}
								</ModalHeader>
								<ModalCloseButton />
								<ModalBody>
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
										<Field
											name="acmeshServer"
											validate={validateString(2, 255)}>
											{({ field, form }: any) => (
												<FormControl
													isRequired
													isInvalid={
														form.errors.acmeshServer &&
														form.touched.acmeshServer
													}>
													<FormLabel htmlFor="acmeshServer">
														{intl.formatMessage({
															id: "certificate-authority.acmesh-server",
														})}
													</FormLabel>
													<Input
														{...field}
														id="acmeshServer"
														placeholder="https://example.com/acme/directory"
													/>
													<FormErrorMessage>
														{form.errors.acmeshServer}
													</FormErrorMessage>
												</FormControl>
											)}
										</Field>
										<Field name="caBundle" validate={validateString(2, 255)}>
											{({ field, form }: any) => (
												<FormControl
													isRequired
													isInvalid={
														form.errors.caBundle && form.touched.caBundle
													}>
													<FormLabel htmlFor="caBundle">
														{intl.formatMessage({
															id: "certificate-authority.ca-bundle",
														})}
													</FormLabel>
													<Input
														{...field}
														id="caBundle"
														placeholder="/path/to/certs/custom-ca-bundle.crt"
													/>
													<FormErrorMessage>
														{form.errors.caBundle}
													</FormErrorMessage>
												</FormControl>
											)}
										</Field>
										<Field
											name="maxDomains"
											validate={validateNumber(1)}
											type="number">
											{({ field, form }: any) => (
												<FormControl
													isRequired
													isInvalid={
														form.errors.maxDomains && form.touched.maxDomains
													}>
													<FormLabel htmlFor="maxDomains">
														{intl.formatMessage({
															id: "certificate-authority.max-domains",
														})}
													</FormLabel>
													<Input {...field} id="maxDomains" type="number" />
													<FormErrorMessage>
														{form.errors.maxDomains}
													</FormErrorMessage>
												</FormControl>
											)}
										</Field>
										<Field name="isWildcardSupported" type="checkbox">
											{({ field, form }: any) => (
												<FormControl
													isInvalid={
														form.errors.isWildcardSupported &&
														form.touched.isWildcardSupported
													}>
													<Checkbox
														{...field}
														isChecked={field.checked}
														size="md"
														colorScheme="green">
														{intl.formatMessage({
															id: "certificate-authority.has-wildcard-support",
														})}
													</Checkbox>
													<FormErrorMessage>
														{form.errors.isWildcardSupported}
													</FormErrorMessage>
												</FormControl>
											)}
										</Field>
									</Stack>
								</ModalBody>
								<ModalFooter>
									<PrettyButton mr={3} isLoading={isSubmitting}>
										{intl.formatMessage({ id: "form.save" })}
									</PrettyButton>
									<Button onClick={onClose} isLoading={isSubmitting}>
										{intl.formatMessage({ id: "form.cancel" })}
									</Button>
								</ModalFooter>
							</Form>
						)}
					</Formik>
				)}
			</ModalContent>
		</Modal>
	);
}

export { CertificateAuthorityEditModal };
