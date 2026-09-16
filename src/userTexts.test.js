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

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Product rule: the extension never tells a user to reinstall it. The way out of
// a broken identity is Reset Browser Extension on the options page, then pairing
// again — a reinstall would not clear the state on Safari and loses nothing a
// Reset would not.
const src = path.dirname(fileURLToPath(import.meta.url));
const localeDir = path.join(src, '_locales', 'en');

const userFacingTexts = () => {
  const texts = [];

  for (const file of readdirSync(localeDir).filter(name => name.endsWith('.json'))) {
    const messages = JSON.parse(readFileSync(path.join(localeDir, file), 'utf8'));

    for (const [key, entry] of Object.entries(messages)) {
      texts.push([`${file}:${key}`, entry?.message ?? '']);
    }
  }

  const pages = ['optionsPage/optionsPage.html', 'installPage/installPage.html'];

  for (const entry of readdirSync(path.join(src, 'views'), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      pages.push(path.relative(src, path.join(entry.parentPath ?? entry.path, entry.name)));
    }
  }

  for (const page of pages) {
    texts.push([page, readFileSync(path.join(src, page), 'utf8')]);
  }

  return texts;
};

describe('user-facing texts', () => {
  it('never advise a reinstall', () => {
    const offenders = userFacingTexts().filter(([, text]) => /re-?install/i.test(text)).map(([where]) => where);

    expect(offenders).toEqual([]);
  });

  it('the signing repair texts point at Reset Browser Extension', () => {
    const messages = JSON.parse(readFileSync(path.join(localeDir, 'notifications.json'), 'utf8'));

    for (const key of ['errorSigningRequiredMessage', 'errorSigningKeyConflictMessage', 'errorStorageIntegrityMessage']) {
      expect(messages[key].message).toMatch(/Reset Browser Extension/);
      expect(messages[key].message).toMatch(/pair/i);
    }
  });
});
