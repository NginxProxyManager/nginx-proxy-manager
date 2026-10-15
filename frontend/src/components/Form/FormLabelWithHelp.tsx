import { IconHelp } from "@tabler/icons-react";
import type { ReactNode } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";

type Props = {
	label: ReactNode;
	help: string;
	htmlFor?: string;
};

export function FormLabelWithHelp({ label, help, htmlFor }: Props) {
	return (
		<label htmlFor={htmlFor} className="form-label d-flex align-items-center gap-1 mb-0">
			{label}
			<OverlayTrigger placement="top" overlay={<Tooltip>{help}</Tooltip>}>
				<span className="text-muted cursor-help" role="img" aria-label="Help">
					<IconHelp size={16} />
				</span>
			</OverlayTrigger>
		</label>
	);
}
