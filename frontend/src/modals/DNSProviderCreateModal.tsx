import { useEffect, useState } from "react";

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
	Select,
	Stack,
	useToast,
} from "@chakra-ui/react";
import {
	DNSProvider,
	DNSProvidersAcmesh,
	DNSProvidersAcmeshField,
} from "api/npm";
import { PrettyButton } from "components";
import { Formik, Form, Field } from "formik";
import { useSetDNSProvider, useDNSProvidersAcmesh } from "hooks";
import { intl } from "locale";

interface DNSProviderCreateModalProps {
	isOpen: boolean;
	onClose: () => void;
}
function DNSProviderCreateModal({
	isOpen,
	onClose,
}: DNSProviderCreateModalProps) {
	const toast = useToast();
	const { mutate: setDNSProvider } = useSetDNSProvider();
	const {
		isLoading: acmeshIsLoading,
		// isError: acmeshIsError,
		// error: acmeshError,
		data: acmeshDataResp,
	} = useDNSProvidersAcmesh();

	const [acmeshData, setAcmeshData] = useState([] as DNSProvidersAcmesh[]);
	const [acmeshItem, setAcmeshItem] = useState("");

	useEffect(() => {
		setAcmeshData(acmeshDataResp || []);
	}, [acmeshDataResp]);

	const onSubmit = async (
		payload: DNSProvider,
		{ setErrors, setSubmitting }: any,
	) => {
		console.log("PAYLOAD:", payload);
		// return;

		// TODO: filter out the meta object and only include items that apply to the acmesh provider selected

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

		setDNSProvider(payload, {
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

	const getAcmeshItem = (name: string): DNSProvidersAcmesh | undefined => {
		return acmeshData.find((item) => item.acmeshName === name);
	};

	const renderInputType = (
		field: any,
		f: DNSProvidersAcmeshField,
		value: any,
	) => {
		if (f.type === "bool") {
			return (
				<Checkbox {...field} size="md" colorScheme="orange" isChecked={value}>
					{f.name}
				</Checkbox>
			);
		}

		return (
			<Input {...field} id={f.metaKey} type={f.type} defaultValue={value} />
		);
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick={false}>
			<ModalOverlay />
			<ModalContent>
				{acmeshIsLoading ? (
					"loading"
				) : (
					<Formik
						initialValues={
							{
								acmeshName: "",
								name: "",
								dnsSleep: 0,
								meta: {},
							} as DNSProvider
						}
						onSubmit={onSubmit}>
						{({ isSubmitting, handleChange, values, setValues }) => (
							<Form>
								<ModalHeader>
									{intl.formatMessage({ id: "dns-provider.create" })}
								</ModalHeader>
								<ModalCloseButton />
								<ModalBody>
									<Stack spacing={4}>
										<Field name="acmeshName">
											{({ field, form }: any) => (
												<FormControl
													isRequired
													isInvalid={
														form.errors.acmeshName && form.touched.acmeshName
													}>
													<FormLabel htmlFor="acmeshName">
														{intl.formatMessage({
															id: "dns-provider.acmesh-name",
														})}
													</FormLabel>
													<Select
														{...field}
														id="acmeshName"
														onChange={(e: any) => {
															handleChange(e);
															setAcmeshItem(e.target.value);
														}}>
														<option value="" />
														{acmeshData.map((item: DNSProvidersAcmesh) => {
															return (
																<option
																	key={item.acmeshName}
																	value={item.acmeshName}>
																	{intl.formatMessage({
																		id: `acmesh.${item.acmeshName}`,
																	})}
																</option>
															);
														})}
													</Select>
													<FormErrorMessage>
														{form.errors.acmeshName}
													</FormErrorMessage>
												</FormControl>
											)}
										</Field>
										{acmeshItem !== "" ? <hr /> : null}
										{getAcmeshItem(acmeshItem)?.fields.map((f) => {
											const name = `meta[${f.metaKey}]`;
											return (
												<Field
													name={name}
													type={f.type === "bool" ? "checkbox" : undefined}>
													{({ field, form }: any) => (
														<FormControl
															isRequired={f.isRequired}
															isInvalid={
																form.errors[name] && form.touched[name]
															}>
															{f.type !== "bool" ? (
																<FormLabel htmlFor={name}>{f.name}</FormLabel>
															) : null}
															{renderInputType(
																field,
																f,
																values.meta[f.metaKey],
															)}
															<FormErrorMessage>
																{form.errors[name]}
															</FormErrorMessage>
														</FormControl>
													)}
												</Field>
											);
										})}
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

export { DNSProviderCreateModal };
