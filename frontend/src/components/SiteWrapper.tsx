import React, { ReactNode } from "react";

import { Footer } from "components";
import { useAuthState, useUserState } from "context";
import styled from "styled-components";
import { Site, Container, Button, Grid, List } from "tabler-react";

const StyledContainer = styled(Container)`
	padding-bottom: 30px;
`;

interface Props {
	children?: ReactNode;
}
function SiteWrapper({ children }: Props) {
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
		<Site.Wrapper
			headerProps={{
				href: "/",
				alt: "Nginx Proxy Manager",
				imageURL: "/images/logo-bold-horizontal-grey.svg",
				accountDropdown: accountDropdownProps,
			}}
			navProps={{ itemsObjects: navBarItems }}
			//routerContextComponentType={withRouter(RouterContextProvider)}
			footerProps={{
				links: [
					<a href="#asd">First Link</a>,
					<a href="#fg">Second Link</a>,
					<a href="#dsg">Third Link</a>,
					<a href="#egf">Fourth Link</a>,
					<a href="#dsf">Five Link</a>,
					<a href="#sdfg">Sixth Link</a>,
					<a href="#sdf">Seventh Link</a>,
					<a href="#sdf">Eigth Link</a>,
				],
				note: "Premium and Open Source dashboard template with responsive and high quality UI. For Free!",
				copyright: (
					<React.Fragment>
						Copyright © 2019
						<a href="."> Tabler-react</a>. Theme by
						<a
							href="https://codecalm.net"
							target="_blank"
							rel="noopener noreferrer">
							{" "}
							codecalm.net
						</a>{" "}
						All rights reserved.
					</React.Fragment>
				),
				nav: (
					<React.Fragment>
						<Grid.Col auto={true}>
							<List className="list-inline list-inline-dots mb-0">
								<List.Item className="list-inline-item">
									<a href="./docs/index.html">Documentation</a>
								</List.Item>
								<List.Item className="list-inline-item">
									<a href="./faq.html">FAQ</a>
								</List.Item>
							</List>
						</Grid.Col>
						<Grid.Col auto={true}>
							<Button
								href="https://github.com/tabler/tabler-react"
								size="sm"
								outline
								color="primary"
								RootComponent="a">
								Source code
							</Button>
						</Grid.Col>
					</React.Fragment>
				),
			}}>
			<StyledContainer>{children}</StyledContainer>
			<Footer fixed />
		</Site.Wrapper>
	);
}

export { SiteWrapper };
