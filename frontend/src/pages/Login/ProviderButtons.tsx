import {
	IconBrandApple,
	IconBrandAzure,
	IconBrandBitbucket,
	IconBrandDiscord,
	IconBrandGithub,
	IconBrandGitlab,
	IconBrandGoogle,
	IconBrandSlack,
	IconBrandWindows,
	IconKey,
	IconShieldLock,
} from "@tabler/icons-react";
import { type LoginProvider, providerLoginUrl } from "src/api/backend";
import { T } from "src/locale";

/**
 * Discovery documents carry no logo, so a provider's icon is guessed from its
 * name. Order matters: Entra is Microsoft's, but has an icon of its own.
 */
const BRAND_ICONS: Array<[RegExp, typeof IconKey]> = [
	[/google/i, IconBrandGoogle],
	[/github/i, IconBrandGithub],
	[/gitlab/i, IconBrandGitlab],
	[/azure|entra/i, IconBrandAzure],
	[/microsoft|office|windows/i, IconBrandWindows],
	[/apple/i, IconBrandApple],
	[/discord/i, IconBrandDiscord],
	[/slack/i, IconBrandSlack],
	[/bitbucket/i, IconBrandBitbucket],
];

export function getProviderIcon(provider: Pick<LoginProvider, "name" | "type">) {
	for (const [pattern, Icon] of BRAND_ICONS) {
		if (pattern.test(provider.name)) {
			return Icon;
		}
	}
	return provider.type === "saml" ? IconShieldLock : IconKey;
}

interface ProviderButtonsProps {
	providers: LoginProvider[];
}

/**
 * Loaded on its own, so the brand icons are only downloaded by instances that
 * actually offer redirect based sign in.
 */
export default function ProviderButtons({ providers }: ProviderButtonsProps) {
	return (
		<div className="d-grid gap-2">
			{providers.map((provider) => {
				const Icon = getProviderIcon(provider);
				return (
					<a key={provider.id} href={providerLoginUrl(provider.id)} className="btn btn-outline-azure w-100">
						<Icon size={18} className="me-2" />
						<T id="login.continue-with" data={{ name: provider.name }} />
					</a>
				);
			})}
		</div>
	);
}
