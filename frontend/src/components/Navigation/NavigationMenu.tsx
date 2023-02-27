import { FC, useCallback, useMemo, ReactNode } from "react";

import {
	Box,
	Collapse,
	Flex,
	forwardRef,
	HStack,
	Icon,
	Link,
	Menu,
	MenuButton,
	MenuItem,
	MenuList,
	Text,
	Stack,
	useColorModeValue,
	useDisclosure,
	Container,
	useBreakpointValue,
} from "@chakra-ui/react";
import { intl } from "locale";
import {
	FiHome,
	FiSettings,
	FiUser,
	FiBook,
	FiLock,
	FiShield,
	FiMonitor,
	FiChevronDown,
} from "react-icons/fi";
import { Link as RouterLink, useLocation } from "react-router-dom";

interface NavItem {
	/** Displayed label */
	label: string;
	/** Icon shown before the label */
	icon: ReactNode;
	/** Link where to navigate to */
	to?: string;
	subItems?: { label: string; to: string }[];
}

const navItems: NavItem[] = [
	{
		label: intl.formatMessage({ id: "dashboard.title" }),
		icon: <Icon as={FiHome} />,
		to: "/",
	},
	{
		label: intl.formatMessage({ id: "hosts.title" }),
		icon: <Icon as={FiMonitor} />,
		subItems: [
			{
				label: intl.formatMessage({ id: "hosts.title" }),
				to: "/hosts",
			},
			{
				label: intl.formatMessage({ id: "upstreams.title" }),
				to: "/upstreams",
			},
		],
	},
	{
		label: intl.formatMessage({ id: "access-lists.title" }),
		icon: <Icon as={FiLock} />,
		to: "/access-lists",
	},
	{
		label: intl.formatMessage({ id: "ssl.title" }),
		icon: <Icon as={FiShield} />,
		subItems: [
			{
				label: intl.formatMessage({ id: "certificates.title" }),
				to: "/ssl/certificates",
			},
			{
				label: intl.formatMessage({ id: "certificate-authorities.title" }),
				to: "/ssl/authorities",
			},
			{
				label: intl.formatMessage({ id: "dns-providers.title" }),
				to: "/ssl/dns-providers",
			},
		],
	},
	{
		label: intl.formatMessage({ id: "audit-log.title" }),
		icon: <Icon as={FiBook} />,
		to: "/audit-log",
	},
	{
		label: intl.formatMessage({ id: "users.title" }),
		icon: <Icon as={FiUser} />,
		to: "/users",
	},
	{
		label: intl.formatMessage({ id: "settings.title" }),
		icon: <Icon as={FiSettings} />,
		subItems: [
			{
				label: intl.formatMessage({ id: "general-settings.title" }),
				to: "/settings/general",
			},
			{
				label: intl.formatMessage({ id: "nginx-templates.title" }),
				to: "/settings/nginx-templates",
			},
		],
	},
];

interface NavigationMenuProps {
	/** Navigation is currently hidden on mobile */
	mobileNavIsOpen: boolean;
	closeMobileNav: () => void;
}
function NavigationMenu({
	mobileNavIsOpen,
	closeMobileNav,
}: NavigationMenuProps) {
	const isMobile = useBreakpointValue({ base: true, md: false });
	return (
		<>
			{isMobile ? (
				<Collapse in={mobileNavIsOpen}>
					<MobileNavigation closeMobileNav={closeMobileNav} />
				</Collapse>
			) : (
				<DesktopNavigation />
			)}
		</>
	);
}

/** Single tab element for desktop navigation */
type NavTabProps = Omit<NavItem, "subItems"> & { active?: boolean };
const NavTab = forwardRef<NavTabProps, "a">(
	({ label, icon, to, active, ...props }, ref) => {
		const linkColor = useColorModeValue("gray.500", "gray.200");
		const linkHoverColor = useColorModeValue("gray.900", "white");
		return (
			<Link
				as={RouterLink}
				ref={ref}
				height={12}
				to={to ?? "#"}
				display="flex"
				alignItems="center"
				borderBottom="1px solid"
				borderBottomColor={active ? linkHoverColor : "transparent"}
				color={active ? linkHoverColor : linkColor}
				_hover={{
					textDecoration: "none",
					color: linkHoverColor,
					borderBottomColor: linkHoverColor,
				}}
				{...props}>
				{icon}
				<Text as="span" marginLeft={2}>
					{label}
				</Text>
			</Link>
		);
	},
);

const DesktopNavigation: FC = () => {
	const path = useLocation().pathname;
	const activeNavItemIndex = useMemo(
		() =>
			navItems.findIndex((item) => {
				// Find the nav item whose location / sub items location is the beginning of the currently active path
				if (item.to) {
					if (item.to === "/") {
						return path === item.to;
					}
					return path.startsWith(item.to !== "" ? item.to : "/dashboard");
				} else if (item.subItems) {
					return item.subItems.some((subItem) => path.startsWith(subItem.to));
				}
				return false;
			}),
		[path],
	);

	return (
		<Box
			display={{ base: "none", md: "block" }}
			overflowY="visible"
			overflowX="auto"
			whiteSpace="nowrap"
			borderBottom="1px solid"
			borderColor={useColorModeValue("gray.200", "gray.700")}>
			<Container h="full" maxW="container.xl">
				<HStack spacing={8}>
					{navItems.map((navItem, index) => {
						const { subItems, ...propsWithoutSubItems } = navItem;
						const additionalProps: Partial<NavTabProps> = {};
						if (index === activeNavItemIndex) {
							additionalProps["active"] = true;
						}
						if (subItems) {
							return (
								<Menu key={`mainnav${index}`}>
									<MenuButton
										as={NavTab}
										{...propsWithoutSubItems}
										{...additionalProps}
									/>
									{subItems && (
										<MenuList>
											{subItems.map((item, subIndex) => (
												<MenuItem
													as={RouterLink}
													to={item.to}
													key={`mainnav${index}-${subIndex}`}>
													{item.label}
												</MenuItem>
											))}
										</MenuList>
									)}
								</Menu>
							);
						} else {
							return (
								<NavTab
									key={`mainnav${index}`}
									{...propsWithoutSubItems}
									{...additionalProps}
								/>
							);
						}
					})}
				</HStack>
			</Container>
		</Box>
	);
};

const MobileNavigation: FC<Pick<NavigationMenuProps, "closeMobileNav">> = ({
	closeMobileNav,
}) => {
	return (
		<Stack
			p={4}
			display={{ md: "none" }}
			borderBottom="1px solid"
			borderColor={useColorModeValue("gray.200", "gray.700")}>
			{navItems.map((navItem, index) => (
				<MobileNavItem
					key={`mainmobilenav${index}`}
					index={index}
					closeMobileNav={closeMobileNav}
					{...navItem}
				/>
			))}
		</Stack>
	);
};

const MobileNavItem: FC<
	NavItem & {
		index: number;
		closeMobileNav: NavigationMenuProps["closeMobileNav"];
	}
> = ({ closeMobileNav, ...props }) => {
	const { isOpen, onToggle } = useDisclosure();

	const onClickHandler = useCallback(() => {
		if (props.subItems) {
			// Toggle accordeon
			onToggle();
		} else {
			// Close menu on navigate
			closeMobileNav();
		}
	}, [closeMobileNav, onToggle, props.subItems]);

	return (
		<Stack spacing={4} onClick={onClickHandler}>
			<Box>
				<Flex
					py={2}
					as={RouterLink}
					to={props.to ?? "#"}
					justify="space-between"
					align="center"
					_hover={{
						textDecoration: "none",
					}}>
					<Box display="flex" alignItems="center">
						{props.icon}
						<Text as="span" marginLeft={2}>
							{props.label}
						</Text>
					</Box>
					{props.subItems && (
						<Icon
							as={FiChevronDown}
							transition="all .25s ease-in-out"
							transform={isOpen ? "rotate(180deg)" : ""}
							w={6}
							h={6}
						/>
					)}
				</Flex>

				<Collapse
					in={isOpen}
					animateOpacity
					style={{ marginTop: "0 !important" }}>
					<Stack
						mt={1}
						pl={4}
						borderLeft={1}
						borderStyle="solid"
						borderColor={useColorModeValue("gray.200", "gray.700")}
						align="start">
						{props.subItems &&
							props.subItems.map((subItem, subIndex) => (
								<Link
									as={RouterLink}
									key={`mainmobilenav${props.index}-${subIndex}`}
									py={2}
									onClick={closeMobileNav}
									to={subItem.to}>
									{subItem.label}
								</Link>
							))}
					</Stack>
				</Collapse>
			</Box>
		</Stack>
	);
};

export { NavigationMenu };
