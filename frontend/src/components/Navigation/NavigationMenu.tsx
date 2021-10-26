import React, { ReactNode, useState, useRef, useEffect } from "react";

import cn from "classnames";
import styled from "styled-components";

import {
	NavigationMenuItem,
	NavigationMenuItemProps,
} from "./NavigationMenuItem";

/**
 * This menu handles the state of the dropdowns being shown, instead of state
 * being handled within the NavigationItem object, because we want the behaviour
 * of clicking one menu item with a dropdown to close the already open dropdown
 * of another menu item. This can only be done if we handle state one level above
 * the items.
 */

const StyledNavWrapper = styled.div<{ shown: boolean }>`
	@media (max-width: 767.98px) {
		transition: max-height 300ms ease-in-out;
		max-height: ${(p) => (p.shown ? `80vh` : `0`)};
		min-height: ${(p) => (p.shown ? `inherit` : `0`)};
		overflow: hidden;
		padding: ${(p) => (p.shown ? `inherit` : `0`)};
	}
`;

export interface NavigationMenuProps {
	/** Additional Class */
	className?: string;
	/** Navigation Items */
	items: NavigationMenuItemProps[];
	/** If this menu sits within a Navigation.Header */
	withinHeader?: boolean;
	/** Color theme for the nav bar */
	theme?: "transparent" | "light" | "dark";
	/** Search content */
	searchContent?: ReactNode;
	/** Navigation is currently hidden on mobile */
	openOnMobile?: boolean;
}
export const NavigationMenu: React.FC<NavigationMenuProps> = ({
	className,
	items,
	withinHeader,
	theme = "transparent",
	searchContent,
	openOnMobile = true,
}) => {
	const [dropdownShown, setDropdownShown] = useState(0);
	const navRef = useRef(null);

	const handleClickOutside = (event: any) => {
		if (
			navRef.current &&
			// @ts-expect-error ts-migrate(2531) FIXME: Object is possibly 'null'.
			!navRef.current.contains(event.target)
		) {
			setDropdownShown(0);
		}
	};

	useEffect(() => {
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const itemClicked = (
		e: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
		item: NavigationMenuItemProps,
		idx: number,
	) => {
		setDropdownShown(dropdownShown === idx ? 0 : idx);
		item.onClick && item.onClick(e);
	};

	const wrapMenu = (el: ReactNode) => {
		if (withinHeader) {
			return (
				<div className="navbar-expand-md">
					<StyledNavWrapper
						shown={openOnMobile}
						className={cn(`navbar navbar-${theme} navbar-collapse`, className)}>
						<div className="container-xl">{el}</div>
					</StyledNavWrapper>
				</div>
			);
		}
		return (
			<div className={"navbar-expand-md"}>
				<div
					className={cn(`navbar navbar-${theme}`, className)}
					id="navbar-menu">
					<div className="container-xl">
						{el}
						{searchContent ? (
							<div className="my-2 my-md-0 flex-grow-1 flex-md-grow-0 order-first order-md-last">
								{searchContent}
							</div>
						) : null}
					</div>
				</div>
			</div>
		);
	};

	return wrapMenu(
		<ul className="navbar-nav" ref={navRef}>
			{items.map((item: any, idx: number) => {
				const onClickItem = (
					e: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
				) => {
					itemClicked(e, item, idx);
				};
				return (
					<NavigationMenuItem
						key={`navmenu-${idx}`}
						onClick={onClickItem}
						dropdownShow={dropdownShown === idx}
						activeOnlyWhenExact
						{...item}
					/>
				);
			})}
		</ul>,
	);
};

NavigationMenu.Item = NavigationMenuItem;
