import express from "express";
import { debug, express as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const router = express.Router({
    caseSensitive: true,
    strict: true,
    mergeParams: true,
});

/**
 * /api/version/check
 */
router
    .route("/check")
    .options((_, res) => {
        res.sendStatus(204);
    })

    /**
     * GET /api/version/check
     *
     * Check for available updates
     */
    .get(async (req, res, next) => {
        try {
            const response = await fetch(
                "https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest"
            );

            if (!response.ok) {
                throw new Error(`GitHub API returned ${response.status}`);
            }

            const data = await response.json();
            const latestVersion = data.tag_name;

            const version = pjson.version.split("-").shift().split(".");
            const currentVersion = `v${version[0]}.${version[1]}.${version[2]}`;

            res.status(200).send({
                current: currentVersion,
                latest: latestVersion,
                updateAvailable: compareVersions(currentVersion, latestVersion),
            });
        } catch (error) {
            debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
            res.status(200).send({
                current: null,
                latest: null,
                updateAvailable: false,
            });
        }
    });

/**
 * Compare two version strings
 *
 */
function compareVersions(current, latest) {
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
}

export default router;