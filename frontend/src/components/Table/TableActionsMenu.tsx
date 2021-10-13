import React, { ReactNode } from "react";

import { DotsVertical } from "tabler-icons-react";

export interface TableActionsMenuProps {
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Actions
	 */
	actions: ReactNode[];
}
export const TableActionsMenu = ({
	actions,
	className,
}: TableActionsMenuProps) => {
	return (
		<div className={className}>
			<DotsVertical />
		</div>
	);
};
