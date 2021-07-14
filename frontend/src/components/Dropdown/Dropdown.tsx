import React, { ReactNode } from "react";

import cn from "classnames";

import { DropdownItem } from "./DropdownItem";

export interface DropdownProps {
	/**
	 * Child elements within
	 */
	children: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Header text
	 */
	header?: string;
	/**
	 * Shows arrow notch
	 */
	arrow?: boolean;
	/**
	 * Dark mode for dropdown
	 */
	dark?: boolean;
	/**
	 * Force this to show
	 */
	show?: boolean;
}
export const Dropdown: React.FC<DropdownProps> = ({
	children,
	className,
	header,
	arrow,
	dark,
	show,
}) => {
	return (
		<div
			className={cn(
				"dropdown-menu",
				arrow && "dropdown-menu-arrow",
				dark && ["bg-dark", "text-white"],
				show && "show",
				className,
			)}>
			{header && <span className="dropdown-header">{header}</span>}
			{children}
		</div>
	);
};

Dropdown.Item = DropdownItem;
