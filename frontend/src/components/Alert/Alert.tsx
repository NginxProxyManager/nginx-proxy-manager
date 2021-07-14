import React, { ReactNode, useState } from "react";

import cn from "classnames";

import { AlertLink } from "./AlertLink";

export interface AlertProps {
	/**
	 * Child elements within
	 */
	children?: ReactNode;
	/**
	 * Additional Class
	 */
	className?: string;
	/**
	 * The type of this Alert, changes it's color
	 */
	type?: "info" | "success" | "warning" | "danger";
	/**
	 * Alert Title
	 */
	title?: string;
	/**
	 * An Icon to be displayed on the right hand side of the Alert
	 */
	icon?: ReactNode;
	/**
	 * Display an Avatar on the left hand side of this Alert
	 */
	avatar?: ReactNode;
	/**
	 *
	 */
	important?: boolean;
	/**
	 * Adds an 'X' to the right side of the Alert that dismisses the Alert
	 */
	dismissable?: boolean;
	/**
	 * Event to call after dissmissing
	 */
	onDismissClick?: React.MouseEventHandler<HTMLButtonElement>;
}
export const Alert: React.FC<AlertProps> = ({
	children,
	className,
	type = "info",
	title,
	icon,
	avatar,
	important = false,
	dismissable = false,
	onDismissClick,
}) => {
	const [dismissed, setDismissed] = useState(false);

	const classes = {
		"alert-dismissible": dismissable,
		"alert-important": important,
	};

	const handleDismissed = (
		e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
	) => {
		setDismissed(true);
		onDismissClick && onDismissClick(e);
	};

	const wrappedTitle = title ? <h4 className="alert-title">{title}</h4> : null;
	const wrappedChildren =
		children && !important ? (
			<div className="text-muted">{children}</div>
		) : (
			children
		);

	const wrapIfIcon = (): ReactNode => {
		if (avatar) {
			return (
				<div className="d-flex">
					<div>
						<span className="float-start me-3">{avatar}</span>
					</div>
					<div>{wrappedChildren}</div>
				</div>
			);
		}
		if (icon) {
			return (
				<div className="d-flex">
					<div>
						<span className="alert-icon">{icon}</span>
					</div>
					<div>
						{wrappedTitle}
						{wrappedChildren}
					</div>
				</div>
			);
		}
		return (
			<>
				{wrappedTitle}
				{wrappedChildren}
			</>
		);
	};

	if (!dismissed) {
		return (
			<div
				className={cn("alert", `alert-${type}`, classes, className)}
				role="alert">
				{wrapIfIcon()}
				{dismissable ? (
					<button
						className="btn-close"
						data-bs-dismiss="alert"
						aria-label="close"
						onClick={handleDismissed}
					/>
				) : null}
			</div>
		);
	}
	return null;
};

Alert.Link = AlertLink;
