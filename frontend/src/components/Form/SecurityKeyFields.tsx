import { IconAlertTriangle, IconKey } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { Field, useFormikContext } from "formik";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import type { AccessListKey, AccessListKeyInviteResponse } from "src/api/backend";
import { useLocaleState } from "src/context";
import { useCreateAccessListKeyInvite, useDeleteAccessListKey, useRenameAccessListKey } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";
import { showError } from "src/notifications";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";
import { CopyField } from "./CopyField";
import { InlineRename } from "./InlineRename";

const SESSION_HOURS = [1, 12, 24, 168, 720];

const sessionLabel = (hours: number) =>
	hours < 24
		? intl.formatMessage({ id: "access-list.keys.session.hours" }, { count: hours })
		: intl.formatMessage({ id: "access-list.keys.session.days" }, { count: Math.round(hours / 24) });

interface InviteProps {
	listId: number;
	keys: AccessListKey[];
	onClose: () => void;
}

function KeyInvite({ listId, keys, onClose }: InviteProps) {
	const { locale } = useLocaleState();
	const queryClient = useQueryClient();
	const { mutateAsync: createInvite, isPending: busy } = useCreateAccessListKeyInvite(listId);
	const [name, setName] = useState("");
	const [invite, setInvite] = useState<AccessListKeyInviteResponse | null>(null);
	const [selected, setSelected] = useState(0);
	const [registered, setRegistered] = useState<string | null>(null);
	const knownIds = useRef<Set<number>>(new Set(keys.map((k) => k.id)));

	// Watch for the key arriving while the link is shown
	useEffect(() => {
		if (!invite || registered) {
			return;
		}
		const timer = window.setInterval(
			() => queryClient.invalidateQueries({ queryKey: ["access-list", listId] }),
			3000,
		);
		return () => window.clearInterval(timer);
	}, [invite, registered, queryClient, listId]);

	useEffect(() => {
		if (!invite) {
			return;
		}
		const added = keys.find((k) => !knownIds.current.has(k.id));
		if (added) {
			setRegistered(added.name);
		}
	}, [keys, invite]);

	const create = async () => {
		if (!name.trim()) {
			return;
		}
		try {
			knownIds.current = new Set(keys.map((k) => k.id));
			setInvite(await createInvite(name.trim()));
			setSelected(0);
		} catch (err: any) {
			showError(err.message);
		}
	};

	if (registered) {
		return (
			<div className="card card-body mt-3">
				<div className="alert alert-success mb-3">
					<T id="access-list.keys.registered" data={{ name: registered }} />
				</div>
				<div>
					<button type="button" className="btn" onClick={onClose}>
						<T id="action.close" />
					</button>
				</div>
			</div>
		);
	}

	if (!invite) {
		return (
			<div className="card card-body mt-3">
				<label className="form-label" htmlFor="keyName">
					<T id="access-list.keys.name" />
				</label>
				<input
					id="keyName"
					type="text"
					className="form-control mb-3"
					maxLength={100}
					value={name}
					placeholder={intl.formatMessage({ id: "access-list.keys.name.placeholder" })}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							create();
						}
					}}
				/>
				<div className="d-flex gap-2">
					<button
						type="button"
						className="btn btn-primary bg-cyan"
						disabled={busy || !name.trim()}
						onClick={create}
					>
						<T id="access-list.keys.create-link" />
					</button>
					<button type="button" className="btn" onClick={onClose} disabled={busy}>
						<T id="cancel" />
					</button>
				</div>
			</div>
		);
	}

	const link = invite.urls[selected];
	return (
		<div className="card card-body mt-3">
			{!link ? (
				<div className="alert alert-warning mb-3">
					<T id="access-list.keys.link.none" />
				</div>
			) : (
				<>
					{invite.urls.length > 1 ? (
						<select
							className="form-select mb-3"
							value={selected}
							onChange={(e) => setSelected(Number.parseInt(e.target.value, 10))}
							aria-label={intl.formatMessage({ id: "access-list.keys.domain" })}
						>
							{invite.urls.map((u, idx) => (
								<option key={u.domain} value={idx}>
									{u.domain}
								</option>
							))}
						</select>
					) : null}
					<div className="d-flex justify-content-center mb-3">
						<div className="bg-white p-2 rounded">
							<QRCode value={link.url} size={168} />
						</div>
					</div>
					<CopyField value={link.url} />
					{!link.secure ? (
						<div className="alert alert-warning mt-3 mb-0">
							<IconAlertTriangle size={16} className="me-1" />
							<T id="access-list.keys.link.insecure" />
						</div>
					) : null}
					<p className="text-secondary mt-3 mb-2">
						<T id="access-list.keys.link.help" data={{ date: formatDateTime(invite.expiresOn, locale) }} />
					</p>
					<p className="text-secondary mb-3">
						<span className="spinner-border spinner-border-sm me-2" />
						<T id="access-list.keys.waiting" />
					</p>
				</>
			)}
			<div>
				<button type="button" className="btn" onClick={onClose}>
					<T id="action.close" />
				</button>
			</div>
		</div>
	);
}

interface Props {
	listId: number;
	savedKeyAuth: boolean;
	keys: AccessListKey[];
}

export function SecurityKeyFields({ listId, savedKeyAuth, keys }: Props) {
	const { locale } = useLocaleState();
	const { values, setFieldValue } = useFormikContext<any>();
	const { mutateAsync: renameKey } = useRenameAccessListKey(listId);
	const { mutateAsync: deleteKey } = useDeleteAccessListKey(listId);
	const [inviting, setInviting] = useState(false);

	const rename = async (key: AccessListKey, name: string) => {
		try {
			await renameKey({ keyId: key.id, name });
		} catch (err: any) {
			showError(err.message);
		}
	};

	const remove = async (key: AccessListKey) => {
		try {
			await deleteKey(key.id);
		} catch (err: any) {
			showError(err.message);
		}
	};

	return (
		<>
			<div className="divide-y mb-3">
				<label className="row" htmlFor="keyAuth">
					<span className="col">
						<T id="access-list.keys.enable" />
						<div className="text-secondary small">
							<T id="access-list.keys.enable.help" />
						</div>
					</span>
					<span className="col-auto">
						<label className="form-check form-check-single form-switch">
							<input
								id="keyAuth"
								className={cn("form-check-input", { "bg-cyan": values.keyAuth })}
								type="checkbox"
								checked={!!values.keyAuth}
								onChange={(e) => setFieldValue("keyAuth", e.target.checked)}
							/>
						</label>
					</span>
				</label>
				{values.keyAuth ? (
					<div className="row pt-3">
						<label className="col col-form-label" htmlFor="keySessionHours">
							<T id="access-list.keys.session" />
						</label>
						<span className="col-auto">
							<Field
								as="select"
								id="keySessionHours"
								name="keySessionHours"
								className="form-select"
								onChange={(e: any) =>
									setFieldValue("keySessionHours", Number.parseInt(e.target.value, 10))
								}
							>
								{SESSION_HOURS.map((h) => (
									<option key={h} value={h}>
										{sessionLabel(h)}
									</option>
								))}
								{!SESSION_HOURS.includes(values.keySessionHours) ? (
									<option value={values.keySessionHours}>
										{sessionLabel(values.keySessionHours)}
									</option>
								) : null}
							</Field>
						</span>
					</div>
				) : null}
			</div>

			{!listId || !savedKeyAuth ? (
				<div className="alert alert-info mb-0">
					<T id="access-list.keys.save-first" />
				</div>
			) : (
				<>
					{keys.length ? (
						<div className="table-responsive">
							<table className="table table-vcenter table-sm mb-0">
								<thead>
									<tr>
										<th>
											<T id="column.name" />
										</th>
										<th>
											<T id="access-list.keys.domain" />
										</th>
										<th>
											<T id="access-list.keys.last-used" />
										</th>
										<th />
									</tr>
								</thead>
								<tbody>
									{keys.map((key) => (
										<tr key={key.id}>
											<td>
												<IconKey size={14} className="text-secondary me-1" />
												<InlineRename value={key.name} onSave={(name) => rename(key, name)} />
												<div className="text-secondary small">
													<T
														id="created-on"
														data={{ date: formatDateTime(key.createdOn, locale) }}
													/>
												</div>
											</td>
											<td className="text-secondary">{key.rpId}</td>
											<td className="text-secondary">
												{key.lastUsedOn ? (
													formatDateTime(key.lastUsedOn, locale)
												) : (
													<T id="access-list.keys.never" />
												)}
											</td>
											<td className="text-end">
												<ConfirmDeleteButton onConfirm={() => remove(key)} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="text-secondary">
							<T id="access-list.keys.empty" />
						</p>
					)}

					{inviting ? (
						<KeyInvite listId={listId} keys={keys} onClose={() => setInviting(false)} />
					) : (
						<button type="button" className="btn btn-sm mt-3" onClick={() => setInviting(true)}>
							<T id="access-list.keys.add" />
						</button>
					)}
				</>
			)}
		</>
	);
}
