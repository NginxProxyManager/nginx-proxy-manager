import { IconMoon, IconSun } from "@tabler/icons-react";
import cn from "classnames";
import { Button } from "src/components";
import { useTheme } from "src/hooks";
import styles from "./ThemeSwitcher.module.css";

interface Props {
	className?: string;
}
function ThemeSwitcher({ className }: Props) {
	const { setTheme } = useTheme();

	return (
		<div className={cn("d-print-none", "d-inline-block", className)}>
			<Button
				size="sm"
				className={cn("btn-ghost-dark", "hide-theme-dark", styles.lightBtn)}
				data-bs-toggle="tooltip"
				data-bs-placement="bottom"
				aria-label="Enable dark mode"
				data-bs-original-title="Enable dark mode"
				onClick={() => setTheme("dark")}
			>
				<IconMoon width={24} />
			</Button>
			<Button
				size="sm"
				className={cn("btn-ghost-light", "hide-theme-light", styles.darkBtn)}
				data-bs-toggle="tooltip"
				data-bs-placement="bottom"
				aria-label="Enable dark mode"
				data-bs-original-title="Enable dark mode"
				onClick={() => setTheme("light")}
			>
				<IconSun width={24} />
			</Button>
		</div>
	);
}

export { ThemeSwitcher };
