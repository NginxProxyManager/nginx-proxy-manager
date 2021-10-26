import React, { ReactNode } from "react";

import cn from "classnames";
import { Link, useRouteMatch } from "react-router-dom";

import { Dropdown } from "../Dropdown";

export interface NavigationMenuItemProps {
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * An Icon to be displayed on the right hand side of the Alert
	 */
	icon?: ReactNode;
	/**
	 * Title of the Item
	 */
	title: string;
	/**
	 * Href if this is navigating somewhere
	 */
	href?: string;
	/**
	 * target property, only used when href is set
	 */
	target?: string;
	/**
	 * Router Link to if using react-router-dom
	 */
	to?: string;
	/**
	 * Router Link property if using react-router-dom
	 */
	activeOnlyWhenExact?: boolean;
	/**
	 * On click handler
	 */
	onClick?: React.MouseEventHandler<HTMLAnchorElement>;
	/**
	 * Provide dropdown items if this is to be a dropdown menu
	 */
	dropdownItems?: ReactNode[];
	/**
	 * State of the dropdown being shown
	 */
	dropdownShow?: boolean;
	/**
	 * Applies dark theme to dropdown
	 */
	darkDropdown?: boolean;
	/**
	 * Shows this item as being active
	 */
	active?: boolean;
	/**
	 * Disables the menu item
	 */
	disabled?: boolean;
	/**
	 * Badge if you want to show one
	 */
	badge?: ReactNode;
}
export const NavigationMenuItem: React.FC<NavigationMenuItemProps> = ({
	className,
	icon,
	title,
	href,
	target,
	to,
	activeOnlyWhenExact,
	onClick,
	dropdownItems,
	dropdownShow,
	darkDropdown,
	active,
	disabled,
	badge,
}) => {
	const match = useRouteMatch({
		path: to,
		exact: activeOnlyWhenExact,
	});

	return (
		<li
			className={cn(
				"nav-item",
				dropdownItems && "dropdown",
				{ active: match || active },
				className,
			)}>
			<Link
				to={to ?? ""}
				className={cn(
					"nav-link",
					dropdownItems && "dropdown-toggle",
					disabled && "disabled",
				)}
				href={href}
				target={target}
				role="button"
				aria-expanded="false"
				onClick={onClick}>
				{icon && (
					<span className="nav-link-icon d-md-none d-lg-inline-block">
						{icon}
					</span>
				)}
				<span className="nav-link-title">{title}</span>
				{badge}
			</Link>
			{dropdownItems ? (
				<Dropdown show={dropdownShow} dark={darkDropdown} arrow>
					{dropdownItems}
				</Dropdown>
			) : null}
		</li>
	);
};
