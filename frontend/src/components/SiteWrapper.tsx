import React, { ReactNode } from "react";

import { Footer } from "components";
import { useAuthState, useUserState } from "context";
import styled from "styled-components";
import {
	Book,
	DeviceDesktop,
	Home,
	Lock,
	Settings,
	Shield,
	Users,
} from "tabler-icons-react";
import { Avatar, Dropdown, Navigation } from "tabler-react-typescript";

const StyledContainer = styled.div`
	padding-bottom: 30px;
`;

interface Props {
	children?: ReactNode;
}
function SiteWrapper({ children }: Props) {
	const user = useUserState();
	const { logout } = useAuthState();

	return (
		<div className="wrapper">
			<Navigation.Header
				theme="light"
				brandContent={
					<a href=".">
						<img
							src="/images/logo-bold-horizontal-grey.svg"
							alt="Nginx Proxy Manager"
							className="navbar-brand-image"
							height="32"
						/>
					</a>
				}
				avatar={<Avatar size="sm" url={user.gravatarUrl} />}
				profileName={user.nickname}
				profileSubName={
					user.roles.includes("admin") ? "Administrator" : "Standard User"
				}
				profileItems={[
					<Dropdown.Item key="m1-1">Set status</Dropdown.Item>,
					<Dropdown.Item key="m1-2">Profile &amp; account</Dropdown.Item>,
					<Dropdown.Item key="m1-3">Feedback</Dropdown.Item>,
					<Dropdown.Item divider key="m1-4" />,
					<Dropdown.Item key="m1-5">Settings</Dropdown.Item>,
					<Dropdown.Item key="m1-6" onClick={logout}>
						Logout
					</Dropdown.Item>,
				]}
			/>
			<Navigation.Menu
				theme="light"
				className="mb-3"
				items={[
					{
						title: "Home",
						icon: <Home />,
						active: true,
					},
					{
						title: "Hosts",
						icon: <DeviceDesktop />,
					},
					{
						title: "Access Lists",
						icon: <Lock />,
					},
					{
						title: "Certificates",
						icon: <Shield />,
					},
					{
						title: "Users",
						icon: <Users />,
					},
					{
						title: "Audit Log",
						icon: <Book />,
					},
					{
						title: "Settings",
						icon: <Settings />,
					},
				]}
			/>

			<div className="content">
				<div className="container-xl">
					<StyledContainer>{children}</StyledContainer>
				</div>
			</div>
			<Footer fixed />
		</div>
	);
}

export { SiteWrapper };
