#!/usr/bin/env node

// This file does a few things to ensure that the Locales are present and valid:
// - Ensures that the name of the locale exists in the language list
// - Ensures that each locale contains the translations used in the application
// - Ensures that there are no unused translations in the locale files
// - Also checks the error messages returned by the backend

const allLocales = [
  ["en", "en-US"],
  ["de", "de-DE"],
  ["pt", "pt-PT"],
  ["es", "es-ES"],
  ["fr", "fr-FR"],
  ["it", "it-IT"],
  ["ja", "ja-JP"],
  ["nl", "nl-NL"],
  ["pl", "pl-PL"],
  ["ru", "ru-RU"],
  ["sk", "sk-SK"],
  ["vi", "vi-VN"],
  ["zh", "zh-CN"],
  ["ko", "ko-KR"],
  ["bg", "bg-BG"],
  ["id", "id-ID"],
  ["tr", "tr-TR"],
  ["hu", "hu-HU"],
];

const ignoreUnused = [/^.*$/];

const { spawnSync } = require("child_process");
const fs = require("fs");

const tmp = require("tmp");

// Parse backend errors
const BACKEND_ERRORS_FILE = "../backend/internal/errors/errors.go";
const BACKEND_ERRORS = [];
/*
try {
	const backendErrorsContent = fs.readFileSync(BACKEND_ERRORS_FILE, "utf8");
	const backendErrorsContentRes = [
		...backendErrorsContent.matchAll(/(?:errors|eris)\.New\("([^"]+)"\)/g),
	];
	backendErrorsContentRes.map((item) => {
		BACKEND_ERRORS.push("error." + item[1]);
		return null;
	});
} catch (err) {
	console.log("\x1b[31m%s\x1b[0m", err);
	process.exit(1);
}
*/

// get all translations used in frontend code
const tmpobj = tmp.fileSync({ postfix: ".json" });
spawnSync("yarn", ["locale-extract", "--out-file", tmpobj.name]);

const allLocalesInProject = require(tmpobj.name);

// get list og language names and locales
const langList = require("./src/locale/src/lang-list.json");

// store a list of all validation errors
const allErrors = [];
const allWarnings = [];
const allKeys = [];

const checkLangList = (fullCode) => {
  const key = "locale-" + fullCode;
  if (typeof langList[key] === "undefined") {
    allErrors.push("ERROR: `" + key + "` language does not exist in lang-list.json");
  }
};

const compareLocale = (locale) => {
  const projectLocaleKeys = Object.keys(allLocalesInProject);
  // Check that locale contains the items used in the codebase
  projectLocaleKeys.map((key) => {
    if (typeof locale.data[key] === "undefined") {
      allErrors.push("ERROR: `" + locale[0] + "` does not contain item: `" + key + "`");
    }
    return null;
  });
  // Check that locale contains all error.* items
  BACKEND_ERRORS.forEach((key) => {
    if (typeof locale.data[key] === "undefined") {
      allErrors.push("ERROR: `" + locale[0] + "` does not contain item: `" + key + "`");
    }
    return null;
  });

  // Check that locale does not contain items not used in the codebase
  const localeKeys = Object.keys(locale.data);
  localeKeys.map((key) => {
    let ignored = false;
    ignoreUnused.map((regex) => {
      if (key.match(regex)) {
        ignored = true;
      }
      return null;
    });

    if (!ignored && typeof allLocalesInProject[key] === "undefined") {
      // ensure this key doesn't exist in the backend errors either
      if (!BACKEND_ERRORS.includes(key)) {
        allErrors.push("ERROR: `" + locale[0] + "` contains unused item: `" + key + "`");
      }
    }

    // Add this key to allKeys
    if (allKeys.indexOf(key) === -1) {
      allKeys.push(key);
    }
    return null;
  });
};

// Checks for any keys missing from this locale, that
// have been defined in any other locales
const checkForMissing = (locale) => {
  allKeys.forEach((key) => {
    if (typeof locale.data[key] === "undefined") {
      allWarnings.push("WARN: `" + locale[0] + "` does not contain item: `" + key + "`");
    }
    return null;
  });
};

// Local all locale data
allLocales.map((locale, idx) => {
  checkLangList(locale[1]);
  allLocales[idx].data = require("./src/locale/src/" + locale[0] + ".json");
  return null;
});

// Verify all locale data
allLocales.map((locale) => {
  compareLocale(locale);
  checkForMissing(locale);
  return null;
});

if (allErrors.length) {
  allErrors.map((err) => {
    console.log("\x1b[31m%s\x1b[0m", err);
    return null;
  });
}
if (allWarnings.length) {
  allWarnings.map((err) => {
    console.log("\x1b[33m%s\x1b[0m", err);
    return null;
  });
}

if (allErrors.length) {
  process.exit(1);
}

console.log("\x1b[32m%s\x1b[0m", "Locale check passed");
process.exit(0);
