#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../src");

// Function to sort object keys recursively
function sortKeys(obj) {
	if (obj === null || typeof obj !== "object" || obj instanceof Array) {
		return obj;
	}

	const sorted = {};
	const keys = Object.keys(obj).sort();
	for (const key of keys) {
		const value = obj[key];
		if (typeof value === "object" && value !== null && !(value instanceof Array)) {
			sorted[key] = sortKeys(value);
		} else {
			sorted[key] = value;
		}
	}
	return sorted;
}

// Get all JSON files in the directory
const files = fs.readdirSync(DIR).filter((file) => {
	return file.endsWith(".json") && file !== "lang-list.json";
});

files.forEach((file) => {
	const filePath = path.join(DIR, file);
	const stats = fs.statSync(filePath);

	if (!stats.isFile()) {
		return;
	}

	if (stats.size === 0) {
		console.log(`Skipping empty file ${file}`);
		return;
	}

	try {
		// Read original content
		const originalContent = fs.readFileSync(filePath, "utf8");
		const originalJson = JSON.parse(originalContent);

		// Sort keys
		const sortedJson = sortKeys(originalJson);

		// Convert back to string with tabs
		const sortedContent = JSON.stringify(sortedJson, null, "\t") + "\n";

		// Compare (normalize whitespace)
		if (originalContent.trim() === sortedContent.trim()) {
			console.log(`${file} is already sorted`);
			return;
		}

		// Write sorted content
		fs.writeFileSync(filePath, sortedContent, "utf8");
		console.log(`Sorted ${file}`);
	} catch (error) {
		console.error(`Error processing ${file}:`, error.message);
	}
});

