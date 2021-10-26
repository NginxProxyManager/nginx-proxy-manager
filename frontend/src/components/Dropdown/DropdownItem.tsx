import React, { ReactNode } from "react";

import cn from "classnames";
import { Link, LinkProps } from "react-router-dom";

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
	 * Optional react-router-dom `to` prop, will convert the item to a link
	 */
	to?: string;
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
	to,
	onClick,
	...rest
}) => {
	const getElem = (props: Omit<LinkProps, "to">, children: ReactNode) => {
		return to ? (
			<Link to={to} {...props}>
				{children}
			</Link>
		) : (
			<span {...props}> {children} </span>
		);
	};
	return divider ? (
		<div className={cn("dropdown-divider", className)} />
	) : (
		getElem(
			{
				className: cn(
					"dropdown-item",
					active && "active",
					disabled && "disabled",
					className,
				),
				onClick,
				...rest,
			},
			<>
				{icon && <span className="dropdown-item-icon">{icon}</span>}
				{children}
			</>,
		)
	);
};
