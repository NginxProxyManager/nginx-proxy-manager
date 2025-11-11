import { IconLock, IconLogout, IconUser } from "@tabler/icons-react";
import cs from "classnames";
import { useState } from "react";
import { LocalePicker, NavLink, SiteMenu, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { showChangePasswordModal, showUserModal } from "src/modals";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const { logout } = useAuthState();
	const [expanded, setExpanded] = useState(false);

	return (
		<>
			<header className="navbar navbar-expand-md d-print-none">
				<div className="container-xl">
					<button
						className={cs("navbar-toggler", { collapsed: !expanded })}
						type="button"
						data-bs-toggle="collapse"
						data-bs-target="#navbar-menu"
						aria-controls="navbar-menu"
						aria-expanded={expanded}
						aria-label="Toggle navigation"
						onClick={() => setExpanded(!expanded)}
					>
						<span className="navbar-toggler-icon" />
					</button>
					<div className="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">
						<NavLink to="/">
							<div className={styles.logo}>
								<img
									src="/images/logo-no-text.svg"
									width={40}
									height={40}
									className="navbar-brand-image"
									alt="Logo"
								/>
							</div>
							Nginx Proxy Manager
						</NavLink>
					</div>
					<div className="navbar-nav flex-row order-md-last">
						<div className="d-none d-md-flex">
							<div className="nav-item">
								<LocalePicker />
							</div>
							<div className="nav-item">
								<ThemeSwitcher />
							</div>
						</div>
						<div className="nav-item d-none d-md-flex me-3">
							<div className="nav-item dropdown">
								<a
									href="/"
									className="nav-link d-flex lh-1 p-0 px-2"
									data-bs-toggle="dropdown"
									aria-label="Open user menu"
								>
									<span
										className="avatar avatar-sm"
										style={{
											backgroundImage: `url(${currentUser?.avatar || "/images/default-avatar.jpg"})`,
										}}
									/>
									<div className="d-none d-xl-block ps-2">
										<div>{currentUser?.nickname}</div>
										<div className="mt-1 small text-secondary">
											<T id={isAdmin ? "role.admin" : "role.standard-user"} />
										</div>
									</div>
								</a>
								<div className="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
									<a
										href="?"
										className="dropdown-item"
										onClick={(e) => {
											e.preventDefault();
											showUserModal("me");
										}}
									>
										<IconUser width={18} />
										<T id="user.edit-profile" />
									</a>
									<a
										href="?"
										className="dropdown-item"
										onClick={(e) => {
											e.preventDefault();
											showChangePasswordModal("me");
										}}
									>
										<IconLock width={18} />
										<T id="user.change-password" />
									</a>
									<div className="dropdown-divider" />
									<a
										href="?"
										className="dropdown-item"
										onClick={(e) => {
											e.preventDefault();
											logout();
										}}
									>
										<IconLogout width={18} />
										<T id="user.logout" />
									</a>
								</div>
							</div>
						</div>
					</div>
				</div>
			</header>
			<SiteMenu mobileExpanded={expanded} setMobileExpanded={setExpanded} />
		</>
	);
}
