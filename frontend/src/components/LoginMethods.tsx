import { useEffect, useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import { oidcRequest } from "src/api/backend/oidc";
import { T } from "src/locale";

interface Identity {
	linked: boolean;
	issuer: string;
	available: boolean;
}

// Both administrator and standard accounts manage only their own identity here.
export function LoginMethods() {
	const [identity, setIdentity] = useState<Identity>();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		oidcRequest<Identity>("identity")
			.then(setIdentity)
			.catch((e) => setError(e.message));
	}, []);
	const act = async () => {
		if (busy || !identity) return;
		setBusy(true);
		setError("");
		try {
			if (identity.linked) {
				await oidcRequest("unlink", "POST", {});
				setIdentity({ ...identity, linked: false, issuer: "" });
				setBusy(false);
			} else {
				const { url } = await oidcRequest<{ url: string }>("link", "POST", {});
				window.location.assign(url);
			}
		} catch (e) {
			setError((e as Error).message);
			setBusy(false);
		}
	};
	return (
		<>
			{error && <Alert variant="danger">{error}</Alert>}
			{!identity && !error && <Loading noLogo />}
			{identity && (
				<>
					<h4>
						<T id="oidc.title" />
					</h4>
					<p className="text-secondary">
						<T id={identity.linked ? "oidc.linked" : "oidc.link-description"} />
					</p>
					{identity.linked && (
						<p>
							<code>{identity.issuer}</code>
						</p>
					)}
					{!identity.available && (
						<Alert variant="info">
							<T id="oidc.not-configured" />
						</Alert>
					)}
					<Button
						type="button"
						actionType={identity.linked ? undefined : "primary"}
						disabled={busy || (!identity.linked && !identity.available)}
						isLoading={busy}
						onClick={act}
					>
						<T id={identity.linked ? "oidc.unlink" : "oidc.link"} />
					</Button>
				</>
			)}
		</>
	);
}
