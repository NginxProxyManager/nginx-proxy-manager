import React, { ReactNode, useState, useRef, useEffect } from "react";

import cn from "classnames";
import { Bell } from "tabler-icons-react";

import { Badge } from "../Badge";
import { ButtonList } from "../ButtonList";
import { Dropdown } from "../Dropdown";
import { NavigationMenu } from "./NavigationMenu";
import { NavigationMenuItemProps } from "./NavigationMenuItem";

export interface NavigationHeaderProps {
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * Logo and/or Text elements to show on the left brand side of the header
	 */
	brandContent?: ReactNode;
	/**
	 * Color theme for the nav bar
	 */
	theme?: "transparent" | "light" | "dark";
	/**
	 * Buttons to show in the header
	 */
	buttons?: ReactNode[];
	/**
	 * Notifications Content
	 */
	notifications?: ReactNode;
	/**
	 * Has unread notifications, shows red dot
	 */
	hasUnreadNotifications?: boolean;
	/**
	 * Avatar Object
	 */
	avatar?: ReactNode;
	/**
	 * Profile name to show next to avatar
	 */
	profileName?: string;
	/**
	 * Profile text to show beneath profileName
	 */
	profileSubName?: string;
	/**
	 * Profile dropdown menu items
	 */
	profileItems?: ReactNode[];
	/**
	 * Applies dark theme to Notifications and Profile dropdowns
	 */
	darkDropdowns?: boolean;
	/**
	 * Navigation Menu within this Header
	 */
	menuItems?: NavigationMenuItemProps[];
}
export const NavigationHeader: React.FC<NavigationHeaderProps> = ({
	className,
	theme = "transparent",
	brandContent,
	buttons,
	notifications,
	hasUnreadNotifications,
	avatar,
	profileName,
	profileSubName,
	profileItems,
	darkDropdowns,
	menuItems,
}) => {
	const [notificationsShown, setNotificationsShown] = useState(false);
	const [profileShown, setProfileShown] = useState(false);
	const profileRef = useRef(null);
	const notificationsRef = useRef(null);

	const handleClickOutside = (event: any) => {
		if (
			profileRef.current &&
			// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
			!profileRef.current.contains(event.target)
		) {
			setProfileShown(false);
		}
		if (
			notificationsRef.current &&
			// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
			!notificationsRef.current.contains(event.target)
		) {
			setNotificationsShown(false);
		}
	};

	useEffect(() => {
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<header
			className={cn(
				`navbar navbar-expand-md navbar-${theme} d-print-none`,
				className,
			)}>
			<div className="container-xl">
				<button
					className="navbar-toggler"
					type="button"
					data-bs-toggle="collapse"
					data-bs-target="#navbar-menu">
					<span className="navbar-toggler-icon" />
				</button>
				<h1 className="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">
					{brandContent}
				</h1>
				<div className="navbar-nav flex-row order-md-last">
					{buttons ? (
						<div className="nav-item d-none d-md-flex me-3">
							<ButtonList>{buttons}</ButtonList>
						</div>
					) : null}
					{notifications ? (
						<div
							className="nav-item dropdown d-none d-md-flex me-3"
							ref={notificationsRef}>
							<button
								style={{
									border: 0,
									backgroundColor: "transparent",
								}}
								className="nav-link px-0"
								aria-label="Show notifications"
								onClick={() => {
									setNotificationsShown(!notificationsShown);
								}}>
								<Bell className="icon" />
								{hasUnreadNotifications ? <Badge color="red" /> : null}
							</button>
							<Dropdown
								className="dropdown-menu-end dropdown-menu-card"
								show={notificationsShown}
								dark={darkDropdowns}>
								<div className="card">
									<div className="card-body">{notifications}</div>
								</div>
							</Dropdown>
						</div>
					) : null}
					<div
						ref={profileRef}
						className={cn("nav-item", {
							dropdown: !!profileItems,
						})}>
						<button
							style={{
								border: 0,
								backgroundColor: "transparent",
							}}
							className="nav-link d-flex lh-1 text-reset p-0"
							aria-label={profileItems && "Open user menu"}
							onClick={() => {
								setProfileShown(!profileShown);
							}}>
							{avatar}
							{profileName ? (
								<div className="d-none d-xl-block ps-2">
									<div style={{ textAlign: "left" }}>{profileName}</div>
									{profileSubName ? (
										<div
											className="mt-1 small text-muted"
											style={{ textAlign: "left" }}>
											{profileSubName}
										</div>
									) : null}
								</div>
							) : null}
						</button>
						{profileItems ? (
							<Dropdown
								className="dropdown-menu-end dropdown-menu-card"
								show={profileShown}
								dark={darkDropdowns}
								arrow>
								{profileItems}
							</Dropdown>
						) : null}
					</div>
				</div>
				{menuItems ? <NavigationMenu items={menuItems} withinHeader /> : null}
			</div>
		</header>
	);
};
