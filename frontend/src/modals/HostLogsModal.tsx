import CodeEditor from "@uiw/react-textarea-code-editor";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, Loading } from "src/components";
import { useProxyHostLogs } from "src/hooks";
import { T } from "src/locale";

const showHostLogsModal = (id: number, initialType: "access" | "error" = "access") => {
	// `id` doubles as the modal id (InnerModalProps), so it is passed as a
	// variable: an object literal would fail the excess property check.
	const props = { id, initialType };
	EasyModal.show(HostLogsModal, props);
};

interface Props extends InnerModalProps {
	id: number;
	initialType?: "access" | "error";
}
const HostLogsModal = EasyModal.create(({ id, initialType, visible, remove }: Props) => {
	const [logType, setLogType] = useState<"access" | "error">(initialType ?? "access");
	const { data, isLoading, error } = useProxyHostLogs(id, logType);

	return (
		<Modal show={visible} onHide={remove} size="lg" scrollable>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="action.logs" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<div className="mb-3">
					<ul className="nav nav-tabs">
						<li className="nav-item">
							<a
								href="#"
								className={`nav-link ${logType === "access" ? "active" : ""}`}
								onClick={(e) => {
									e.preventDefault();
									setLogType("access");
								}}
							>
								<T id="column.access" />
							</a>
						</li>
						<li className="nav-item">
							<a
								href="#"
								className={`nav-link ${logType === "error" ? "active" : ""}`}
								onClick={(e) => {
									e.preventDefault();
									setLogType("error");
								}}
							>
								<T id="column.error" />
							</a>
						</li>
					</ul>
				</div>
				{isLoading ? (
					<Loading noLogo />
				) : (
					<div style={{ maxHeight: "60vh", overflow: "auto" }}>
						<CodeEditor
							language="text"
							padding={15}
							data-color-mode="dark"
							indentWidth={2}
							style={{
								fontFamily:
									"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
								borderRadius: "0.3rem",
								backgroundColor: "var(--tblr-bg-surface-dark)",
								fontSize: "12px",
							}}
							readOnly
							value={data?.logs || ""}
						/>
					</div>
				)}
			</Modal.Body>
			<Modal.Footer>
				<Button data-bs-dismiss="modal" onClick={remove}>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showHostLogsModal };
