import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Modal from "react-bootstrap/Modal";
import { updateUser } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useCurrentUser, useUser } from "src/hooks";
import { T } from "src/locale";
import { capabilityGroups, FULL_ADMIN } from "src/modules/Permissions";

const showPermissionsModal = (id: number) => EasyModal.show(PermissionsModal, { id });

interface Props extends InnerModalProps { id: number }

export function PermissionsEditor({ id, visible, remove }: Props) {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useUser(id);
	const { data: currentUser } = useCurrentUser();
	const [selected, setSelected] = useState<string[] | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const capabilities = selected ?? data?.capabilities ?? [];
	const editingSelf = currentUser?.id === data?.id;

	const toggle = (capability: string) => {
		if (editingSelf && capability === FULL_ADMIN && capabilities.includes(FULL_ADMIN)) return;
		setSelected(capabilities.includes(capability) ? capabilities.filter((item) => item !== capability) : [...capabilities, capability]);
	};

	const save = async () => {
		if (!data || isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			await updateUser({ id: data.id, capabilities });
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["users"] }),
				queryClient.invalidateQueries({ queryKey: ["user", data.id] }),
			]);
			remove();
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : "Unable to save permissions");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Header closeButton><Modal.Title><T id="user.set-permissions" data={{ name: data?.name ?? "" }} /></Modal.Title></Modal.Header>
			<Modal.Body>
				{(isLoading || !data) && !error ? <Loading noLogo /> : null}
				{error ? <Alert variant="danger">{error.message}</Alert> : null}
				{errorMsg ? <Alert variant="danger">{errorMsg}</Alert> : null}
				{data ? <fieldset disabled={isSubmitting}>
					<legend className="form-label"><T id="permissions.capabilities" /></legend>
					<label className="form-check mb-3" htmlFor="capability-full-admin">
						<input id="capability-full-admin" className="form-check-input" type="checkbox" checked={capabilities.includes(FULL_ADMIN)} disabled={editingSelf && capabilities.includes(FULL_ADMIN)} onChange={() => toggle(FULL_ADMIN)} />
						<span className="form-check-label"><T id="role.admin" /></span>
					</label>
					{capabilityGroups.map((group) => <div className="row align-items-center mb-2" key={group.id}>
						<div className="col"><T id={group.label} /></div>
						<div className="col-auto d-flex gap-3">
							{group.view ? <label className="form-check" htmlFor={`capability-${group.view}`}><input id={`capability-${group.view}`} aria-label={`${group.id} view`} className="form-check-input" type="checkbox" checked={capabilities.includes(group.view)} onChange={() => toggle(group.view as string)} /><span className="form-check-label"><T id="permissions.view" /></span></label> : null}
							{group.manage ? <label className="form-check" htmlFor={`capability-${group.manage}`}><input id={`capability-${group.manage}`} aria-label={`${group.id} manage`} className="form-check-input" type="checkbox" checked={capabilities.includes(group.manage)} onChange={() => toggle(group.manage as string)} /><span className="form-check-label"><T id="permissions.manage" /></span></label> : null}
						</div>
					</div>)}
				</fieldset> : null}
			</Modal.Body>
			<Modal.Footer><Button onClick={remove} disabled={isSubmitting}><T id="cancel" /></Button><Button className="ms-auto btn-orange" onClick={save} isLoading={isSubmitting} disabled={!data || isSubmitting}><T id="save" /></Button></Modal.Footer>
		</Modal>
	);
}

const PermissionsModal = EasyModal.create((props: Props) => <PermissionsEditor {...props} />);
export { showPermissionsModal };
