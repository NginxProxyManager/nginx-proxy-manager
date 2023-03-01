import {
	Avatar,
	Box,
	Button,
	chakra,
	Container,
	Flex,
	HStack,
	Icon,
	IconButton,
	Menu,
	MenuButton,
	MenuDivider,
	MenuItem,
	MenuList,
	Text,
	useColorModeValue,
	useDisclosure,
} from "@chakra-ui/react";
import { ThemeSwitcher } from "components";
import { useAuthState } from "context";
import { useUser } from "hooks";
import { intl } from "locale";
import { ChangePasswordModal, ProfileModal } from "modals";
import { FiLock, FiLogOut, FiMenu, FiUser, FiX } from "react-icons/fi";

interface NavigationHeaderProps {
	mobileNavIsOpen: boolean;
	toggleMobileNav: () => void;
}
function NavigationHeader({
	mobileNavIsOpen,
	toggleMobileNav,
}: NavigationHeaderProps) {
	const passwordDisclosure = useDisclosure();
	const profileDisclosure = useDisclosure();
	const { data: user } = useUser("me");
	const { logout } = useAuthState();

	return (
		<Box
			h={16}
			borderBottom="1px solid"
			borderColor={useColorModeValue("gray.200", "gray.700")}>
			<Container h="full" maxW="container.xl">
				<Flex h="full" alignItems="center" justifyContent="space-between">
					<IconButton
						display={{ base: "block", md: "none" }}
						position="relative"
						bg="transparent"
						aria-label={
							mobileNavIsOpen
								? intl.formatMessage({ id: "navigation.close" })
								: intl.formatMessage({ id: "navigation.open" })
						}
						onClick={toggleMobileNav}
						icon={<Icon as={mobileNavIsOpen ? FiX : FiMenu} />}
					/>
					<HStack height="full" paddingY={3} spacing={4}>
						<chakra.img src="/images/logo-no-text.svg" alt="" height="full" />
						<Text
							display={{ base: "none", md: "block" }}
							fontSize="2xl"
							fontWeight="bold">
							{intl.formatMessage({ id: "brand.name" })}
						</Text>
					</HStack>
					<HStack>
						<ThemeSwitcher background="transparent" />
						<Box pl={2}>
							<Menu>
								<MenuButton
									data-testid="profile-menu"
									as={Button}
									rounded="full"
									variant="link"
									cursor="pointer"
									minW={0}>
									<Avatar size="sm" src={user?.gravatarUrl} />
								</MenuButton>
								<MenuList>
									<MenuItem
										icon={<Icon as={FiUser} />}
										onClick={profileDisclosure.onOpen}>
										{intl.formatMessage({ id: "profile.title" })}
									</MenuItem>
									<MenuItem
										data-testid="profile-menu-change-password"
										icon={<Icon as={FiLock} />}
										onClick={passwordDisclosure.onOpen}>
										{intl.formatMessage({ id: "change-password" })}
									</MenuItem>
									<MenuDivider />
									<MenuItem onClick={logout} icon={<Icon as={FiLogOut} />}>
										{intl.formatMessage({ id: "profile.logout" })}
									</MenuItem>
								</MenuList>
							</Menu>
						</Box>
					</HStack>
				</Flex>
			</Container>
			<ProfileModal
				isOpen={profileDisclosure.isOpen}
				onClose={profileDisclosure.onClose}
			/>
			<ChangePasswordModal
				isOpen={passwordDisclosure.isOpen}
				onClose={passwordDisclosure.onClose}
			/>
		</Box>
	);
}

export { NavigationHeader };
