import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	deletePasskey,
	getPasskeyRegOptions,
	listPasskeys,
	renamePasskey,
	verifyPasskeyRegistration,
	type PasskeyCredential,
} from "src/api/backend";
import { Button } from "src/components";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";

type Step = "loading" | "list" | "register-name" | "confirm-delete";

const showPasskeyModal = (id: number | "me") => {
	EasyModal.show(PasskeyModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me";
}

const PasskeyModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [error, setError] = useState<ReactNode | null>(null);
	const [step, setStep] = useState<Step>("loading");
	const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<PasskeyCredential | null>(null);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editingName, setEditingName] = useState("");

	const loadPasskeys = useCallback(async () => {
		try {
			const result = await listPasskeys(id);
			setPasskeys(result);
			setStep("list");
		} catch (err: any) {
			setError(err.message || "Failed to load passkeys");
			setStep("list");
		}
	}, [id]);

	useEffect(() => {
		loadPasskeys();
	}, [loadPasskeys]);

	const handleRegister = async (values: { friendlyName: string }) => {
		setError(null);
		setIsSubmitting(true);
		try {
			const { options, challengeToken } = await getPasskeyRegOptions(id);
			const credential = await startRegistration({ optionsJSON: options });
			await verifyPasskeyRegistration(
				id,
				challengeToken,
				JSON.stringify(credential),
				values.friendlyName,
			);
			await loadPasskeys();
		} catch (err: any) {
			if (err.name === "NotAllowedError") {
				setError("Registration was cancelled or not allowed");
			} else {
				setError(err.message || "Failed to register passkey");
			}
		}
		setIsSubmitting(false);
	};

	const handleRename = async (passkeyId: number) => {
		if (!editingName.trim()) return;
		setError(null);
		try {
			await renamePasskey(id, passkeyId, editingName.trim());
			setEditingId(null);
			setEditingName("");
			await loadPasskeys();
		} catch (err: any) {
			setError(err.message || "Failed to rename passkey");
		}
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		setError(null);
		setIsSubmitting(true);
		try {
			await deletePasskey(id, deleteTarget.id);
			setDeleteTarget(null);
			setStep("list");
			await loadPasskeys();
		} catch (err: any) {
			setError(err.message || "Failed to delete passkey");
		}
		setIsSubmitting(false);
	};

	const renderContent = () => {
		if (step === "loading") {
			return (
				<div className="text-center py-4">
					<div className="spinner-border" role="status">
						<span className="visually-hidden">Loading...</span>
					</div>
				</div>
			);
		}

		if (step === "confirm-delete" && deleteTarget) {
			return (
				<div className="py-2">
					<Alert variant="warning">
						<T id="passkey.delete-confirm" />
					</Alert>
					<p className="fw-bold text-center mb-3">
						{deleteTarget.friendlyName || `Passkey #${deleteTarget.id}`}
					</p>
					<div className="d-flex gap-2">
						<Button
							type="button"
							fullWidth
							onClick={() => {
								setDeleteTarget(null);
								setStep("list");
							}}
							disabled={isSubmitting}
						>
							<T id="cancel" />
						</Button>
						<Button
							type="button"
							fullWidth
							color="red"
							onClick={handleDelete}
							isLoading={isSubmitting}
						>
							<T id="passkey.delete" />
						</Button>
					</div>
				</div>
			);
		}

		if (step === "register-name") {
			return (
				<div className="py-2">
					<Formik initialValues={{ friendlyName: "" }} onSubmit={handleRegister}>
						{() => (
							<Form>
								<Field name="friendlyName" validate={validateString(1, 255)}>
									{({ field, form }: any) => (
										<label className="mb-3 d-block">
											<span className="form-label">
												<T id="passkey.friendly-name" />
											</span>
											<input
												{...field}
												type="text"
												className={`form-control ${form.errors.friendlyName && form.touched.friendlyName ? "is-invalid" : ""}`}
												placeholder="e.g. MacBook Touch ID"
												maxLength={255}
											/>
											<div className="invalid-feedback">{form.errors.friendlyName}</div>
										</label>
									)}
								</Field>
								<div className="d-flex gap-2">
									<Button
										type="button"
										fullWidth
										onClick={() => setStep("list")}
										disabled={isSubmitting}
									>
										<T id="cancel" />
									</Button>
									<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
										<T id="passkey.register" />
									</Button>
								</div>
							</Form>
						)}
					</Formik>
				</div>
			);
		}

		// step === "list"
		return (
			<div className="py-2">
				{passkeys.length === 0 ? (
					<div className="text-center text-muted mb-3">
						<p className="mb-1">
							<T id="passkey.no-passkeys" />
						</p>
						<p className="small">
							<T id="passkey.no-passkeys-description" />
						</p>
					</div>
				) : (
					<div className="list-group list-group-flush mb-3">
						{passkeys.map((passkey) => (
							<div key={passkey.id} className="list-group-item px-0">
								<div className="d-flex justify-content-between align-items-start">
									<div className="flex-grow-1">
										{editingId === passkey.id ? (
											<div className="d-flex gap-2 mb-1">
												<input
													type="text"
													className="form-control form-control-sm"
													value={editingName}
													onChange={(e) => setEditingName(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") handleRename(passkey.id);
														if (e.key === "Escape") {
															setEditingId(null);
															setEditingName("");
														}
													}}
												/>
												<Button
													type="button"
													color="azure"
													onClick={() => handleRename(passkey.id)}
												>
													<T id="save" />
												</Button>
											</div>
										) : (
											<div className="fw-bold mb-1">
												{passkey.friendlyName || `Passkey #${passkey.id}`}
											</div>
										)}
										<div className="small text-muted">
											<span className={`badge me-1 ${passkey.deviceType === "multiDevice" ? "bg-azure-lt" : "bg-secondary-lt"}`}>
												{passkey.deviceType === "multiDevice"
													? <T id="passkey.device-type.multi" />
													: <T id="passkey.device-type.single" />}
											</span>
											{passkey.backedUp && (
												<span className="badge bg-green-lt me-1">
													<T id="passkey.backed-up" />
												</span>
											)}
											<span className="ms-1">
												{new Date(passkey.createdOn).toLocaleDateString()}
											</span>
										</div>
									</div>
									{editingId !== passkey.id && (
										<div className="d-flex gap-1">
											<button
												type="button"
												className="btn btn-ghost-primary btn-sm"
												onClick={() => {
													setEditingId(passkey.id);
													setEditingName(passkey.friendlyName || "");
												}}
											>
												<T id="passkey.rename" />
											</button>
											<button
												type="button"
												className="btn btn-ghost-danger btn-sm"
												onClick={() => {
													setDeleteTarget(passkey);
													setStep("confirm-delete");
												}}
											>
												<T id="passkey.delete" />
											</button>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
				<Button
					fullWidth
					color="azure"
					onClick={() => setStep("register-name")}
				>
					<T id="passkey.register" />
				</Button>
			</div>
		);
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="passkey.title" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="danger" show={!!error} onClose={() => setError(null)} dismissible>
					{error}
				</Alert>
				{renderContent()}
			</Modal.Body>
		</Modal>
	);
});

export { showPasskeyModal };
