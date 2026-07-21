import { IconInfoCircle } from "@tabler/icons-react";
import { useFormikContext } from "formik";
import { useState } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import type { UpstreamServer } from "src/api/backend";
import { intl, T } from "src/locale";

interface Props {
	initialServers?: UpstreamServer[];
	initialMethod?: string;
}

const BACKUP_INCOMPATIBLE_METHODS = ["ip_hash"];

function InfoPopover({ messageId }: { messageId: string }) {
	const popover = (
		<Popover>
			<Popover.Body>{intl.formatMessage({ id: messageId })}</Popover.Body>
		</Popover>
	);
	return (
		<OverlayTrigger trigger={["hover", "focus"]} placement="top" overlay={popover}>
			<span className="ms-1 text-muted" style={{ cursor: "help" }}>
				<IconInfoCircle size={14} />
			</span>
		</OverlayTrigger>
	);
}

export function UpstreamServersFields({ initialServers = [], initialMethod = "round_robin" }: Props) {
	const [servers, setServers] = useState<UpstreamServer[]>(initialServers);
	const [method, setMethod] = useState<string>(initialMethod);
	const { setFieldValue } = useFormikContext();

	const blankServer: UpstreamServer = {
		host: "",
		port: 80,
		weight: 1,
		maxFails: 1,
		failTimeout: "30s",
		backup: false,
		down: false,
	};

	const syncField = (newServers: UpstreamServer[], newMethod: string) => {
		const filtered = newServers.filter((s) => s.host.trim() !== "");
		setFieldValue("upstreamServers", filtered);
		setFieldValue("lbMethod", newMethod);
	};

	const handleAdd = () => {
		const updated = [...servers, blankServer];
		setServers(updated);
	};

	const handleRemove = (idx: number) => {
		const updated = servers.filter((_, i) => i !== idx);
		setServers(updated);
		syncField(updated, method);
	};

	const handleChange = (idx: number, field: keyof UpstreamServer, value: string | number | boolean) => {
		const updated = servers.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
		setServers(updated);
		syncField(updated, method);
	};

	const handleMethodChange = (newMethod: string) => {
		let updated = servers;
		if (BACKUP_INCOMPATIBLE_METHODS.includes(newMethod)) {
			updated = servers.map((s) => ({ ...s, backup: false }));
			setServers(updated);
		}
		setMethod(newMethod);
		syncField(updated, newMethod);
	};

	const backupDisabled = BACKUP_INCOMPATIBLE_METHODS.includes(method);

	if (servers.length === 0) {
		return (
			<div className="text-center">
				<p className="text-muted mt-3">
					<T id="upstream.description" />
				</p>
				<button type="button" className="btn my-2" onClick={handleAdd}>
					<T id="upstream.add-server" />
				</button>
			</div>
		);
	}

	return (
		<>
			<div className="mb-4">
				<label className="form-label" htmlFor="lbMethod">
					<T id="upstream.method" />
					<InfoPopover messageId="upstream.method.help" />
				</label>
				<select
					id="lbMethod"
					className="form-select"
					value={method}
					onChange={(e) => handleMethodChange(e.target.value)}
				>
					<option value="round_robin">Round Robin</option>
					<option value="least_conn">Least Connections</option>
					<option value="ip_hash">IP Hash (sticky sessions)</option>
				</select>
			</div>

			{servers.map((server, idx) => (
				<div key={idx} className="card card-active mb-3">
					<div className="card-body">
						<div className="row g-2 mb-2">
							<div className="col-sm-6">
								<label className="form-label" htmlFor={`upstream-host-${idx}`}>
									<T id="upstream.host" />
								</label>
								<input
									id={`upstream-host-${idx}`}
									type="text"
									className="form-control"
									placeholder="192.168.1.1"
									autoComplete="off"
									value={server.host}
									onChange={(e) => handleChange(idx, "host", e.target.value)}
								/>
							</div>
							<div className="col-sm-2">
								<label className="form-label" htmlFor={`upstream-port-${idx}`}>
									<T id="upstream.port" />
								</label>
								<input
									id={`upstream-port-${idx}`}
									type="number"
									min={1}
									max={65535}
									className="form-control"
									placeholder="80"
									value={server.port}
									onChange={(e) => handleChange(idx, "port", Number(e.target.value))}
								/>
							</div>
							<div className="col-sm-2">
								<label className="form-label" htmlFor={`upstream-weight-${idx}`}>
									<T id="upstream.weight" />
									<InfoPopover messageId="upstream.weight.help" />
								</label>
								<input
									id={`upstream-weight-${idx}`}
									type="number"
									min={1}
									max={100}
									className="form-control"
									value={server.weight}
									onChange={(e) => handleChange(idx, "weight", Number(e.target.value))}
								/>
							</div>
						</div>
						<div className="row g-2">
							<div className="col-sm-3">
								<label className="form-label" htmlFor={`upstream-maxfails-${idx}`}>
									<T id="upstream.max-fails" />
									<InfoPopover messageId="upstream.max-fails.help" />
								</label>
								<input
									id={`upstream-maxfails-${idx}`}
									type="number"
									min={0}
									className="form-control"
									value={server.maxFails}
									onChange={(e) => handleChange(idx, "maxFails", Number(e.target.value))}
								/>
							</div>
							<div className="col-sm-3">
								<label className="form-label" htmlFor={`upstream-failtimeout-${idx}`}>
									<T id="upstream.fail-timeout" />
									<InfoPopover messageId="upstream.fail-timeout.help" />
								</label>
								<input
									id={`upstream-failtimeout-${idx}`}
									type="text"
									className="form-control"
									placeholder="30s"
									value={server.failTimeout}
									onChange={(e) => handleChange(idx, "failTimeout", e.target.value)}
								/>
							</div>
							<div className="col-sm-3 d-flex align-items-end">
								<OverlayTrigger
									trigger={backupDisabled ? ["hover", "focus"] : []}
									placement="top"
									overlay={
										<Popover>
											<Popover.Body>
												{intl.formatMessage({ id: "upstream.backup.help" })}
											</Popover.Body>
										</Popover>
									}
								>
									<label className="form-check form-switch mb-2">
										<input
											type="checkbox"
											className="form-check-input"
											checked={server.backup}
											disabled={backupDisabled}
											onChange={(e) => handleChange(idx, "backup", e.target.checked)}
										/>
										<span className="form-check-label">
											<T id="upstream.backup" />
											<InfoPopover messageId="upstream.backup.help" />
										</span>
									</label>
								</OverlayTrigger>
							</div>
							<div className="col-sm-3 d-flex align-items-end">
								<label className="form-check form-switch mb-2">
									<input
										type="checkbox"
										className="form-check-input"
										checked={server.down}
										onChange={(e) => handleChange(idx, "down", e.target.checked)}
									/>
									<span className="form-check-label">
										<T id="upstream.down" />
										<InfoPopover messageId="upstream.down.help" />
									</span>
								</label>
							</div>
						</div>
						<div className="mt-1">
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault();
									handleRemove(idx);
								}}
							>
								<T id="action.delete" />
							</a>
						</div>
					</div>
				</div>
			))}

			<div>
				<button type="button" className="btn btn-sm" onClick={handleAdd}>
					<T id="upstream.add-server" />
				</button>
			</div>
		</>
	);
}
