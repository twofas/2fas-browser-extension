//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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
const readdir = require('node:fs').promises.readdir;

const getDirectories = async source =>
  (await readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

let locoContent = {};
let locales = [];
const keys = {};
const files = {};

const urls = {
  en: `https://localise.biz/api/export/locale/en.json?key=${process.env.LOCO_KEY}`
};

const fetchConfig = {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
};

Promise.all(Object.keys(urls).map(locale => {
  return fetch(urls[locale], fetchConfig).then(async res => {
    return {
      [locale]: await res.json()
    }
  });
})).then(res => Object.assign({}, ...res))
  .then(res => {
    locoContent = res;
    return getDirectories('./src/_locales');
  })
  .then(res => {
    locales = res;
    return fs.readdirSync(`./src/_locales/${locales[0]}`);
  })
  .then(fileNames => {
    return fileNames.forEach(fileName => {
      return locales.forEach(locale => {
        const f = JSON.parse(fs.readFileSync(`./src/_locales/${locale}/${fileName}`, 'utf8'));
        
        if (!files[locale]) {
          files[locale] = {};
        }

        files[locale][fileName] = f;
        keys[fileName] = Object.keys(f);
      });
    });
  })
  .then(() => {
    return Object.keys(keys).forEach(fileName => {
      return keys[fileName].forEach(key => {
        return locales.forEach(locale => {
          if (locoContent[locale][key]) {
            files[locale][fileName][key] = locoContent[locale][key];
          }
        });
      });
    });
  })
  .then(() => {
    return Object.keys(files).forEach(locale => {
      return Object.keys(files[locale]).forEach(fileName => {
        const data = JSON.stringify(files[locale][fileName], null, 2);
        fs.writeFileSync(`./src/_locales/${locale}/${fileName}`, data);
      });
    });
  });
