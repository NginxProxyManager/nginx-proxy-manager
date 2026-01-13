import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	disable2FA,
	enable2FA,
	get2FAStatus,
	regenerateBackupCodes,
	start2FASetup,
} from "src/api/backend";
import { Button } from "src/components";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";

type Step = "loading" | "status" | "setup" | "verify" | "backup" | "disable";

const showTwoFactorModal = (id: number | "me") => {
	EasyModal.show(TwoFactorModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me";
}

const TwoFactorModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [error, setError] = useState<ReactNode | null>(null);
	const [step, setStep] = useState<Step>("loading");
	const [isEnabled, setIsEnabled] = useState(false);
	const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);
	const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const loadStatus = useCallback(async () => {
		try {
			const status = await get2FAStatus(id);
			setIsEnabled(status.enabled);
			setBackupCodesRemaining(status.backupCodesRemaining);
			setStep("status");
		} catch (err: any) {
			setError(err.message || "Failed to load 2FA status");
			setStep("status");
		}
	}, [id]);

	useEffect(() => {
		loadStatus();
	}, [loadStatus]);

	const handleStartSetup = async () => {
		setError(null);
		setIsSubmitting(true);
		try {
			const data = await start2FASetup(id);
			setSetupData(data);
			setStep("setup");
		} catch (err: any) {
			setError(err.message || "Failed to start 2FA setup");
		}
		setIsSubmitting(false);
	};

	const handleVerify = async (values: { code: string }) => {
		setError(null);
		setIsSubmitting(true);
		try {
			const result = await enable2FA(id, values.code);
			setBackupCodes(result.backupCodes);
			setStep("backup");
		} catch (err: any) {
			setError(err.message || "Failed to enable 2FA");
		}
		setIsSubmitting(false);
	};

	const handleDisable = async (values: { code: string }) => {
		setError(null);
		setIsSubmitting(true);
		try {
			await disable2FA(id, values.code);
			setIsEnabled(false);
			setStep("status");
		} catch (err: any) {
			setError(err.message || "Failed to disable 2FA");
		}
		setIsSubmitting(false);
	};

	const handleRegenerateBackup = async (values: { code: string }) => {
		setError(null);
		setIsSubmitting(true);
		try {
			const result = await regenerateBackupCodes(id, values.code);
			setBackupCodes(result.backupCodes);
			setStep("backup");
		} catch (err: any) {
			setError(err.message || "Failed to regenerate backup codes");
		}
		setIsSubmitting(false);
	};

	const handleBackupDone = () => {
		setIsEnabled(true);
		setBackupCodes([]);
		loadStatus();
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

		if (step === "status") {
			return (
				<div className="py-2">
					<div className="mb-4">
						<div className="d-flex align-items-center justify-content-between mb-2">
							<span className="fw-bold">
								<T id="2fa.status" />
							</span>
							<span className={`badge text-white ${isEnabled ? "bg-success" : "bg-secondary"}`}>
								{isEnabled ? <T id="2fa.enabled" /> : <T id="2fa.disabled" />}
							</span>
						</div>
						{isEnabled && (
							<p className="text-muted small mb-0">
								<T id="2fa.backup-codes-remaining" data={{ count: backupCodesRemaining }} />
							</p>
						)}
					</div>
					{!isEnabled ? (
						<Button
							fullWidth
							color="azure"
							onClick={handleStartSetup}
							isLoading={isSubmitting}
						>
							<T id="2fa.enable" />
						</Button>
					) : (
						<div className="d-flex flex-column gap-2">
							<Button fullWidth onClick={() => setStep("disable")}>
								<T id="2fa.disable" />
							</Button>
							<Button fullWidth onClick={() => setStep("verify")}>
								<T id="2fa.regenerate-backup" />
							</Button>
						</div>
					)}
				</div>
			);
		}

		if (step === "setup" && setupData) {
			return (
				<div className="py-2">
					<p className="text-muted mb-3">
						<T id="2fa.setup-instructions" />
					</p>
					<div className="text-center mb-3">
						<img
							src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.otpauthUrl)}`}
							alt="QR Code"
							className="img-fluid"
							style={{ maxWidth: "200px" }}
						/>
					</div>
					<label className="mb-3 d-block">
						<span className="form-label small text-muted">
							<T id="2fa.secret-key" />
						</span>
						<input
							type="text"
							className="form-control font-monospace"
							value={setupData.secret}
							readOnly
							onClick={(e) => (e.target as HTMLInputElement).select()}
						/>
					</label>
					<Formik initialValues={{ code: "" }} onSubmit={handleVerify}>
						{() => (
							<Form>
								<Field name="code" validate={validateString(6, 6)}>
									{({ field, form }: any) => (
										<label className="mb-3 d-block">
											<span className="form-label">
												<T id="2fa.enter-code" />
											</span>
											<input
												{...field}
												type="text"
												inputMode="numeric"
												autoComplete="one-time-code"
												className={`form-control ${form.errors.code && form.touched.code ? "is-invalid" : ""}`}
												placeholder="000000"
												maxLength={6}
											/>
											<div className="invalid-feedback">{form.errors.code}</div>
										</label>
									)}
								</Field>
								<div className="d-flex gap-2">
									<Button
										type="button"
										fullWidth
										onClick={() => setStep("status")}
										disabled={isSubmitting}
									>
										<T id="cancel" />
									</Button>
									<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
										<T id="2fa.verify-enable" />
									</Button>
								</div>
							</Form>
						)}
					</Formik>
				</div>
			);
		}

		if (step === "backup") {
			return (
				<div className="py-2">
					<Alert variant="warning">
						<T id="2fa.backup-warning" />
					</Alert>
					<div className="mb-3">
						<div className="row g-2">
							{backupCodes.map((code, index) => (
								<div key={index} className="col-6">
									<code className="d-block p-2 bg-light rounded text-center">{code}</code>
								</div>
							))}
						</div>
					</div>
					<Button fullWidth color="azure" onClick={handleBackupDone}>
						<T id="2fa.done" />
					</Button>
				</div>
			);
		}

		if (step === "disable") {
			return (
				<div className="py-2">
					<Alert variant="warning">
						<T id="2fa.disable-warning" />
					</Alert>
					<Formik initialValues={{ code: "" }} onSubmit={handleDisable}>
						{() => (
							<Form>
								<Field name="code" validate={validateString(6, 6)}>
									{({ field, form }: any) => (
										<label className="mb-3 d-block">
											<span className="form-label">
												<T id="2fa.enter-code-disable" />
											</span>
											<input
												{...field}
												type="text"
												inputMode="numeric"
												autoComplete="one-time-code"
												className={`form-control ${form.errors.code && form.touched.code ? "is-invalid" : ""}`}
												placeholder="000000"
												maxLength={6}
											/>
											<div className="invalid-feedback">{form.errors.code}</div>
										</label>
									)}
								</Field>
								<div className="d-flex gap-2">
									<Button
										type="button"
										fullWidth
										onClick={() => setStep("status")}
										disabled={isSubmitting}
									>
										<T id="cancel" />
									</Button>
									<Button type="submit" fullWidth color="red" isLoading={isSubmitting}>
										<T id="2fa.disable-confirm" />
									</Button>
								</div>
							</Form>
						)}
					</Formik>
				</div>
			);
		}

		if (step === "verify") {
			return (
				<div className="py-2">
					<p className="text-muted mb-3">
						<T id="2fa.regenerate-instructions" />
					</p>
					<Formik initialValues={{ code: "" }} onSubmit={handleRegenerateBackup}>
						{() => (
							<Form>
								<Field name="code" validate={validateString(6, 6)}>
									{({ field, form }: any) => (
										<label className="mb-3 d-block">
											<span className="form-label">
												<T id="2fa.enter-code" />
											</span>
											<input
												{...field}
												type="text"
												inputMode="numeric"
												autoComplete="one-time-code"
												className={`form-control ${form.errors.code && form.touched.code ? "is-invalid" : ""}`}
												placeholder="000000"
												maxLength={6}
											/>
											<div className="invalid-feedback">{form.errors.code}</div>
										</label>
									)}
								</Field>
								<div className="d-flex gap-2">
									<Button
										type="button"
										fullWidth
										onClick={() => setStep("status")}
										disabled={isSubmitting}
									>
										<T id="cancel" />
									</Button>
									<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
										<T id="2fa.regenerate" />
									</Button>
								</div>
							</Form>
						)}
					</Formik>
				</div>
			);
		}

		return null;
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="2fa.title" />
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

export { showTwoFactorModal };
