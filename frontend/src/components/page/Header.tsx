import React from "react";

import { useAuthState, useUserState } from "context";
import { Site } from "tabler-react";

function Header() {
	const user = useUserState();
	const { logout } = useAuthState();

	const accountDropdownProps = {
		avatarURL: user.gravatarUrl,
		name: user.nickname,
		description: user.roles.includes("admin")
			? "Administrator"
			: "Standard User",
		options: [
			{ icon: "user", value: "Profile" },
			{ icon: "settings", value: "Settings" },
			{ isDivider: true },
			{
				icon: "help-circle",
				value: "Need help?",
				href: "https://nginxproxymanager.com",
				target: "_blank",
			},
			{ icon: "log-out", value: "Log out", onClick: logout },
		],
	};

	const navBarItems = [
		{
			value: "Home",
			to: "/",
			icon: "home",
			//LinkComponent: withRouter(NavLink),
			useExact: true,
		},
		{
			value: "Interface",
			icon: "box",
			subItems: [
				{
					value: "Cards Design",
					to: "/cards",
					//LinkComponent: withRouter(NavLink),
				},
				//{ value: "Charts", to: "/charts", LinkComponent: withRouter(NavLink) },
				{
					value: "Pricing Cards",
					to: "/pricing-cards",
					//LinkComponent: withRouter(NavLink),
				},
			],
		},
		{
			value: "Components",
			icon: "calendar",
			/*
			subItems: [
				{ value: "Maps", to: "/maps", LinkComponent: withRouter(NavLink) },
				{ value: "Icons", to: "/icons", LinkComponent: withRouter(NavLink) },
				{ value: "Store", to: "/store", LinkComponent: withRouter(NavLink) },
				{ value: "Blog", to: "/blog", LinkComponent: withRouter(NavLink) },
			],
			*/
		},
		{
			value: "Pages",
			icon: "file",
			subItems: [
				{
					value: "Profile",
					to: "/profile",
					//LinkComponent: withRouter(NavLink),
				},
				//{ value: "Login", to: "/login", LinkComponent: withRouter(NavLink) },
				{
					value: "Register",
					to: "/register",
					//LinkComponent: withRouter(NavLink),
				},
				{
					value: "Forgot password",
					to: "/forgot-password",
					//LinkComponent: withRouter(NavLink),
				},
				{
					value: "Empty page",
					to: "/empty-page",
					//LinkComponent: withRouter(NavLink),
				},
				//{ value: "RTL", to: "/rtl", LinkComponent: withRouter(NavLink) },
			],
		},
		{
			value: "Forms",
			to: "/form-elements",
			icon: "check-square",
			//LinkComponent: withRouter(NavLink),
		},
		{
			value: "Gallery",
			to: "/gallery",
			icon: "image",
			//LinkComponent: withRouter(NavLink),
		},
		{
			icon: "file-text",
			value: "Documentation",
			to:
				process.env.NODE_ENV === "production"
					? "https://tabler.github.io/tabler-react/documentation"
					: "/documentation",
		},
	];

	return (
		<>
			<Site.Header
				href="/"
				alt="Nginx Proxy Manager"
				imageURL="/images/logo-bold-horizontal-grey.svg"
				accountDropdown={accountDropdownProps}
			/>
			<Site.Nav itemsObjects={navBarItems} />
		</>
	);
}

export { Header };
