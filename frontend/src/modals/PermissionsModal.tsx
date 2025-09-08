import { useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { setPermissions } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useUser } from "src/hooks";
import { intl } from "src/locale";

interface Props {
	userId: number;
	onClose: () => void;
}
export function PermissionsModal({ userId, onClose }: Props) {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const { data, isLoading, error } = useUser(userId);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setErrorMsg(null);
		try {
			await setPermissions(userId, values);
			onClose();
			queryClient.invalidateQueries({ queryKey: ["users"] });
			queryClient.invalidateQueries({ queryKey: ["user"] });
		} catch (err: any) {
			setErrorMsg(intl.formatMessage({ id: err.message }));
		}
		setSubmitting(false);
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
						{intl.formatMessage({ id: "permissions.manage" })}
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
						{intl.formatMessage({ id: "permissions.view" })}
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
						{intl.formatMessage({ id: "permissions.hidden" })}
					</label>
				</div>
			</div>
		);
	};

	const isAdmin = data?.roles.indexOf("admin") !== -1;

	return (
		<Modal show onHide={onClose} animation={false}>
			{!isLoading && error && <Alert variant="danger">{error?.message || "Unknown error"}</Alert>}
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
					{({ isSubmitting }) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									{intl.formatMessage({ id: "user.set-permissions" }, { name: data?.name })}
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!error} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<div className="mb-3">
									<label htmlFor="asd" className="form-label">
										{intl.formatMessage({ id: "permissions.visibility.title" })}
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
													{intl.formatMessage({ id: "permissions.visibility.user" })}
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
													{intl.formatMessage({ id: "permissions.visibility.all" })}
												</label>
											</div>
										)}
									</Field>
								</div>
								{!isAdmin && (
									<>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												{intl.formatMessage({ id: "proxy-hosts.title" })}
											</label>
											<Field name="proxyHosts">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												{intl.formatMessage({ id: "redirection-hosts.title" })}
											</label>
											<Field name="redirectionHosts">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												{intl.formatMessage({ id: "dead-hosts.title" })}
											</label>
											<Field name="deadHosts">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												{intl.formatMessage({ id: "streams.title" })}
											</label>
											<Field name="streams">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												{intl.formatMessage({ id: "access.title" })}
											</label>
											<Field name="accessLists">
												{({ field, form }: any) => getPermissionButtons(field, form)}
											</Field>
										</div>
										<div className="mb-3">
											<label htmlFor="ignored" className="form-label">
												{intl.formatMessage({ id: "certificates.title" })}
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
									{intl.formatMessage({ id: "cancel" })}
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									{intl.formatMessage({ id: "save" })}
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
}
