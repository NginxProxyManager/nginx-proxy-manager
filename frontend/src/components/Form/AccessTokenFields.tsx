import cn from "classnames";
import { useState } from "react";
import type { AccessListToken } from "src/api/backend";
import { useLocaleState } from "src/context";
import { useCreateAccessListToken, useDeleteAccessListToken, useUpdateAccessListToken } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";
import { showError } from "src/notifications";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";
import { CopyField } from "./CopyField";
import { InlineRename } from "./InlineRename";

const HEADER_PRESETS = [
	{ id: "bearer", label: "Authorization: Bearer", header: "Authorization", prefix: "Bearer " },
	{ id: "x-api-key", label: "X-Api-Key", header: "X-Api-Key", prefix: "" },
	{ id: "custom", label: "", header: "", prefix: "" },
];

const HEADER_NAME_REGEX = /^[A-Za-z0-9-]{1,64}$/;

const generateToken = () => {
	const bytes = new Uint8Array(32);
	window.crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

interface Props {
	listId: number;
	tokens: AccessListToken[];
}

export function AccessTokenFields({ listId, tokens }: Props) {
	const { locale } = useLocaleState();
	const { mutateAsync: createToken, isPending: busy } = useCreateAccessListToken(listId);
	const { mutateAsync: updateToken } = useUpdateAccessListToken(listId);
	const { mutateAsync: deleteToken } = useDeleteAccessListToken(listId);
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [preset, setPreset] = useState(HEADER_PRESETS[1].id);
	const [customHeader, setCustomHeader] = useState("");
	const [value, setValue] = useState("");
	const [forward, setForward] = useState(true);
	const [created, setCreated] = useState<{ header: string; value: string } | null>(null);

	const presetDef = HEADER_PRESETS.find((p) => p.id === preset) || HEADER_PRESETS[1];
	const headerName = preset === "custom" ? customHeader.trim() : presetDef.header;
	const fullValue = `${presetDef.prefix}${value.trim()}`;
	const canAdd = !!name.trim() && HEADER_NAME_REGEX.test(headerName) && fullValue.length >= 16 && !busy;

	const reset = () => {
		setName("");
		setPreset(HEADER_PRESETS[1].id);
		setCustomHeader("");
		setValue("");
		setForward(true);
	};

	const add = async () => {
		if (!canAdd) {
			return;
		}
		try {
			await createToken({ name: name.trim(), headerName, value: fullValue, forward });
			setCreated({ header: headerName, value: fullValue });
			setAdding(false);
			reset();
		} catch (err: any) {
			showError(err.message);
		}
	};

	const update = async (token: AccessListToken, data: { name?: string; forward?: boolean }) => {
		try {
			await updateToken({ tokenId: token.id, data });
		} catch (err: any) {
			showError(err.message);
		}
	};

	const remove = async (token: AccessListToken) => {
		try {
			await deleteToken(token.id);
		} catch (err: any) {
			showError(err.message);
		}
	};

	if (!listId) {
		return (
			<div className="alert alert-info mb-0">
				<T id="access-list.tokens.save-first" />
			</div>
		);
	}

	const preventSubmit = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			add();
		}
	};

	return (
		<>
			<p className="text-secondary">
				<T id="access-list.tokens.help" />
			</p>

			{created ? (
				<div className="alert alert-success">
					<div className="w-100">
						<p className="mb-2">
							<T id="access-list.tokens.created" />
						</p>
						<CopyField value={`${created.header}: ${created.value}`} />
						<button type="button" className="btn btn-sm mt-2" onClick={() => setCreated(null)}>
							<T id="action.close" />
						</button>
					</div>
				</div>
			) : null}

			{tokens.length ? (
				<div className="table-responsive">
					<table className="table table-vcenter table-sm mb-0">
						<thead>
							<tr>
								<th>
									<T id="column.name" />
								</th>
								<th>
									<T id="access-list.tokens.header" />
								</th>
								<th>
									<T id="access-list.tokens.forward" />
								</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{tokens.map((token) => (
								<tr key={token.id}>
									<td>
										<InlineRename value={token.name} onSave={(n) => update(token, { name: n })} />
										<div className="text-secondary small">
											{token.lastUsedOn ? (
												<T
													id="access-list.tokens.last-used-on"
													data={{ date: formatDateTime(token.lastUsedOn, locale) }}
												/>
											) : (
												<T id="access-list.tokens.never-used" />
											)}
										</div>
									</td>
									<td className="font-monospace text-secondary">{token.headerName}</td>
									<td>
										<label className="form-check form-check-single form-switch mb-0">
											<input
												className={cn("form-check-input", { "bg-cyan": token.forward })}
												type="checkbox"
												checked={token.forward}
												aria-label={intl.formatMessage({ id: "access-list.tokens.forward" })}
												onChange={(e) => update(token, { forward: e.target.checked })}
											/>
										</label>
									</td>
									<td className="text-end">
										<ConfirmDeleteButton onConfirm={() => remove(token)} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="text-secondary">
					<T id="access-list.tokens.empty" />
				</p>
			)}

			{adding ? (
				<div className="card card-body mt-3">
					<label className="form-label" htmlFor="tokenName">
						<T id="column.name" />
					</label>
					<input
						id="tokenName"
						type="text"
						className="form-control mb-3"
						maxLength={100}
						value={name}
						placeholder={intl.formatMessage({ id: "access-list.tokens.name.placeholder" })}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={preventSubmit}
					/>

					<label className="form-label" htmlFor="tokenHeader">
						<T id="access-list.tokens.header" />
					</label>
					<div className="row g-2 mb-3">
						<div className="col">
							<select
								id="tokenHeader"
								className="form-select"
								value={preset}
								onChange={(e) => setPreset(e.target.value)}
							>
								{HEADER_PRESETS.map((p) => (
									<option key={p.id} value={p.id}>
										{p.id === "custom"
											? intl.formatMessage({ id: "access-list.tokens.header.custom" })
											: p.label}
									</option>
								))}
							</select>
						</div>
						{preset === "custom" ? (
							<div className="col">
								<input
									type="text"
									className={cn("form-control font-monospace", {
										"is-invalid":
											customHeader !== "" && !HEADER_NAME_REGEX.test(customHeader.trim()),
									})}
									maxLength={64}
									value={customHeader}
									placeholder="X-Custom-Token"
									aria-label={intl.formatMessage({ id: "access-list.tokens.header.custom" })}
									onChange={(e) => setCustomHeader(e.target.value)}
									onKeyDown={preventSubmit}
								/>
							</div>
						) : null}
					</div>

					<label className="form-label" htmlFor="tokenValue">
						<T id="access-list.tokens.value" />
					</label>
					<div className="input-group mb-1">
						{presetDef.prefix ? <span className="input-group-text">{presetDef.prefix.trim()}</span> : null}
						<input
							id="tokenValue"
							type="text"
							className="form-control font-monospace"
							autoComplete="off"
							maxLength={4000}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={preventSubmit}
						/>
						<button type="button" className="btn" onClick={() => setValue(generateToken())}>
							<T id="access-list.tokens.generate" />
						</button>
					</div>
					<div className="text-secondary small mb-3">
						<T id="access-list.tokens.value.help" />
					</div>

					<label className="row mb-3" htmlFor="tokenForward">
						<span className="col">
							<T id="access-list.tokens.forward" />
							<div className="text-secondary small">
								<T id="access-list.tokens.forward.help" />
							</div>
						</span>
						<span className="col-auto">
							<label className="form-check form-check-single form-switch">
								<input
									id="tokenForward"
									className={cn("form-check-input", { "bg-cyan": forward })}
									type="checkbox"
									checked={forward}
									onChange={(e) => setForward(e.target.checked)}
								/>
							</label>
						</span>
					</label>

					<div className="d-flex gap-2">
						<button type="button" className="btn btn-primary bg-cyan" disabled={!canAdd} onClick={add}>
							<T id="access-list.tokens.add" />
						</button>
						<button
							type="button"
							className="btn"
							disabled={busy}
							onClick={() => {
								setAdding(false);
								reset();
							}}
						>
							<T id="cancel" />
						</button>
					</div>
				</div>
			) : (
				<button type="button" className="btn btn-sm mt-3" onClick={() => setAdding(true)}>
					<T id="access-list.tokens.add" />
				</button>
			)}
		</>
	);
}
