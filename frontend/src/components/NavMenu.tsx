import React from "react";

import {
	Book,
	DeviceDesktop,
	Home,
	Lock,
	Settings,
	Shield,
	Users,
} from "tabler-icons-react";
import { Navigation } from "tabler-react-typescript";

function NavMenu() {
	return (
		<Navigation.Menu
			theme="light"
			className="mb-3"
			items={[
				{
					title: "Home",
					icon: <Home />,
					to: "/",
				},
				{
					title: "Hosts",
					icon: <DeviceDesktop />,
					to: "/hosts",
				},
				{
					title: "Access Lists",
					icon: <Lock />,
					to: "/access-lists",
				},
				{
					title: "Certificates",
					icon: <Shield />,
					to: "/certificates",
				},
				{
					title: "Users",
					icon: <Users />,
					to: "/users",
				},
				{
					title: "Audit Log",
					icon: <Book />,
					to: "/audit-log",
				},
				{
					title: "Settings",
					icon: <Settings />,
					to: "/settings",
				},
			]}
		/>
	);
}

export { NavMenu };
