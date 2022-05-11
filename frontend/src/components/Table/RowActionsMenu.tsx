import { ReactNode } from "react";

import {
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	IconButton,
} from "@chakra-ui/react";
import { FiMoreVertical } from "react-icons/fi";

// A row action is a single menu item for the actions column
export interface RowAction {
	title: string;
	onClick: (e: any, data: any) => any;
	show?: (data: any) => any;
	disabled?: (data: any) => any;
	icon?: any;
}

interface RowActionsProps {
	/**
	 * Row Data
	 */
	data: any;
	/**
	 * Actions
	 */
	actions: RowAction[];
}
function RowActionsMenu({ data, actions }: RowActionsProps) {
	const elms: ReactNode[] = [];
	actions.map((action) => {
		if (!action.show || action.show(data)) {
			const disabled = action.disabled && action.disabled(data);
			elms.push(
				<MenuItem
					key={`action-${action.title}`}
					icon={action.icon}
					isDisabled={disabled}
					onClick={(e: any) => {
						action.onClick(e, data);
					}}>
					{action.title}
				</MenuItem>,
			);
		}
		return null;
	});

	if (!elms.length) {
		return null;
	}

	return (
		<div style={{ textAlign: "right" }}>
			<Menu>
				<MenuButton
					as={IconButton}
					aria-label="Actions"
					icon={<FiMoreVertical />}
					variant="outline"
				/>
				<MenuList>{elms}</MenuList>
			</Menu>
		</div>
	);
}

export { RowActionsMenu };
