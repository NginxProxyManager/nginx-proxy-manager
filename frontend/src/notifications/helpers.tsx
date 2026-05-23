import { toast } from "react-toastify";
import { intl } from "src/locale";
import { Msg } from "./Msg";
import styles from "./Msg.module.css";

const showSuccess = (message: string) => {
	toast(Msg, {
		className: styles.toaster,
		data: {
			type: "success",
			title: intl.formatMessage({ id: "notification.success" }),
			message,
		},
	});
};

const showError = (message: string) => {
	toast(<Msg />, {
		data: {
			type: "error",
			title: intl.formatMessage({ id: "notification.error" }),
			message,
		},
	});
};

const showObjectSuccess = (obj: string, action: string) => {
	showSuccess(
		intl.formatMessage(
			{
				id: `notification.object-${action}`,
			},
			{ object: intl.formatMessage({ id: obj }) },
		),
	);
};

export { showSuccess, showError, showObjectSuccess };
