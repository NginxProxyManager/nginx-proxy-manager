import { useEffect, useState } from "react";
import { useHealth } from "src/hooks";
import { T } from "src/locale";

export function SiteFooter() {
    const health = useHealth();
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false);

    const getVersion = () => {
        if (!health.data) {
            return "";
        }
        const v = health.data.version;
        return `v${v.major}.${v.minor}.${v.revision}`;
    };

    const compareVersions = (current: string, latest: string): boolean => {
        const cleanCurrent = current.replace(/^v/, "");
        const cleanLatest = latest.replace(/^v/, "");

        const currentParts = cleanCurrent.split(".").map(Number);
        const latestParts = cleanLatest.split(".").map(Number);

        for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
            const curr = currentParts[i] || 0;
            const lat = latestParts[i] || 0;

            if (lat > curr) return true;
            if (lat < curr) return false;
        }
        return false;
    };

    useEffect(() => {
        const checkForUpdates = async () => {
            try {
                const response = await fetch(
                    "https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest"
                );
                if (response.ok) {
                    const data = await response.json();
                    const latest = data.tag_name;
                    setLatestVersion(latest);

                    const currentVersion = "2.12.1";
                    if (currentVersion && compareVersions(currentVersion, latest)) {
                        setIsNewVersionAvailable(true);
                    }
                }
            } catch (error) {
                console.debug("Could not check for updates:", error);
            }
        };

        if (health.data) {
            checkForUpdates();
        }
    }, [health.data]);

    return (
        <footer className="footer d-print-none py-3">
            <div className="container-xl">
                <div className="row text-center align-items-center flex-row-reverse">
                    <div className="col-lg-auto ms-lg-auto">
                        <ul className="list-inline list-inline-dots mb-0">
                            <li className="list-inline-item">
                                <a
                                    href="https://github.com/NginxProxyManager/nginx-proxy-manager"
                                    target="_blank"
                                    className="link-secondary"
                                    rel="noopener"
                                >
                                    <T id="footer.github-fork" />
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div className="col-12 col-lg-auto mt-3 mt-lg-0">
                        <ul className="list-inline list-inline-dots mb-0">
                            <li className="list-inline-item">
                                © 2025{" "}
                                <a href="https://jc21.com" rel="noreferrer" target="_blank" className="link-secondary">
                                    jc21.com
                                </a>
                            </li>
                            <li className="list-inline-item">
                                Theme by{" "}
                                <a href="https://tabler.io" rel="noreferrer" target="_blank" className="link-secondary">
                                    Tabler
                                </a>
                            </li>
                            <li className="list-inline-item">
                                <a
                                    href={`https://github.com/NginxProxyManager/nginx-proxy-manager/releases/tag/${getVersion()}`}
                                    className="link-secondary"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    {" "}
                                    {getVersion()}{" "}
                                </a>
                            </li>
                            {isNewVersionAvailable && latestVersion && (
                                <li className="list-inline-item">
                                    <a
                                        href={`https://github.com/NginxProxyManager/nginx-proxy-manager/releases/tag/${latestVersion}`}
                                        className="link-warning fw-bold"
                                        target="_blank"
                                        rel="noopener"
                                        title={`New version ${latestVersion} is available`}
                                    >
                                        Update Available: ({latestVersion})
                                    </a>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        </footer>
    );
}