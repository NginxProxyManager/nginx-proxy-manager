import { IconKey, IconPlus } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal } from "react-bootstrap";
import { type ApiToken, getApiTokenOptions, getApiTokens, revokeApiToken } from "src/api/backend/apiTokens";
import { Button, Loading } from "src/components";
import { formatDateTime, intl, T } from "src/locale";
import CreateTokenModal from "./CreateTokenModal";

export default function ApiTokens() {
	const queryClient = useQueryClient();
	const tokens = useQuery({ queryKey: ["api-tokens"], queryFn: () => getApiTokens(), retry: false });
	const options = useQuery({ queryKey: ["api-token-options"], queryFn: () => getApiTokenOptions(), retry: false });
	const [creating, setCreating] = useState(false);
	const [revoking, setRevoking] = useState<ApiToken | null>(null);
	const [revokeError, setRevokeError] = useState<string | null>(null);
	const [isRevoking, setIsRevoking] = useState(false);
	const pending = useRef(false);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
		void queryClient.invalidateQueries({ queryKey: ["api-token-options"] });
	};

	const created = (token: ApiToken) => {
		// This callback only receives metadata, never the token secret or step-up credentials.
		queryClient.setQueryData<ApiToken[]>(["api-tokens"], (current) => [token, ...(current || [])]);
		refresh();
	};

	const closeRevoke = () => {
		if (pending.current) return;
		setRevoking(null);
		setRevokeError(null);
	};

	const revoke = async () => {
		if (pending.current || !revoking) return;
		pending.current = true;
		setIsRevoking(true);
		setRevokeError(null);
		try {
			await revokeApiToken(revoking.id);
			queryClient.setQueryData<ApiToken[]>(["api-tokens"], (current) =>
				current?.map((token) =>
					token.id === revoking.id
						? { ...token, status: "revoked", revokedOn: new Date().toISOString() }
						: token,
				),
			);
			refresh();
			if (mounted.current) setRevoking(null);
		} catch (error) {
			if (mounted.current) setRevokeError(error instanceof Error ? error.message : "api-tokens.revoke-failed");
		} finally {
			pending.current = false;
			if (mounted.current) setIsRevoking(false);
		}
	};

	const error = tokens.error || options.error;

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-teal" />
			<div className="card-header">
				<h2 className="card-title">
					<IconKey className="me-2" />
					<T id="api-tokens.title" />
				</h2>
				<div className="card-actions">
					<Button
						color="teal"
						onClick={() => setCreating(true)}
						disabled={!options.data?.scopes.length || options.isError || creating}
					>
						<IconPlus size={18} />
						<T id="api-tokens.create" />
					</Button>
				</div>
			</div>
			<div className="card-body">
				<p className="text-muted">
					<T id="api-tokens.description" />
				</p>
				{error && (
					<Alert variant="danger">
						<T id={error.message} />
						<div className="mt-2">
							<Button onClick={refresh} disabled={tokens.isFetching || options.isFetching}>
								<T id="api-tokens.retry" />
							</Button>
						</div>
					</Alert>
				)}
				{options.data && !options.data.scopes.length && (
					<Alert variant="info">
						<T id="api-tokens.no-permissions" />
					</Alert>
				)}
				{tokens.isPending || options.isPending ? (
					<Loading noLogo />
				) : !tokens.isError && !tokens.data?.length ? (
					<p className="text-muted mb-0">
						<T id="api-tokens.empty" />
					</p>
				) : null}
			</div>
			{!!tokens.data?.length && (
				<div className="table-responsive">
					<table className="table table-vcenter card-table">
						<thead>
							<tr>
								<th scope="col">
									<T id="api-tokens.name" />
								</th>
								<th scope="col">
									<T id="api-tokens.scopes" />
								</th>
								<th scope="col">
									<T id="api-tokens.expires" />
								</th>
								<th scope="col">
									<T id="api-tokens.last-used" />
								</th>
								<th scope="col">
									<T id="api-tokens.status" />
								</th>
								<th scope="col">
									<span className="visually-hidden">
										<T id="api-tokens.actions" />
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{tokens.data.map((token) => {
								const status =
									token.status === "active" && Date.parse(token.expiresOn) <= Date.now()
										? "expired"
										: token.status;
								return (
									<tr key={token.id}>
										<th scope="row" className="text-wrap">
											<div>{token.name}</div>
											<div className="text-muted small fw-normal">
												<T id={`api-tokens.visibility-${token.visibility}`} />
											</div>
										</th>
										<td>
											<ul className="list-unstyled mb-0">
												{token.scopes.map((scope) => (
													<li key={scope}>
														<code>{scope}</code>
													</li>
												))}
											</ul>
										</td>
										<td className="text-nowrap">{formatDateTime(token.expiresOn, intl.locale)}</td>
										<td className="text-nowrap">
											{token.lastUsedOn ? (
												formatDateTime(token.lastUsedOn, intl.locale)
											) : (
												<T id="api-tokens.never-used" />
											)}
										</td>
										<td>
											<span
												className={`badge text-white bg-${status === "active" ? "green" : "secondary"}`}
											>
												<T id={`api-tokens.${status}`} />
											</span>
										</td>
										<td className="text-end">
											{status !== "revoked" && (
												<Button
													color="red"
													size="sm"
													onClick={() => {
														setRevoking(token);
														setRevokeError(null);
													}}
												>
													<T id="api-tokens.revoke" />
												</Button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
			{creating && options.data && (
				<CreateTokenModal
					options={options.data}
					onCreated={created}
					onClose={() => setCreating(false)}
					onRefresh={refresh}
				/>
			)}
			{revoking && (
				<Modal
					show
					onHide={closeRevoke}
					backdrop="static"
					keyboard={!isRevoking}
					aria-labelledby="api-token-revoke-title"
				>
					<Modal.Header closeButton={!isRevoking} closeLabel={intl.formatMessage({ id: "api-tokens.close" })}>
						<Modal.Title id="api-token-revoke-title">
							<T id="api-tokens.revoke" />
						</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						{revokeError && (
							<Alert variant="danger">
								<T id={revokeError} />
							</Alert>
						)}
						<T id="api-tokens.revoke-confirm" data={{ name: revoking.name }} />
					</Modal.Body>
					<Modal.Footer>
						<Button onClick={closeRevoke} disabled={isRevoking}>
							<T id="cancel" />
						</Button>
						<Button color="red" onClick={revoke} isLoading={isRevoking} disabled={isRevoking}>
							<T id="api-tokens.revoke" />
						</Button>
					</Modal.Footer>
				</Modal>
			)}
		</div>
	);
}
