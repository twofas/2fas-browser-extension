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

const fs = require('fs');
const path = require('path');

const pkg = require('../../package.json');
const platform = process.env.PLATFORM;
const mode = process.env.MODE;

if (!platform || !mode) {
  console.error('PLATFORM and MODE environment variables are required');
  process.exit(1);
}

const srcDir = path.resolve(__dirname, '../../public');
const destDirName = `2fas-auth-browser-extension-${pkg.version}-${platform}-${mode}`;
const destDir = path.resolve(__dirname, '../../build', destDirName);

/**
 * Recursively copy directory contents
 * @param {string} src - Source directory path
 * @param {string} dest - Destination directory path
 */
const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

copyDir(srcDir, destDir);
console.log(`Copied build to: ${destDirName}`);
