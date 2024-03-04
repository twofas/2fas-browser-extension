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

const fs = require('node:fs');
const readdir = require('node:fs').promises.readdir;

const getDirectories = async source =>
  (await readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

getDirectories('./src/_locales')
  .then(locales => {
    return locales.map(locale => {
      return {
        locale,
        files: fs.readdirSync(`./src/_locales/${locale}`)
      };
    })
  })
  .then(res => {
    return res.map(l => {
      return {
        locale: l.locale,
        content: Object.assign(...l.files.map(f => {
          f = JSON.parse(fs.readFileSync(`./src/_locales/${l.locale}/${f}`, 'utf8'));
          return f;
        }))
      }
    });
  })
  .then(res => {
    return res.map(l => {
      const c = {};

      Object.keys(l.content).forEach(key => {
        c[key] = {};
        c[key].message = l.content[key];
      });

      return {
        locale: l.locale,
        content: c
      }
    })
  })
  .then(res => {
    if (!fs.existsSync('./public/')) {
      fs.mkdirSync('./public');
    }

    if (!fs.existsSync('./public/_locales')) {
      fs.mkdirSync('./public/_locales');
    }

    return res.map(f => {
      if (!fs.existsSync(`./public/_locales/${f.locale}`)) {
        fs.mkdirSync(`./public/_locales/${f.locale}`);
      }

      fs.writeFileSync(`./public/_locales/${f.locale}/messages.json`, JSON.stringify(f.content, null, 2));

      return true;
    });
  });
