import { Formik, type FormikConfig, type FormikProps, type FormikValues } from "formik";
import { type ReactNode, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import { intl } from "src/locale";

const confirmDiscardChanges = (dirty: boolean) =>
	!dirty ||
	window.confirm(
		intl.formatMessage({
			id: "form.unsaved-changes",
			defaultMessage: "You have unsaved changes. Are you sure you want to discard them?",
		}),
	);

const FormDirtyState = ({ dirty, onChange }: { dirty: boolean; onChange: (dirty: boolean) => void }) => {
	useEffect(() => {
		onChange(dirty);
		return () => onChange(false);
	}, [dirty, onChange]);

	return null;
};

interface FormModalProps<Values extends FormikValues> extends Omit<FormikConfig<Values>, "children"> {
	show: boolean;
	onHide: () => void;
	preventHide?: boolean;
	children: (props: FormikProps<Values> & { onHide: () => void }) => ReactNode;
}

const FormModal = <Values extends FormikValues>({
	show,
	onHide,
	preventHide = false,
	children,
	...formikProps
}: FormModalProps<Values>) => (
	<Formik {...formikProps}>
		{(formikProps) => {
			const handleHide = () => {
				if (!preventHide && confirmDiscardChanges(formikProps.dirty)) {
					onHide();
				}
			};

			return (
				<Modal show={show} onHide={handleHide}>
					{children({ ...formikProps, onHide: handleHide })}
				</Modal>
			);
		}}
	</Formik>
);

export { confirmDiscardChanges, FormDirtyState, FormModal };
