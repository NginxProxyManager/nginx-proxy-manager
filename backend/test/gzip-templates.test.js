import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import utils from "../lib/utils.js";

const render = async (templateName, data) => {
	const template = fs.readFileSync(new URL(`../templates/${templateName}`, import.meta.url), "utf8");
	return utils.getRenderEngine().parseAndRender(template, data);
};

test("renders managed gzip settings", async () => {
	const config = await render("_gzip.conf", {
		gzip_enabled: true,
		gzip_comp_level: 7,
		gzip_types: ["application/json", "text/css"],
	});

	assert.match(config, /gzip on;/);
	assert.match(config, /gzip_comp_level 7;/);
	assert.match(config, /gzip_types application\/json text\/css;/);
});

test("can disable gzip for one proxy host", async () => {
	const config = await render("_gzip.conf", {
		gzip_enabled: false,
		gzip_comp_level: 1,
		gzip_types: [],
	});

	assert.doesNotMatch(config, /gzip on;/);
	assert.match(config, /gzip off;/);
	assert.doesNotMatch(config, /gzip_types/);
});

test("keeps the default compression level without additional MIME types", async () => {
	const config = await render("_gzip.conf", {
		gzip_enabled: true,
		gzip_comp_level: 1,
		gzip_types: [],
	});
	assert.match(config, /gzip on;/);
	assert.match(config, /gzip_comp_level 1;/);
	assert.doesNotMatch(config, /gzip_types/);
});
