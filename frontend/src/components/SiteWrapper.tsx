import React, { ReactNode } from "react";

import { Footer } from "components";
import { Avatar, Dropdown, Navigation } from "components";
import { LocalePicker } from "components";
import { useAuthState, useUserState } from "context";
import { intl } from "locale";
import styled from "styled-components";

import { NavMenu } from "./NavMenu";

const StyledSiteContainer = styled.div`
	display: flex;
	flex-direction: column;
	height: 100vh;
`;

const StyledScrollContainer = styled.div`
	flex: 1 0 auto;
	overflow: auto;
`;

const StyledContentContainer = styled.div`
	padding-bottom: 30px;
`;

const StyledFooterContainer = styled.div`
	flex-shrink: 0;
`;
interface Props {
	children?: ReactNode;
}
function SiteWrapper({ children }: Props) {
	const user = useUserState();
	const { logout } = useAuthState();

	return (
		<StyledSiteContainer className="wrapper">
			<StyledScrollContainer>
				<Navigation.Header
					theme="light"
					brandContent={
						<img
							src="/images/logo-bold-horizontal-grey.svg"
							alt="Nginx Proxy Manager"
							className="navbar-brand-image"
							height="32"
						/>
					}
					avatar={<Avatar size="sm" url={user.gravatarUrl} />}
					profileName={user.nickname}
					profileSubName={
						user.roles.includes("admin")
							? intl.formatMessage({
									id: "users.admin",
									defaultMessage: "Administrator",
							  })
							: intl.formatMessage({
									id: "users.standard",
									defaultMessage: "Standard User",
							  })
					}
					buttons={[<LocalePicker key="lp1" />]}
					profileItems={[
						<Dropdown.Item key="m1-2">
							{intl.formatMessage({
								id: "profile.title",
								defaultMessage: "Profile settings",
							})}
						</Dropdown.Item>,
						<Dropdown.Item divider key="m1-4" />,
						<Dropdown.Item key="m1-6" onClick={logout}>
							{intl.formatMessage({
								id: "profile.logout",
								defaultMessage: "Logout",
							})}
						</Dropdown.Item>,
					]}
				/>
				<NavMenu />
				<div className="content">
					<div className="container-xl">
						<StyledContentContainer>{children}</StyledContentContainer>
					</div>
				</div>
			</StyledScrollContainer>
			<StyledFooterContainer>
				<Footer />
			</StyledFooterContainer>
		</StyledSiteContainer>
	);
}

export { SiteWrapper };
