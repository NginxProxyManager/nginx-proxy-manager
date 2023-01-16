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
import Ajv, { Schema } from "ajv";
import {
	DNSProvider,
	DNSProvidersAcmesh,
	DNSProvidersAcmeshProperty,
} from "api/npm";
import { PrettyButton } from "components";
import { Formik, Form, Field, getIn } from "formik";
import { useSetDNSProvider, useDNSProvidersAcmesh } from "hooks";
import { intl } from "locale";
import { validateString } from "modules/Validations";

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
	const { isLoading: acmeshIsLoading, data: acmeshDataResp } =
		useDNSProvidersAcmesh();

	const [acmeshData, setAcmeshData] = useState([] as DNSProvidersAcmesh[]);
	const [acmeshItem, setAcmeshItem] = useState("");

	useEffect(() => {
		setAcmeshData(acmeshDataResp || []);
	}, [acmeshDataResp]);

	const onModalClose = () => {
		setAcmeshItem("");
		onClose();
	};

	const getAcmeshItem = (name: string): DNSProvidersAcmesh | undefined => {
		return acmeshData.find((item) => item.title === name);
	};

	const fullItem = getAcmeshItem(acmeshItem);
	const itemProperties = fullItem?.properties;

	const onSubmit = async (
		payload: DNSProvider,
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

		const ajv = new Ajv({ strictSchema: false });
		try {
			const valid = ajv.validate(fullItem as Schema, payload.meta);
			if (!valid) {
				let errs: any = {};
				ajv.errors?.forEach((e: any) => {
					errs["meta"] = {
						[e.instancePath.substring(1)]: e.message,
					};
				});
				setErrors(errs);
				setSubmitting(false);
			} else {
				// Json schema is happy
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
					onSuccess: () => onModalClose(),
					onSettled: () => setSubmitting(false),
				});
			}
		} catch (err: any) {
			showErr(err);
			setSubmitting(false);
		}
	};

	const renderInputType = (
		field: any,
		fieldName: string,
		f: DNSProvidersAcmeshProperty,
		value: any,
	) => {
		if (["bool", "boolean"].indexOf(f.type) !== -1) {
			return (
				<Checkbox size="md" colorScheme="orange" isChecked={value} {...field}>
					{f.title}
				</Checkbox>
			);
		}

		let type = "text";
		let props: any = {};

		if (f.type === "string") {
			props.minLength = f.minLength || null;
			props.maxLength = f.maxLength || null;
			props.pattern = f.pattern || null;
		}
		if (f.type === "integer") {
			type = "number";
			props.min = f.minimum || null;
			props.max = f.maximum || null;
		}
		if (f.isSecret) {
			type = "password";
		}

		return (
			<Input
				{...field}
				id={fieldName}
				type={type}
				defaultValue={value}
				placeholder={fieldName}
				{...props}
			/>
		);
	};

	return (
		<Modal isOpen={isOpen} onClose={onModalClose} closeOnOverlayClick={false}>
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
																<option key={item.title} value={item.title}>
																	{intl.formatMessage({
																		id: `acmesh.${item.title}`,
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
										{acmeshItem !== "" ? (
											<>
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
												{itemProperties
													? Object.keys(itemProperties).map((fieldName, _) => {
															const f = itemProperties[fieldName];
															const name = `meta[${fieldName}]`;
															return (
																<Field
																	name={`meta[${fieldName}]`}
																	type={
																		f.type === "boolean"
																			? "checkbox"
																			: undefined
																	}>
																	{({ field, form }: any) => (
																		<FormControl
																			isRequired={
																				fullItem?.required.indexOf(
																					fieldName,
																				) !== -1
																			}
																			isInvalid={
																				getIn(form.errors, name) &&
																				getIn(form.touched, name)
																			}>
																			{f.type !== "bool" ? (
																				<FormLabel htmlFor={name}>
																					{intl.formatMessage({
																						id: `acmesh-property.${f.title}`,
																					})}
																				</FormLabel>
																			) : null}
																			{renderInputType(
																				field,
																				fieldName,
																				f,
																				values.meta[f.title],
																			)}
																			<FormErrorMessage>
																				{form.errors?.meta?.[fieldName]}
																			</FormErrorMessage>
																		</FormControl>
																	)}
																</Field>
															);
													  })
													: null}
											</>
										) : null}
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
				)}
			</ModalContent>
		</Modal>
	);
}

export { DNSProviderCreateModal };
