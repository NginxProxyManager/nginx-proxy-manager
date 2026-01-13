import { IconLock, IconLogout, IconShieldLock, IconUser } from "@tabler/icons-react";
import { LocalePicker, NavLink, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { showChangePasswordModal, showTwoFactorModal, showUserModal } from "src/modals";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const { logout } = useAuthState();

	return (
		<header className="navbar navbar-expand-md d-print-none">
			<div className="container-xl">
				<button
					className="navbar-toggler"
					type="button"
					data-bs-toggle="collapse"
					data-bs-target="#navbar-menu"
					aria-controls="navbar-menu"
					aria-expanded="false"
					aria-label="Toggle navigation"
				>
					<span className="navbar-toggler-icon" />
				</button>
				<div className="navbar-brand navbar-brand-autodark pe-0 pe-md-3">
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
						NPMplus
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
					<div className="nav-item d-md-flex">
						<div className="nav-item dropdown">
							<a
								href="/"
								className="nav-link d-flex lh-1"
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
								<div className="d-md-none">
									{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: This div is not interactive. */}
									<div
										className="p-2 pb-1 pe-1 d-flex align-items-center"
										onClick={(e) => e.stopPropagation()}
									>
										<div className="ps-2 pe-1 me-auto">
											<div>{currentUser?.nickname}</div>
											<div className="mt-1 small text-secondary text-nowrap">
												<T id={isAdmin ? "role.admin" : "role.standard-user"} />
											</div>
										</div>
										<div className="d-flex align-items-center">
											<ThemeSwitcher className="me-n2" />
											<LocalePicker menuAlign="end" />
										</div>
									</div>
									<div className="dropdown-divider" />
								</div>
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
								<a
									href="?"
									className="dropdown-item"
									onClick={(e) => {
										e.preventDefault();
										showTwoFactorModal("me");
									}}
								>
									<IconShieldLock width={18} />
									<T id="user.two-factor" />
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
	);
}
