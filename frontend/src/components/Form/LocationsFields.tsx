import {
	IconChevronDown,
	IconChevronRight,
	IconPlus,
	IconSearch,
	IconSettings,
	IconTrash,
	IconX,
} from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import cn from "classnames";
import { useFormikContext } from "formik";
import { useRef, useState } from "react";
import type { ProxyLocation } from "src/api/backend";
import { intl, T } from "src/locale";
import styles from "./LocationsFields.module.css";

// Below this many locations the list is short enough to scan by eye, and the
// filter would only take up space.
const FILTER_THRESHOLD = 5;

// Locations are identified by a client-side id rather than their array index,
// so that expanded/advanced state stays with the right row when one is removed.
interface Row {
	id: number;
	value: ProxyLocation;
}

interface Props {
	initialValues: ProxyLocation[];
	name?: string;
}
export function LocationsFields({ initialValues, name = "locations" }: Props) {
	const [rows, setRows] = useState<Row[]>(() => (initialValues || []).map((value, id) => ({ id, value })));
	const { setFieldValue } = useFormikContext();
	const [expanded, setExpanded] = useState<number[]>([]);
	const [advVisible, setAdvVisible] = useState<number[]>([]);
	const [filter, setFilter] = useState("");
	const nextId = useRef(rows.length);
	const scrollToId = useRef<number | null>(null);

	const blankItem: ProxyLocation = {
		path: "",
		advancedConfig: "",
		forwardScheme: "http",
		forwardHost: "",
		forwardPort: 80,
	};

	const toggleExpanded = (id: number) => {
		setExpanded(expanded.includes(id) ? expanded.filter((i) => i !== id) : [...expanded, id]);
	};

	const toggleAdvVisible = (id: number) => {
		setAdvVisible(advVisible.includes(id) ? advVisible.filter((i) => i !== id) : [...advVisible, id]);
	};

	const handleAdd = () => {
		const id = nextId.current++;
		setRows([...rows, { id, value: blankItem }]);
		// A new location starts empty, so open it and make sure an active filter
		// doesn't hide the row that was just added.
		setExpanded([...expanded, id]);
		setFilter("");
		scrollToId.current = id;
	};

	const handleRemove = (id: number) => {
		const newRows = rows.filter((r: Row) => r.id !== id);
		setRows(newRows);
		setExpanded(expanded.filter((i) => i !== id));
		setAdvVisible(advVisible.filter((i) => i !== id));
		setFormField(newRows);
	};

	const handleChange = (id: number, field: string, fieldValue: string) => {
		const newRows = rows.map((r: Row) => (r.id === id ? { ...r, value: { ...r.value, [field]: fieldValue } } : r));
		setRows(newRows);
		setFormField(newRows);
	};

	const setFormField = (newRows: Row[]) => {
		const filtered = newRows.map((r: Row) => r.value).filter((v: ProxyLocation) => v?.path?.trim() !== "");
		setFieldValue(name, filtered);
	};

	const forwardSummary = (item: ProxyLocation) => {
		if (!item.forwardHost) {
			return "";
		}
		return `${item.forwardScheme}://${item.forwardHost}${item.forwardPort ? `:${item.forwardPort}` : ""}`;
	};

	// Matches the path as well as the destination, so a location can be found by
	// the host or port it forwards to and not just by its path.
	const matchesFilter = (item: ProxyLocation, query: string) =>
		[item.path, item.forwardScheme, item.forwardHost, item.forwardPort, forwardSummary(item)]
			.join(" ")
			.toLowerCase()
			.includes(query);

	const query = filter.trim().toLowerCase();
	const visibleRows = query ? rows.filter((r: Row) => matchesFilter(r.value, query)) : rows;

	if (rows.length === 0) {
		return (
			<div className="text-center">
				<button type="button" className="btn my-3" onClick={handleAdd}>
					<T id="action.add-location" />
				</button>
			</div>
		);
	}

	return (
		<>
			<div className="d-flex align-items-center mb-3">
				{rows.length >= FILTER_THRESHOLD && (
					<div className={cn("input-group", styles.filter)}>
						<span className="input-group-text">
							<IconSearch size={16} />
						</span>
						<input
							type="text"
							className="form-control"
							autoComplete="off"
							placeholder={intl.formatMessage({ id: "location.filter" })}
							aria-label={intl.formatMessage({ id: "location.filter" })}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
						/>
						{filter ? (
							<button
								type="button"
								className="btn btn-icon"
								title={intl.formatMessage({ id: "action.clear" })}
								aria-label={intl.formatMessage({ id: "action.clear" })}
								onClick={() => setFilter("")}
							>
								<IconX size={16} />
							</button>
						) : null}
					</div>
				)}
				<button type="button" className="btn ms-auto" onClick={handleAdd}>
					<IconPlus size={16} className="me-1" />
					<T id="action.add-location" />
				</button>
			</div>
			{visibleRows.length === 0 ? (
				<div className="text-secondary text-center my-3">
					<T id="empty-search" />
				</div>
			) : (
				visibleRows.map((row: Row) => {
					const item = row.value;
					const isOpen = expanded.includes(row.id);
					const bodyId = `location-body-${row.id}`;
					return (
						<div
							key={row.id}
							ref={(node) => {
								if (node && scrollToId.current === row.id) {
									scrollToId.current = null;
									node.scrollIntoView({ block: "nearest" });
								}
							}}
							className={cn("card", "card-active", "mb-2", styles.locationCard)}
						>
							<div className={cn("card-header", "p-2", !isOpen && "border-bottom-0")}>
								<button
									type="button"
									className={styles.toggle}
									aria-expanded={isOpen}
									aria-controls={bodyId}
									onClick={() => toggleExpanded(row.id)}
								>
									{isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
									<span className={cn("ms-2", styles.path)}>{item.path}</span>
									<span className={cn("ms-2", "text-secondary", styles.summary)}>
										{forwardSummary(item)}
									</span>
								</button>
								{item.advancedConfig ? (
									// Deliberately the same icon as the advanced-config toggle in the
									// body below, so the marker reads as "this row has that section
									// filled in" rather than as a decoration of its own.
									<span
										className={cn("ms-2", "text-secondary", styles.marker)}
										role="img"
										title={intl.formatMessage({ id: "location.advanced-config" })}
										aria-label={intl.formatMessage({ id: "location.advanced-config" })}
									>
										<IconSettings size={16} />
									</span>
								) : null}
								<button
									type="button"
									className="btn btn-action ms-2"
									title={intl.formatMessage({ id: "action.delete" })}
									aria-label={intl.formatMessage({ id: "action.delete" })}
									onClick={() => handleRemove(row.id)}
								>
									<IconTrash size={16} className="icon" />
								</button>
							</div>
							{isOpen && (
								<div className="card-body" id={bodyId}>
									<div className="row">
										<div className="col-md-10">
											<div className="input-group mb-3">
												<span className="input-group-text">Location</span>
												<input
													type="text"
													className="form-control"
													placeholder="/path"
													autoComplete="off"
													value={item.path}
													onChange={(e) => handleChange(row.id, "path", e.target.value)}
												/>
											</div>
										</div>
										<div className="col-md-2 text-end">
											<button
												type="button"
												className="btn p-0"
												title="Advanced"
												aria-expanded={advVisible.includes(row.id)}
												onClick={() => toggleAdvVisible(row.id)}
											>
												<IconSettings size={20} />
											</button>
										</div>
									</div>
									<div className="row">
										<div className="col-md-3">
											<div className="mb-3">
												<label
													className="form-label"
													htmlFor={`location-forwardScheme-${row.id}`}
												>
													<T id="host.forward-scheme" />
												</label>
												<select
													id={`location-forwardScheme-${row.id}`}
													className="form-control"
													value={item.forwardScheme}
													onChange={(e) =>
														handleChange(row.id, "forwardScheme", e.target.value)
													}
												>
													<option value="http">http</option>
													<option value="https">https</option>
												</select>
											</div>
										</div>
										<div className="col-md-6">
											<div className="mb-3">
												<label
													className="form-label"
													htmlFor={`location-forwardHost-${row.id}`}
												>
													<T id="proxy-host.forward-host" />
												</label>
												<input
													id={`location-forwardHost-${row.id}`}
													type="text"
													className="form-control"
													required
													placeholder="eg: 10.0.0.1/path/"
													value={item.forwardHost}
													onChange={(e) =>
														handleChange(row.id, "forwardHost", e.target.value)
													}
												/>
											</div>
										</div>
										<div className="col-md-3">
											<div className="mb-3">
												<label
													className="form-label"
													htmlFor={`location-forwardPort-${row.id}`}
												>
													<T id="host.forward-port" />
												</label>
												<input
													id={`location-forwardPort-${row.id}`}
													type="number"
													min={1}
													max={65535}
													className="form-control"
													required
													placeholder="eg: 8081"
													value={item.forwardPort}
													onChange={(e) =>
														handleChange(row.id, "forwardPort", e.target.value)
													}
												/>
											</div>
										</div>
									</div>
									{advVisible.includes(row.id) && (
										<div className="">
											<CodeEditor
												language="nginx"
												placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
												padding={15}
												data-color-mode="dark"
												minHeight={170}
												indentWidth={2}
												value={item.advancedConfig}
												onChange={(e) => handleChange(row.id, "advancedConfig", e.target.value)}
												style={{
													fontFamily:
														"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
													borderRadius: "0.3rem",
													minHeight: "170px",
												}}
											/>
										</div>
									)}
								</div>
							)}
						</div>
					);
				})
			)}
		</>
	);
}
