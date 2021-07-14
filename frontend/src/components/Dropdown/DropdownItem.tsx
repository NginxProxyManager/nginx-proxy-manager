import React, { ReactNode } from "react";

import cn from "classnames";

export interface DropdownItemProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Set if this is just a divider
	 */
	divider?: boolean;
	/**
	 * Set if this is active
	 */
	active?: boolean;
	/**
	 * Set if this is disabled
	 */
	disabled?: boolean;
	/**
	 * Icon to use as well
	 */
	icon?: ReactNode;
	/**
	 * Href
	 */
	href?: string;
	/**
	 * onClick handler
	 */
	onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}
export const DropdownItem: React.FC<DropdownItemProps> = ({
	children,
	className,
	divider,
	active,
	disabled,
	icon,
	href,
	onClick,
}) => {
	return divider ? (
		<div className={cn("dropdown-divider", className)} />
	) : (
		<a
			className={cn(
				"dropdown-item",
				active && "active",
				disabled && "disabled",
				className,
			)}
			href={href}
			onClick={onClick}>
			{icon && <span className="dropdown-item-icon">{icon}</span>}
			{children}
		</a>
	);
};
