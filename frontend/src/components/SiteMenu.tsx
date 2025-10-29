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

interface MenuItem {
	label: string;
	icon?: React.ElementType;
	to?: string;
	items?: MenuItem[];
	permission?: string;
	permissionType?: "view" | "manage";
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
				permission: "proxyHosts",
				permissionType: "view",
			},
			{
				to: "/nginx/redirection",
				label: "redirection-hosts",
				permission: "redirectionHosts",
				permissionType: "view",
			},
			{
				to: "/nginx/stream",
				label: "streams",
				permission: "streams",
				permissionType: "view",
			},
			{
				to: "/nginx/404",
				label: "dead-hosts",
				permission: "deadHosts",
				permissionType: "view",
			},
		],
	},
	{
		to: "/access",
		icon: IconLock,
		label: "access-lists",
		permission: "accessLists",
		permissionType: "view",
	},
	{
		to: "/certificates",
		icon: IconShield,
		label: "certificates",
		permission: "certificates",
		permissionType: "view",
	},
	{
		to: "/users",
		icon: IconUser,
		label: "users",
		permission: "admin",
	},
	{
		to: "/audit-log",
		icon: IconBook,
		label: "auditlogs",
		permission: "admin",
	},
	{
		to: "/settings",
		icon: IconSettings,
		label: "settings",
		permission: "admin",
	},
];

const getMenuItem = (item: MenuItem, onClick?: () => void) => {
	if (item.items && item.items.length > 0) {
		return getMenuDropown(item, onClick);
	}

	return (
		<HasPermission
			key={`item-${item.label}`}
			permission={item.permission || ""}
			type={item.permissionType || "view"}
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
			permission={item.permission || ""}
			type={item.permissionType || "view"}
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
								permission={subitem.permission || ""}
								type={subitem.permissionType || "view"}
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

export function SiteMenu() {
	// This is hacky AF. But that's the price of using a non-react UI kit.
	const closeMenus = () => {
		const navMenus = document.querySelectorAll(".nav-item.dropdown");
		navMenus.forEach((menu) => {
			menu.classList.remove("show");
			const dropdown = menu.querySelector(".dropdown-menu");
			if (dropdown) {
				dropdown.classList.remove("show");
			}
		});
	};

	return (
		<header className="navbar-expand-md">
			<div className="collapse navbar-collapse">
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
