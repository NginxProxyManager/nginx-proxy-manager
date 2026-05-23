import { IconCheck, IconExclamationCircle } from "@tabler/icons-react";
import cn from "classnames";
import type { ReactNode } from "react";

function Msg({ data }: any) {
	const cns = cn("toast", "show", data.type || null);

	let icon: ReactNode = null;
	switch (data.type) {
		case "success":
			icon = <IconCheck className="text-green mr-1" size={16} />;
			break;
		case "error":
			icon = <IconExclamationCircle className="text-red mr-1" size={16} />;
			break;
	}

	return (
		<div
			className={cns}
			role="alert"
			aria-live="assertive"
			aria-atomic="true"
			data-bs-autohide="false"
			data-bs-toggle="toast"
		>
			{data.title && (
				<div className="toast-header">
					{icon} {data.title}
				</div>
			)}
			<div className="toast-body">{data.message}</div>
		</div>
	);
}
export { Msg };
