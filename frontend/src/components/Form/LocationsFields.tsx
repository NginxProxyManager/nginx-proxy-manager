import {
	IconAlertCircle,
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
import { useField, useFormikContext } from "formik";
import { useEffect, useRef, useState } from "react";
import type { NginxLocationStatus, ProxyLocation } from "src/api/backend";
import { intl, T } from "src/locale";
import { isVariableHost, locationDuplicateKey, locationHostPart, normaliseLocationPath } from "src/modules/HostStatus";
import { LocationStatusBadge } from "../StatusBadges";
import { AccessField } from "./AccessField";
import styles from "./LocationsFields.module.css";

// Below this many locations the list is short enough to scan by eye, and the
// filter would only take up space.
const FILTER_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Validation (pure, exported for tests and for the modal's submit)
// ---------------------------------------------------------------------------

export interface LocationErrors {
	path?: string;
	forwardHost?: string;
	forwardPort?: string;
}

/** A row the user added but never filled in; dropped on save instead of being an error */
export const isBlankLocation = (item: ProxyLocation) =>
	!`${item?.path ?? ""}`.trim() && !`${item?.forwardHost ?? ""}`.trim() && !`${item?.advancedConfig ?? ""}`.trim();

/** The locations to send to the API: blank rows removed, nothing else changed */
export const cleanLocations = (items?: ProxyLocation[]) => (items || []).filter((l) => !isBlankLocation(l));

// Characters that would break out of the generated nginx directive, the same
// set the backend rejects. A host that is a single nginx variable is allowed.
// Like the backend, the host part of `host/path` is checked on its own.
const INVALID_HOST_CHARS = /[;{}'"`\\$#]/;
// The path part of `host/path` goes into `proxy_pass ...<path>;`; the backend
// quarantines a path with these. `$` is allowed, nginx variables are fine there.
const INVALID_PATH_CHARS = /[\s;{}'"`\\#]/;
// `${name}` is a variable too, the backend replaces it before the check above
const BRACED_VARIABLE = /\$\{[A-Za-z0-9_]+\}/g;

export const validateLocations = (items: ProxyLocation[] = []): (LocationErrors | undefined)[] => {
	// Locations nginx would reject as duplicates, by key: index and path of each
	const byKey = new Map<string, { index: number; path: string }[]>();
	items.forEach((item, index) => {
		if (isBlankLocation(item)) return;
		const key = locationDuplicateKey(item.path);
		if (key) byKey.set(key, [...(byKey.get(key) || []), { index, path: normaliseLocationPath(item.path) }]);
	});

	return items.map((item, index) => {
		if (isBlankLocation(item)) return undefined;
		const errors: LocationErrors = {};

		const path = normaliseLocationPath(item.path);
		const key = path ? locationDuplicateKey(item.path) : null;
		const other = key ? byKey.get(key)?.find((d) => d.index !== index) : undefined;
		if (!path) {
			errors.path = intl.formatMessage({ id: "error.required" });
		} else if (other) {
			errors.path = intl.formatMessage({ id: "location.error.duplicate-path" }, { path: other.path });
		}

		// The server trims the value and splits it at the first "/": `host/path`
		const host = `${item.forwardHost ?? ""}`.trim();
		const hostPart = locationHostPart(host);
		const pathPart = host.slice(hostPart.length);
		// A disabled row is never rendered (the backend's preflightLocation() stops at `enabled: false`), so it only
		// gets the checks the API itself makes for every row: required host, port range and duplicate paths.
		// Switching it back on brings the format errors back.
		const isEnabled = item.enabled !== false;
		if (!hostPart) {
			errors.forwardHost = intl.formatMessage({ id: "error.required" });
		} else if (!isEnabled) {
			// no format checks
		} else if (/\s/.test(hostPart)) {
			errors.forwardHost = intl.formatMessage({ id: "location.error.host-whitespace" });
		} else if (!isVariableHost(hostPart) && INVALID_HOST_CHARS.test(hostPart)) {
			errors.forwardHost = intl.formatMessage({ id: "location.error.host-invalid" });
		} else if (INVALID_PATH_CHARS.test(pathPart.replace(BRACED_VARIABLE, "$x"))) {
			errors.forwardHost = intl.formatMessage({ id: "location.error.path-invalid" });
		}

		const rawPort = item.forwardPort as unknown;
		const port = Number(rawPort);
		if (rawPort === "" || rawPort === null || typeof rawPort === "undefined" || Number.isNaN(port)) {
			errors.forwardPort = intl.formatMessage({ id: "error.required" });
		} else if (!Number.isInteger(port) || port < 1) {
			errors.forwardPort = intl.formatMessage({ id: "error.minimum" }, { min: 1 });
		} else if (port > 65535) {
			errors.forwardPort = intl.formatMessage({ id: "error.maximum" }, { max: 65535 });
		}

		return Object.keys(errors).length ? errors : undefined;
	});
};

/** Status the server reported for the row at `index`, if it still describes that row */
export const statusForRow = (
	statuses: NginxLocationStatus[] | undefined,
	index: number,
	item: ProxyLocation,
): NginxLocationStatus | undefined => {
	const s = statuses?.find((st) => st.index === index) ?? statuses?.[index];
	if (!s) return undefined;
	// Saved as disabled but switched on again in the form: the server's "disabled"
	// no longer describes the row
	if (s.status === "disabled" && item.enabled !== false) return undefined;
	return normaliseLocationPath(s.path) === normaliseLocationPath(item.path) ? s : undefined;
};

// ---------------------------------------------------------------------------

// Locations are identified by a client-side id rather than their array index,
// so that expanded/advanced state stays with the right row when one is removed.
interface Row {
	id: number;
	value: ProxyLocation;
}

const forwardSummary = (item: ProxyLocation) => {
	if (!item.forwardHost) {
		return "";
	}
	return `${item.forwardScheme}://${item.forwardHost}${item.forwardPort ? `:${item.forwardPort}` : ""}`;
};

interface Props {
	initialValues: ProxyLocation[];
	name?: string;
	// meta.nginxLocations of the saved host
	statuses?: NginxLocationStatus[];
	// Index of a location to open and highlight (e.g. the one nginx rejected)
	highlightIndex?: number | null;
	// Only admins may change the advanced config of a location
	allowAdvanced?: boolean;
}
export function LocationsFields({
	initialValues,
	name = "locations",
	statuses,
	highlightIndex,
	allowAdvanced = true,
}: Props) {
	const [rows, setRows] = useState<Row[]>(() => (initialValues || []).map((value, id) => ({ id, value })));
	const { setFieldValue, submitCount } = useFormikContext();
	const [expanded, setExpanded] = useState<number[]>([]);
	const [advVisible, setAdvVisible] = useState<number[]>([]);
	const [touched, setTouched] = useState<string[]>([]);
	const [filter, setFilter] = useState("");
	const nextId = useRef(rows.length);
	const scrollToId = useRef<number | null>(null);

	// Registers the validation with Formik so that a submit with invalid
	// locations is blocked; the per-row messages are rendered from the same
	// function below.
	useField({
		name,
		validate: (value: ProxyLocation[]) =>
			validateLocations(value).some(Boolean) ? intl.formatMessage({ id: "location.errors-summary" }) : undefined,
	});

	const rowErrors = validateLocations(rows.map((r) => r.value));

	// Index of each row in the array that was (or will be) saved, i.e. without
	// blank rows. Server statuses and error details refer to that array.
	const savedIndexes: (number | null)[] = [];
	let saved = 0;
	for (const r of rows) {
		savedIndexes.push(isBlankLocation(r.value) ? null : saved++);
	}
	const rowForSavedIndex = (i: number) => rows[savedIndexes.indexOf(i)];

	// After a failed submit, open every location with errors so they can be seen
	const lastSubmitCount = useRef(submitCount);
	useEffect(() => {
		if (submitCount === lastSubmitCount.current) return;
		lastSubmitCount.current = submitCount;
		const withErrors = rows.filter((_r, i) => rowErrors[i]).map((r) => r.id);
		if (withErrors.length) {
			setExpanded((prev) => Array.from(new Set([...prev, ...withErrors])));
			setFilter("");
			scrollToId.current = withErrors[0];
		}
	}, [submitCount, rows, rowErrors]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only when the highlight changes, not on every edit
	useEffect(() => {
		if (typeof highlightIndex !== "number") return;
		const row = rowForSavedIndex(highlightIndex);
		if (!row) return;
		setExpanded((prev) => (prev.includes(row.id) ? prev : [...prev, row.id]));
		setFilter("");
		scrollToId.current = row.id;
	}, [highlightIndex]);

	const highlightedId = typeof highlightIndex === "number" ? rowForSavedIndex(highlightIndex)?.id : undefined;

	const blankItem: ProxyLocation = {
		path: "",
		advancedConfig: "",
		forwardScheme: "http",
		forwardHost: "",
		forwardPort: 80,
		accessListId: 0,
	};

	const toggleExpanded = (id: number) => {
		setExpanded(expanded.includes(id) ? expanded.filter((i) => i !== id) : [...expanded, id]);
	};

	const toggleAdvVisible = (id: number) => {
		setAdvVisible(advVisible.includes(id) ? advVisible.filter((i) => i !== id) : [...advVisible, id]);
	};

	const setFormField = (newRows: Row[]) => {
		// Blank rows are kept here so array indexes match the rows (the access
		// list field relies on that); the modal drops them when saving.
		setFieldValue(
			name,
			newRows.map((r: Row) => r.value),
		);
	};

	const handleAdd = () => {
		const id = nextId.current++;
		const newRows = [...rows, { id, value: blankItem }];
		setRows(newRows);
		setFormField(newRows);
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

	const handleChanges = (id: number, changes: Partial<ProxyLocation>) => {
		const newRows = rows.map((r: Row) => (r.id === id ? { ...r, value: { ...r.value, ...changes } } : r));
		setRows(newRows);
		setFormField(newRows);
	};

	const markTouched = (id: number, field: keyof LocationErrors) => {
		const key = `${id}.${field}`;
		if (!touched.includes(key)) setTouched([...touched, key]);
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
					const index = rows.indexOf(row);
					const errors = rowErrors[index];
					const showError = (field: keyof LocationErrors) =>
						errors?.[field] && (submitCount > 0 || touched.includes(`${row.id}.${field}`))
							? errors[field]
							: undefined;
					return (
						<LocationCard
							key={row.id}
							row={row}
							index={index}
							name={name}
							isOpen={expanded.includes(row.id)}
							allowAdvanced={allowAdvanced}
							isAdvVisible={allowAdvanced && advVisible.includes(row.id)}
							isHighlighted={row.id === highlightedId}
							hasErrors={!!errors && (submitCount > 0 || touched.some((t) => t.startsWith(`${row.id}.`)))}
							errorFor={showError}
							status={
								savedIndexes[index] === null
									? undefined
									: statusForRow(statuses, savedIndexes[index] as number, row.value)
							}
							scrollRef={(node) => {
								if (node && scrollToId.current === row.id) {
									scrollToId.current = null;
									node.scrollIntoView?.({ block: "nearest" });
								}
							}}
							onToggle={() => toggleExpanded(row.id)}
							onToggleAdv={() => toggleAdvVisible(row.id)}
							onRemove={() => handleRemove(row.id)}
							onChanges={(changes) => handleChanges(row.id, changes)}
							onTouched={(field) => markTouched(row.id, field)}
						/>
					);
				})
			)}
		</>
	);
}

interface CardProps {
	row: Row;
	index: number;
	name: string;
	isOpen: boolean;
	allowAdvanced: boolean;
	isAdvVisible: boolean;
	isHighlighted: boolean;
	hasErrors: boolean;
	errorFor: (field: keyof LocationErrors) => string | undefined;
	status?: NginxLocationStatus;
	scrollRef: (node: HTMLDivElement | null) => void;
	onToggle: () => void;
	onToggleAdv: () => void;
	onRemove: () => void;
	onChanges: (changes: Partial<ProxyLocation>) => void;
	onTouched: (field: keyof LocationErrors) => void;
}
function LocationCard({
	row,
	index,
	name,
	isOpen,
	allowAdvanced,
	isAdvVisible,
	isHighlighted,
	hasErrors,
	errorFor,
	status,
	scrollRef,
	onToggle,
	onToggleAdv,
	onRemove,
	onChanges,
	onTouched,
}: CardProps) {
	const item = row.value;
	const isEnabled = item.enabled !== false;
	const bodyId = `location-body-${row.id}`;

	const hostError = errorFor("forwardHost");
	const pathError = errorFor("path");
	const portError = errorFor("forwardPort");

	return (
		<div
			ref={scrollRef}
			className={cn("card", "card-active", "mb-2", styles.locationCard, {
				[styles.muted]: !isEnabled,
				[styles.highlight]: isHighlighted,
				[styles.invalid]: hasErrors,
			})}
			data-testid={`location-card-${index}`}
		>
			<div className={cn("card-header", "p-2", !isOpen && "border-bottom-0")}>
				<button
					type="button"
					className={styles.toggle}
					aria-expanded={isOpen}
					aria-controls={bodyId}
					onClick={onToggle}
				>
					{isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
					<span className={cn("ms-2", styles.path)}>{item.path}</span>
					<span className={cn("ms-2", "text-secondary", styles.summary)}>{forwardSummary(item)}</span>
				</button>
				{hasErrors ? (
					<span
						className={cn("ms-2", "text-danger", styles.marker)}
						role="img"
						title={intl.formatMessage({ id: "location.error.has-errors" })}
						aria-label={intl.formatMessage({ id: "location.error.has-errors" })}
					>
						<IconAlertCircle size={16} />
					</span>
				) : null}
				<span className={cn("ms-2", styles.badges)}>
					{!isEnabled ? (
						<LocationStatusBadge id={`location-status-${row.id}`} status="disabled" />
					) : status ? (
						<LocationStatusBadge
							id={`location-status-${row.id}`}
							status={status.status}
							message={status.message}
						/>
					) : null}
				</span>
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
				<label
					className="form-check form-switch m-0 ms-2"
					title={intl.formatMessage({ id: "location.toggle-enabled" })}
				>
					<input
						type="checkbox"
						className={cn("form-check-input", { "bg-lime": isEnabled })}
						checked={isEnabled}
						aria-label={intl.formatMessage({ id: "location.toggle-enabled" })}
						onChange={(e) => onChanges({ enabled: e.target.checked })}
					/>
				</label>
				<button
					type="button"
					className="btn btn-action ms-1"
					title={intl.formatMessage({ id: "action.delete" })}
					aria-label={intl.formatMessage({ id: "action.delete" })}
					onClick={onRemove}
				>
					<IconTrash size={16} className="icon" />
				</button>
			</div>
			{isOpen && (
				<div className="card-body" id={bodyId}>
					<div className="row">
						<div className={allowAdvanced ? "col-md-10" : "col-md-12"}>
							<div className={cn("input-group mb-3", { "has-validation": !!pathError })}>
								<span className="input-group-text">
									<T id="location.path-label" />
								</span>
								<input
									type="text"
									className={cn("form-control", { "is-invalid": !!pathError })}
									placeholder="/path"
									autoComplete="off"
									aria-label={intl.formatMessage({ id: "location.path-label" })}
									value={item.path}
									onChange={(e) => onChanges({ path: e.target.value })}
									onBlur={() => onTouched("path")}
								/>
								{pathError ? <div className="invalid-feedback">{pathError}</div> : null}
							</div>
						</div>
						{allowAdvanced && (
							<div className="col-md-2 text-end">
								<button
									type="button"
									className="btn p-0"
									title={intl.formatMessage({ id: "location.advanced" })}
									aria-label={intl.formatMessage({ id: "location.advanced" })}
									aria-expanded={isAdvVisible}
									onClick={onToggleAdv}
								>
									<IconSettings size={20} />
								</button>
							</div>
						)}
					</div>
					{status && status.status !== "ok" && status.message ? (
						<div
							className={cn(
								"small mb-3",
								status.status === "quarantined" ? "text-danger" : "text-warning",
							)}
						>
							{status.message}
						</div>
					) : null}
					<div className="row">
						<div className="col-sm-3 col-md-3">
							<div className="mb-3">
								<label className="form-label text-nowrap" htmlFor={`location-forwardScheme-${row.id}`}>
									<T id="host.forward-scheme" />
								</label>
								<select
									id={`location-forwardScheme-${row.id}`}
									className="form-control"
									value={item.forwardScheme}
									onChange={(e) => onChanges({ forwardScheme: e.target.value })}
								>
									<option value="http">http</option>
									<option value="https">https</option>
								</select>
							</div>
						</div>
						<div className="col-sm-5 col-md-5">
							<div className="mb-3">
								<label className="form-label text-nowrap" htmlFor={`location-forwardHost-${row.id}`}>
									<T id="proxy-host.forward-host" />
								</label>
								<input
									id={`location-forwardHost-${row.id}`}
									type="text"
									className={cn("form-control", { "is-invalid": !!hostError })}
									placeholder="eg: 10.0.0.1/path/"
									autoComplete="off"
									value={item.forwardHost}
									onChange={(e) => onChanges({ forwardHost: e.target.value })}
									onBlur={() => onTouched("forwardHost")}
								/>
								{hostError ? <div className="invalid-feedback">{hostError}</div> : null}
							</div>
						</div>
						<div className="col-sm-4 col-md-4">
							<div className="mb-3">
								<label className="form-label text-nowrap" htmlFor={`location-forwardPort-${row.id}`}>
									<T id="host.forward-port" />
								</label>
								<input
									id={`location-forwardPort-${row.id}`}
									type="number"
									min={1}
									max={65535}
									className={cn("form-control", { "is-invalid": !!portError })}
									placeholder="eg: 8081"
									value={item.forwardPort ?? ""}
									onChange={(e) =>
										onChanges({
											// Stored as a number; an empty field stays empty (and is a validation error)
											forwardPort: (e.target.value === ""
												? ""
												: Number(e.target.value)) as unknown as number,
										})
									}
									onBlur={() => onTouched("forwardPort")}
								/>
								{portError ? <div className="invalid-feedback">{portError}</div> : null}
							</div>
						</div>
					</div>
					<AccessField
						name={`${name}[${index}].accessListId`}
						label="access-list"
						id={`locations-access-list-${row.id}`}
						onFormChange={(accessListId) => onChanges({ accessListId })}
						inheritHost
					/>
					{isAdvVisible && (
						<div className="">
							<CodeEditor
								language="nginx"
								placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
								padding={15}
								data-color-mode="dark"
								minHeight={170}
								indentWidth={2}
								value={item.advancedConfig}
								onChange={(e) => onChanges({ advancedConfig: e.target.value })}
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
}
