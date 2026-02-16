import CodeEditor from "@uiw/react-textarea-code-editor";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, EventFormatter, GravatarFormatter, Loading } from "src/components";
import { useAuditLog } from "src/hooks";
import { T } from "src/locale";

const showEventDetailsModal = (id: number) => {
	EasyModal.show(EventDetailsModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}
const EventDetailsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAuditLog(id);

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<>
					<Modal.Header closeButton>
						<Modal.Title>
							<T id="action.view-details" />
						</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						<div className="row">
							<div className="col-md-2">
								<GravatarFormatter url={data.user?.avatar || ""} />
							</div>
							<div className="col-md-10">
								<EventFormatter row={data} />
							</div>
							<hr className="mt-4 mb-3" />
							<CodeEditor
								language="json"
								padding={15}
								data-color-mode="dark"
								minHeight={200}
								indentWidth={2}
								style={{
									fontFamily:
										"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
									borderRadius: "0.3rem",
									minHeight: "200px",
									backgroundColor: "var(--tblr-bg-surface-dark)",
								}}
								readOnly
								value={JSON.stringify(data.meta, null, 2)}
							/>
						</div>
					</Modal.Body>
					<Modal.Footer>
						<Button data-bs-dismiss="modal" onClick={remove}>
							<T id="action.close" />
						</Button>
					</Modal.Footer>
				</>
			)}
		</Modal>
	);
});

export { showEventDetailsModal };
