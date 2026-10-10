import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { type ReactNode, useEffect, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	type AuthProvider,
	type AuthProviderUserImpact,
	deleteAuthProvider,
	getAuthProviderUsers,
} from "src/api/backend";
import { Button, Loading } from "src/components";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showDeleteAuthProviderModal = (provider: AuthProvider) => {
	EasyModal.show(DeleteAuthProviderModal, { provider });
};

type UserAction = "convert" | "delete";

interface Props extends InnerModalProps {
	provider: AuthProvider;
}

/**
 * Removing a provider has to decide what becomes of the accounts it created.
 * They hold no password of their own, so doing nothing would leave people with
 * an account nobody can sign in to and no explanation of why.
 */
const DeleteAuthProviderModal = EasyModal.create(({ provider, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [impact, setImpact] = useState<AuthProviderUserImpact | null>(null);
	const [loading, setLoading] = useState(true);
	const [action, setAction] = useState<UserAction>("convert");
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		getAuthProviderUsers(provider.id)
			.then(setImpact)
			.catch(() => setImpact(null))
			.finally(() => setLoading(false));
	}, [provider.id]);

	const onConfirm = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			const result = await deleteAuthProvider(provider.id, action);
			queryClient.invalidateQueries({ queryKey: ["auth-providers"] });
			queryClient.invalidateQueries({ queryKey: ["login-options"] });
			queryClient.invalidateQueries({ queryKey: ["users"] });
			showObjectSuccess("auth-provider", "deleted");

			// Say so when accounts were spared, since it contradicts what was asked for
			if (result.kept?.length) {
				setErrorMsg(null);
			}
			remove();
		} catch (err: any) {
			setErrorMsg(err.message);
			setIsSubmitting(false);
		}
	};

	const userCount = impact?.users ?? 0;

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="object.delete" tData={{ object: "auth-provider" }} />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
					{errorMsg}
				</Alert>

				<p>
					<T id="auth-provider.delete-confirm" data={{ name: provider.name }} />
				</p>

				{loading ? (
					<Loading noLogo />
				) : userCount === 0 ? (
					<p className="text-secondary">
						<T id="auth-provider.delete-no-users" />
					</p>
				) : (
					<>
						<p>
							<T id="auth-provider.delete-users-intro" data={{ count: userCount }} />
						</p>

						<label className="form-selectgroup-item mb-2 d-block">
							<input
								type="radio"
								className="form-selectgroup-input"
								checked={action === "convert"}
								onChange={() => setAction("convert")}
							/>
							<span className="form-selectgroup-label d-block text-start p-3">
								<strong>
									<T id="auth-provider.delete-convert" />
								</strong>
								<div className="text-secondary mt-1">
									<T id="auth-provider.delete-convert-help" />
								</div>
							</span>
						</label>

						<label className="form-selectgroup-item mb-2 d-block">
							<input
								type="radio"
								className="form-selectgroup-input"
								checked={action === "delete"}
								onChange={() => setAction("delete")}
							/>
							<span className="form-selectgroup-label d-block text-start p-3">
								<strong>
									<T id="auth-provider.delete-users" />
								</strong>
								<div className="text-secondary mt-1">
									<T
										id="auth-provider.delete-users-help"
										data={{ removable: impact?.removable ?? 0 }}
									/>
								</div>
							</span>
						</label>

						{action === "delete" ? (
							<Alert variant="warning" className="mt-2 mb-0">
								<T id="auth-provider.delete-users-warning" />
							</Alert>
						) : null}
					</>
				)}
			</Modal.Body>
			<Modal.Footer>
				<Button onClick={remove} disabled={isSubmitting}>
					<T id="cancel" />
				</Button>
				<Button actionType="danger" onClick={onConfirm} isLoading={isSubmitting} disabled={loading}>
					<T id="delete" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showDeleteAuthProviderModal };
