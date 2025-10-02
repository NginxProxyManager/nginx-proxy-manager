import { useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { setPermissions } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useUser } from "src/hooks";
import { T } from "src/locale";

interface Props {
	userId: number;
	onClose: () => void;
}
export function PermissionsModal({ userId, onClose }: Props) {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const { data, isLoading, error } = useUser(userId);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			await setPermissions(userId, values);
			onClose();
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: ["user"] });
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		}
		setSubmitting(false);
		setIsSubmitting(false);
	};

	const getPermissionButtons = (field: any, form: any) => {
		return (
			<div>
				<div className="btn-group w-100" role="group">
					<input
						type="radio"
						className="btn-check"
						name="btn-radio-basic"
						id={`${field.name}-manage`}
						autoComplete="off"
						value="manage"
						checked={field.value === "manage"}
						onChange={() => form.setFieldValue(field.name, "manage")}
					/>
					<label htmlFor={`${field.name}-manage`} className={cn("btn", { active: field.value === "manage" })}>
						<T id="permissions.manage" />
					</label>
					<input
						type="radio"
						className="btn-check"
						name="btn-radio-basic"
						id={`${field.name}-view`}
						autoComplete="off"
						value="view"
						checked={field.value === "view"}
						onChange={() => form.setFieldValue(field.name, "view")}
					/>
					<label htmlFor={`${field.name}-view`} className={cn("btn", { active: field.value === "view" })}>
						<T id="permissions.view" />
					</label>
					<input
						type="radio"
						className="btn-check"
						name="btn-radio-basic"
						id={`${field.name}-hidden`}
						autoComplete="off"
						value="hidden"
						checked={field.value === "hidden"}
						onChange={() => form.setFieldValue(field.name, "hidden")}
					/>
					<label htmlFor={`${field.name}-hidden`} className={cn("btn", { active: field.value === "hidden" })}>
						<T id="permissions.hidden" />
					</label>
				</div>
			</div>
		);
	};

	const isAdmin = data?.roles.indexOf("admin") !== -1;

	return (
		<Modal show onHide={onClose} animation={false}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<Formik
					initialValues={
						{
							visibility: data.permissions?.visibility,
							accessLists: data.permissions?.accessLists,
							certificates: data.permissions?.certificates,
							deadHosts: data.permissions?.deadHosts,
							proxyHosts: data.permissions?.proxyHosts,
							redirectionHosts: data.permissions?.redirectionHosts,
							streams: data.permissions?.streams,
						} as any
					}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id="user.set-permissions" data={{ name: data?.name }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!error} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<div className="mb-3">
									<label htmlFor="asd" className="form-label">
										<T id="permissions.visibility.title" />
									</label>
									<Field name="visibility">
										{({ field, form }: any) => (
											<div className="btn-group w-100" role="group">
												<input
													type="radio"
													className="btn-check"
													name="btn-radio-basic"
													id={`${field.name}-user`}
													autoComplete="off"
													value="user"
													checked={field.value === "user"}
													onChange={() => form.setFieldValue(field.name, "user")}
												/>
												<label
													htmlFor={`${field.name}-user`}
													className={cn("btn", { active: field.value === "user" })}
												>
													<T id="permissions.visibility.user" />
												</label>
												<input
													type="radio"
													className="btn-check"
													name="btn-radio-basic"
													id={`${field.name}-all`}
													autoComplete="off"
													value="all"
													checked={field.value === "all"}
													onChange={() => form.setFieldValue(field.name, "all")}
												/>
												<label
													htmlFor={`${field.name}-all`}
													className={cn("btn", { active: field.value === "all" })}
												>
													<T id="permissions.visibility.all" />
												</label>
											</div>
										)}
									</Field>
								</div>
								{!isAdmin && (
									<>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												<T id="proxy-hosts.title" />
											</label>
											<Field name="proxyHosts">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												<T id="redirection-hosts.title" />
											</label>
											<Field name="redirectionHosts">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												<T id="dead-hosts.title" />
											</label>
											<Field name="deadHosts">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												<T id="streams.title" />
											</label>
											<Field name="streams">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												<T id="access.title" />
											</label>
											<Field name="accessLists">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												<T id="certificates.title" />
											</label>
											<Field name="certificates">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
									</>
								)}
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={onClose} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
}
