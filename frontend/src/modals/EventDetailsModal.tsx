import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, EventFormatter, GravatarFormatter, Loading } from "src/components";
import { useAuditLog } from "src/hooks";
import { T } from "src/locale";

interface Props {
	id: number;
	onClose: () => void;
}
export function EventDetailsModal({ id, onClose }: Props) {
	const { data, isLoading, error } = useAuditLog(id);

	return (
		<Modal show onHide={onClose} animation={false}>
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
							<pre>
								<code>{JSON.stringify(data.meta, null, 2)}</code>
							</pre>
						</div>
					</Modal.Body>
					<Modal.Footer>
						<Button data-bs-dismiss="modal" onClick={onClose}>
							<T id="close" />
						</Button>
					</Modal.Footer>
				</>
			)}
		</Modal>
	);
}
