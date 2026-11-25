import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Loading } from "src/components";
import { RANGES, TrafficPanel } from "src/components/TrafficPanel";
import { useTrafficReport } from "src/hooks";
import { T } from "src/locale";

const showHostStatsModal = (type: "proxy" | "redirection" | "dead" | "stream", id: number) => {
	EasyModal.show(HostStatsModal, { hostType: type, hostId: id });
};

interface Props extends InnerModalProps {
	hostType: "proxy" | "redirection" | "dead" | "stream";
	hostId: number;
}
const HostStatsModal = EasyModal.create(({ hostType, hostId, visible, remove }: Props) => {
	const [hours, setHours] = useState<number | undefined>(undefined);
	const { data, isLoading, error } = useTrafficReport(hours, { type: hostType, id: hostId });
	const active = hours ?? data?.range?.hours;

	return (
		<Modal show={visible} onHide={remove} size="xl" scrollable>
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="traffic.title" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				{!isLoading && error && (
					<Alert variant="danger" className="m-3">
						{error.message}
					</Alert>
				)}
				{isLoading && <Loading noLogo />}
				{data && !data.enabled && (
					<Alert variant="secondary">
						<T id="traffic.disabled" />
					</Alert>
				)}
				{data?.enabled && (
					<>
						<div className="btn-group mb-3">
							{RANGES.map((r) => (
								<button
									key={r.hours}
									type="button"
									className={`btn btn-sm ${active === r.hours ? "btn-primary" : "btn-outline-secondary"}`}
									onClick={() => setHours(r.hours)}
								>
									{r.label}
								</button>
							))}
						</div>
						<TrafficPanel data={data} single />
					</>
				)}
			</Modal.Body>
		</Modal>
	);
});

export { showHostStatsModal };
