import {
	IconBook,
	IconDeviceDesktop,
	IconHome,
	IconLock,
	IconSettings,
	IconShield,
	IconUser,
} from "@tabler/icons-react";
import cn from "classnames";
import React from "react";
import { HasPermission, NavLink } from "src/components";
import { T } from "src/locale";
import {
	ACCESS_LISTS,
	ADMIN,
	CERTIFICATES,
	DEAD_HOSTS,
	type MANAGE,
	PROXY_HOSTS,
	REDIRECTION_HOSTS,
	type Section,
	STREAMS,
	VIEW,
} from "src/modules/Permissions";

interface MenuItem {
	label: string;
	icon?: React.ElementType;
	to?: string;
	items?: MenuItem[];
	permissionSection?: Section | typeof ADMIN;
	permission?: typeof VIEW | typeof MANAGE;
}

const menuItems: MenuItem[] = [
	{
		to: "/",
		icon: IconHome,
		label: "dashboard",
	},
	{
		icon: IconDeviceDesktop,
		label: "hosts",
		items: [
			{
				to: "/nginx/proxy",
				label: "proxy-hosts",
				permissionSection: PROXY_HOSTS,
				permission: VIEW,
			},
			{
				to: "/nginx/redirection",
				label: "redirection-hosts",
				permissionSection: REDIRECTION_HOSTS,
				permission: VIEW,
			},
			{
				to: "/nginx/stream",
				label: "streams",
				permissionSection: STREAMS,
				permission: VIEW,
			},
			{
				to: "/nginx/404",
				label: "dead-hosts",
				permissionSection: DEAD_HOSTS,
				permission: VIEW,
			},
		],
	},
	{
		to: "/access",
		icon: IconLock,
		label: "access-lists",
		permissionSection: ACCESS_LISTS,
		permission: VIEW,
	},
	{
		to: "/certificates",
		icon: IconShield,
		label: "certificates",
		permissionSection: CERTIFICATES,
		permission: VIEW,
	},
	{
		to: "/users",
		icon: IconUser,
		label: "users",
		permissionSection: ADMIN,
	},
	{
		to: "/audit-log",
		icon: IconBook,
		label: "auditlogs",
		permissionSection: ADMIN,
	},
	{
		to: "/settings",
		icon: IconSettings,
		label: "settings",
		permissionSection: ADMIN,
	},
];

const getMenuItem = (item: MenuItem, onClick?: () => void) => {
	if (item.items && item.items.length > 0) {
		return getMenuDropown(item, onClick);
	}

	return (
		<HasPermission
			key={`item-${item.label}`}
			section={item.permissionSection}
			permission={item.permission || VIEW}
			hideError
		>
			<li className="nav-item">
				<NavLink to={item.to} onClick={onClick}>
					<span className="nav-link-icon d-md-none d-lg-inline-block">
						{item.icon && React.createElement(item.icon, { height: 24, width: 24 })}
					</span>
					<span className="nav-link-title">
						<T id={item.label} />
					</span>
				</NavLink>
			</li>
		</HasPermission>
	);
};

const getMenuDropown = (item: MenuItem, onClick?: () => void) => {
	const cns = cn("nav-item", "dropdown");
	return (
		<HasPermission
			key={`item-${item.label}`}
			section={item.permissionSection}
			permission={item.permission || VIEW}
			hideError
		>
			<li className={cns}>
				<a
					className="nav-link dropdown-toggle"
					href={item.to}
					data-bs-toggle="dropdown"
					data-bs-auto-close="outside"
					aria-expanded="false"
					role="button"
				>
					<span className="nav-link-icon d-md-none d-lg-inline-block">
						<IconDeviceDesktop height={24} width={24} />
					</span>
					<span className="nav-link-title">
						<T id={item.label} />
					</span>
				</a>
				<div className="dropdown-menu">
					{item.items?.map((subitem, idx) => {
						return (
							<HasPermission
								key={`${idx}-${subitem.to}`}
								section={subitem.permissionSection}
								permission={subitem.permission || VIEW}
								hideError
							>
								<NavLink to={subitem.to} isDropdownItem onClick={onClick}>
									<T id={subitem.label} />
								</NavLink>
							</HasPermission>
						);
					})}
				</div>
			</li>
		</HasPermission>
	);
};

interface Props {
	mobileExpanded?: boolean;
	setMobileExpanded?: (expanded: boolean) => void;
}
export function SiteMenu({ mobileExpanded = false, setMobileExpanded }: Props) {
	// This is hacky AF. But that's the price of using a non-react UI kit.
	const closeMenus = () => {
		const navMenus = document.querySelectorAll(".nav-item.dropdown");
		navMenus.forEach((menu) => {
			menu.classList.remove("show");
			const dropdown = menu.querySelector(".dropdown-menu");
			if (dropdown) {
				dropdown.classList.remove("show");
			}
			setMobileExpanded?.(false);
		});
	};

	return (
		<header className="navbar-expand-md">
			<div className={cn("collapse", "navbar-collapse", { show: mobileExpanded })} id="navbar-menu">
				<div className="navbar">
					<div className="container-xl">
						<div className="row flex-column flex-md-row flex-fill align-items-center">
							<div className="col">
								<ul className="navbar-nav">
									{menuItems.length > 0 &&
										menuItems.map((item) => {
											return getMenuItem(item, closeMenus);
										})}
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
