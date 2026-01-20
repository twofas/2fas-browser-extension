//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2026 Two Factor Authentication Service, Inc.
//  Contributed by Grzegorz Zając. All rights reserved.
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program. If not, see <https://www.gnu.org/licenses/>
//

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const LOCALES_PATH = './src/_locales';

const urls = {
  en: `https://localise.biz/api/export/locale/en.json?format=chrome&key=${process.env.LOCO_KEY}`
};

/**
 * Validates that the LOCO_KEY environment variable is set.
 */
const validateEnv = () => {
  if (!process.env.LOCO_KEY) {
    console.error('LOCO_KEY environment variable is not set.');
    process.exit(1);
  }
};

/**
 * Gets all locale directories in the _locales folder.
 * @return {Array<string>} Array of locale codes (e.g., ['en', 'pl'])
 */
const getLocaleDirectories = () => {
  const localesPath = LOCALES_PATH;

  if (!fs.existsSync(localesPath)) {
    console.error(`Locales folder not found: ${localesPath}`);
    process.exit(1);
  }

  return fs.readdirSync(localesPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
};

/**
 * Gets all JSON files in a locale directory.
 * @param {string} locale - The locale code
 * @return {Array<string>} Array of JSON file names
 */
const getLocaleFiles = locale => {
  const localePath = path.join(LOCALES_PATH, locale);

  return fs.readdirSync(localePath)
    .filter(file => file.endsWith('.json'));
};

/**
 * Reads and parses all locale files for all locales.
 * @param {Array<string>} locales - Array of locale codes
 * @return {Object} Object mapping locale -> fileName -> parsed JSON data
 */
const readAllLocaleFiles = locales => {
  const files = {};
  const keys = {};

  locales.forEach(locale => {
    const fileNames = getLocaleFiles(locale);

    files[locale] = {};

    fileNames.forEach(fileName => {
      const filePath = path.join(LOCALES_PATH, locale, fileName);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      files[locale][fileName] = content;
      keys[fileName] = Object.keys(content);
    });
  });

  return { files, keys };
};

/**
 * Downloads locale data from Loco API.
 * @async
 * @param {Object} urls - Object mapping locale codes to Loco API URLs
 * @return {Promise<Object>} Object mapping locale codes to downloaded data
 */
const downloadFromLoco = async urls => {
  const fetchConfig = {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };

  const results = await Promise.all(
    Object.keys(urls).map(async locale => {
      const res = await fetch(urls[locale], fetchConfig);

      return { [locale]: await res.json() };
    })
  );

  return Object.assign({}, ...results);
};

/**
 * Updates local files with data from Loco and tracks unused keys.
 * @param {Object} locoContent - Downloaded Loco data
 * @param {Object} files - Local files data
 * @param {Object} keys - Keys per file
 * @return {Object} Object containing updated files and unused keys info
 */
const updateFilesWithLocoData = (locoContent, files, keys) => {
  const unusedKeysByLocale = {};

  Object.keys(locoContent).forEach(locale => {
    const locoData = locoContent[locale];
    const locoKeys = Object.keys(locoData);
    const usedKeys = new Set();

    Object.keys(keys).forEach(fileName => {
      keys[fileName].forEach(key => {
        if (locoData[key]) {
          files[locale][fileName][key] = locoData[key];
          usedKeys.add(key);
        }
      });
    });

    const unusedKeys = locoKeys.filter(key => !usedKeys.has(key));

    if (unusedKeys.length > 0) {
      unusedKeysByLocale[locale] = unusedKeys;
    }
  });

  return { files, unusedKeysByLocale };
};

/**
 * Writes updated files back to disk.
 * @param {Object} files - Object mapping locale -> fileName -> data
 * @return {number} Number of files written
 */
const writeFiles = files => {
  let filesWritten = 0;

  Object.keys(files).forEach(locale => {
    Object.keys(files[locale]).forEach(fileName => {
      const filePath = path.join(LOCALES_PATH, locale, fileName);
      const data = JSON.stringify(files[locale][fileName], null, 2);

      fs.writeFileSync(filePath, data, 'utf8');
      filesWritten++;
    });
  });

  return filesWritten;
};

/**
 * Prints unused keys report to console.
 * @param {Object} unusedKeysByLocale - Object mapping locale codes to arrays of unused keys
 */
const printUnusedKeysReport = unusedKeysByLocale => {
  Object.keys(unusedKeysByLocale).forEach(locale => {
    const unusedKeys = unusedKeysByLocale[locale];

    if (unusedKeys.length > 0) {
      console.log(`\n[${locale}] ${unusedKeys.length} keys from Loco not found in local files:`);
      unusedKeys.forEach(key => {
        console.log(`  - ${key}`);
      });
    }
  });
};

/**
 * Main function that orchestrates the import process.
 */
const main = async () => {
  validateEnv();

  const locales = getLocaleDirectories();
  const languages = Object.keys(urls);

  console.log(`Found locales: ${locales.join(', ')}`);
  console.log(`Languages to process from Loco: ${languages.join(', ')}\n`);

  const { files, keys } = readAllLocaleFiles(locales);

  console.log('Downloading translations from Loco...');
  const locoContent = await downloadFromLoco(urls);

  const { files: updatedFiles, unusedKeysByLocale } = updateFilesWithLocoData(
    locoContent,
    files,
    keys
  );

  const filesWritten = writeFiles(updatedFiles);

  printUnusedKeysReport(unusedKeysByLocale);

  console.log(`\nUpdated ${filesWritten} locale files.`);
};

main().catch(err => {
  console.error('Error during import:', err);
  process.exit(1);
});
