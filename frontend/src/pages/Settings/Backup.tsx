import { type ChangeEvent, useRef, useState } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { Alert, Modal } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { useExportBackup, useImportBackup } from "src/hooks";
import { intl, T } from "src/locale";
import { showError, showSuccess } from "src/notifications";

export default function Backup() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// Export password state
	const [useExportPassword, setUseExportPassword] = useState(false);
	const [exportPassword, setExportPassword] = useState("");
	const [exportPasswordConfirm, setExportPasswordConfirm] = useState("");
	const [showExportPassword, setShowExportPassword] = useState(false);

	// Import password state
	const [importPassword, setImportPassword] = useState("");
	const [showImportPassword, setShowImportPassword] = useState(false);

	const { mutate: doExport, isPending: isExporting } = useExportBackup();
	const { mutate: doImport, isPending: isImporting } = useImportBackup();

	const exportPasswordsMatch = !useExportPassword || exportPassword === exportPasswordConfirm;
	const canExport = !useExportPassword || (exportPassword.length > 0 && exportPasswordsMatch);

	const handleExport = () => {
		setErrorMsg(null);
		const password = useExportPassword && exportPassword ? exportPassword : undefined;
		doExport(password, {
			onSuccess: () => {
				showSuccess(intl.formatMessage({ id: "settings.backup.export.success" }));
				// Reset password fields after successful export
				setExportPassword("");
				setExportPasswordConfirm("");
			},
			onError: (err: Error) => {
				setErrorMsg(err.message);
				showError(err.message);
			},
		});
	};

	const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setSelectedFile(file);
			setShowConfirmModal(true);
		}
	};

	const handleImportConfirm = () => {
		if (!selectedFile) return;

		setErrorMsg(null);
		setShowConfirmModal(false);

		doImport(
			{ file: selectedFile, password: importPassword || undefined },
			{
				onSuccess: () => {
					showSuccess(intl.formatMessage({ id: "settings.backup.import.success" }));
					setSelectedFile(null);
					setImportPassword("");
					if (fileInputRef.current) {
						fileInputRef.current.value = "";
					}
				},
				onError: (err: Error) => {
					setErrorMsg(err.message);
					showError(err.message);
					// Re-open modal so user can retry with different password or cancel
					setShowConfirmModal(true);
				},
			},
		);
	};

	const handleImportCancel = () => {
		setShowConfirmModal(false);
		setSelectedFile(null);
		setImportPassword("");
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<>
			<div className="card-body">
				<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
					{errorMsg}
				</Alert>

				{/* Export Section */}
				<div className="mb-4">
					<h3 className="mb-2">
						<T id="settings.backup.export.title" />
					</h3>
					<p className="text-secondary mb-3">
						<T id="settings.backup.export.description" />
					</p>

					<Alert variant="warning" show>
						<i className="ti ti-alert-triangle me-2" />
						<T id="settings.backup.export.secrets-warning" />
					</Alert>

					<div className="mb-3">
						<div className="form-check">
							<input
								type="checkbox"
								className="form-check-input"
								id="useExportPassword"
								checked={useExportPassword}
								onChange={(e) => setUseExportPassword(e.target.checked)}
								disabled={isExporting || isImporting}
							/>
							<label className="form-check-label" htmlFor="useExportPassword">
								<T id="settings.backup.export.password.enable" />
							</label>
						</div>
					</div>

					{useExportPassword && (
						<div className="mb-3">
							<div className="row g-3">
								<div className="col-md-6">
									<label className="form-label" htmlFor="exportPassword">
										<T id="settings.backup.export.password.label" />
									</label>
									<div className="input-group">
										<input
											type={showExportPassword ? "text" : "password"}
											className="form-control"
											id="exportPassword"
											value={exportPassword}
											onChange={(e) => setExportPassword(e.target.value)}
											disabled={isExporting || isImporting}
										/>
										   <button
											   type="button"
											   className="btn btn-outline-secondary"
											   onClick={() => setShowExportPassword(!showExportPassword)}
										   >
											   {showExportPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
										   </button>
									</div>
								</div>
								<div className="col-md-6">
									<label className="form-label" htmlFor="exportPasswordConfirm">
										<T id="settings.backup.export.password.confirm" />
									</label>
									<div className="input-group">
										<input
											type={showExportPassword ? "text" : "password"}
											className={`form-control ${exportPassword && !exportPasswordsMatch ? "is-invalid" : ""}`}
											id="exportPasswordConfirm"
											value={exportPasswordConfirm}
											onChange={(e) => setExportPasswordConfirm(e.target.value)}
											disabled={isExporting || isImporting}
										/>
										   <button
											   type="button"
											   className="btn btn-outline-secondary"
											   onClick={() => setShowExportPassword(!showExportPassword)}
										   >
											   {showExportPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
										   </button>
									</div>
									{exportPassword && !exportPasswordsMatch && (
										<div className="text-danger mt-1">
											<small>
												<T id="settings.backup.export.password.mismatch" />
											</small>
										</div>
									)}
								</div>
							</div>
						</div>
					)}

					<Button
						actionType="primary"
						className="bg-teal"
						onClick={handleExport}
						isLoading={isExporting}
						disabled={isExporting || isImporting || !canExport}
					>
						<i className="ti ti-download me-2" />
						<T id="settings.backup.export.button" />
					</Button>
				</div>

				<hr />

				{/* Import Section */}
				<div className="mt-4">
					<h3 className="mb-2">
						<T id="settings.backup.import.title" />
					</h3>
					<p className="text-secondary mb-3">
						<T id="settings.backup.import.description" />
					</p>
					<Alert variant="warning" show>
						<i className="ti ti-alert-triangle me-2" />
						<T id="settings.backup.import.warning" />
					</Alert>

					<div className="mt-3">
						<input
							ref={fileInputRef}
							type="file"
							accept=".zip"
							onChange={handleFileSelect}
							className="form-control"
							disabled={isExporting || isImporting}
						/>
					</div>

					{isImporting && (
						<div className="mt-3">
							<Loading noLogo />
							<p className="text-secondary mt-2">
								<T id="settings.backup.import.progress" />
							</p>
						</div>
					)}
				</div>
			</div>

			{/* Confirmation Modal */}
			<Modal show={showConfirmModal} onHide={handleImportCancel} centered>
				<Modal.Header closeButton>
					<Modal.Title>
						<T id="settings.backup.import.confirm.title" />
					</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<Alert variant="danger">
						<i className="ti ti-alert-triangle me-2" />
						<T id="settings.backup.import.confirm.warning" />
					</Alert>
					<p>
						<T id="settings.backup.import.confirm.message" />
					</p>
					<p>
						<T id="settings.backup.import.confirm.logout" />
					</p>
					<p className="mb-3">
						<strong>
							<T id="settings.backup.import.confirm.file" />:
						</strong>{" "}
						{selectedFile?.name}
					</p>

					<div className="mb-0">
						<label className="form-label" htmlFor="importPassword">
							<T id="settings.backup.import.password.label" />
						</label>
						<div className="input-group">
							<input
								type={showImportPassword ? "text" : "password"}
								className="form-control"
								id="importPassword"
								value={importPassword}
								onChange={(e) => setImportPassword(e.target.value)}
								placeholder={intl.formatMessage({ id: "settings.backup.import.password.hint" })}
							/>
							   <button
								   type="button"
								   className="btn btn-outline-secondary"
								   onClick={() => setShowImportPassword(!showImportPassword)}
							   >
								   {showImportPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
							   </button>
						</div>
						<small className="text-muted">
							<T id="settings.backup.import.password.hint" />
						</small>
					</div>
				</Modal.Body>
				<Modal.Footer>
					<Button actionType="secondary" onClick={handleImportCancel}>
						<T id="cancel" />
					</Button>
					<Button actionType="danger" onClick={handleImportConfirm}>
						<i className="ti ti-upload me-2" />
						<T id="settings.backup.import.confirm.button" />
					</Button>
				</Modal.Footer>
			</Modal>
		</>
	);
}
