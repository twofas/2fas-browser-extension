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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Everything here is anchored on `default_locale`, never on a named language, so the
// checks hold whether the repository ships one catalogue or twenty. They exist because
// two mechanisms in this project fail silently: generateLocales.js merges each locale's
// files with Object.assign (a duplicated key just disappears), and untranslated or
// dropped literal tokens survive as visible text because the code injects values with
// String.replace instead of i18n substitutions.
const src = path.dirname(fileURLToPath(import.meta.url));

const manifestFile = name => path.join(src, 'manifest', `${name}.json`);

const DEFAULT_LOCALE = JSON.parse(readFileSync(manifestFile('chrome'), 'utf8')).default_locale;

const localeNames = readdirSync(path.join(src, '_locales')).filter(name =>
  statSync(path.join(src, '_locales', name)).isDirectory()
);

const otherLocales = localeNames.filter(name => name !== DEFAULT_LOCALE);

// Literal tokens the code substitutes. Listed longest-first so nested spellings
// (`CURRENT_DOMAIN` contains `DOMAIN`) are attributed to the longest match.
const SUBSTITUTION_TOKENS = ['CURRENT_DOMAIN', 'TOP_DOMAIN', 'DEVICE_NAME', 'DOMAIN', 'DIFF'];

// The contract translators have to honour: which message carries which token, how many
// times, and therefore which message must NOT grow a stray one. Keyed on default_locale.
const TOKENISED_MESSAGES = [
  { file: 'general.json', key: 'modalDisconnectDeviceText', tokens: { DEVICE_NAME: 1 } },
  { file: 'general.json', key: 'modalExcludeDomainText', tokens: { DOMAIN: 1 } },
  { file: 'notifications.json', key: 'errorPushExpiredTitle', tokens: { DOMAIN: 1 } },
  { file: 'notifications.json', key: 'warningTooSoonMessage', tokens: { DIFF: 1 } },
  { file: 'notifications.json', key: 'warningCrossDomainMessage', tokens: { CURRENT_DOMAIN: 1, TOP_DOMAIN: 1 } },
  { file: 'notifications.json', key: 'warningCrossDomainNoAccessMessage', tokens: { CURRENT_DOMAIN: 1 } }
];

// Tokens the pairing-name template expects, see getBrowserInfo.js.
const NAME_PATTERN_TOKENS = ['BROWSER', 'OS', 'ID'];

const localeDir = locale => path.join(src, '_locales', locale);

const jsonFiles = locale => readdirSync(localeDir(locale)).filter(name => name.endsWith('.json')).sort();

const catalogue = (locale, file) => JSON.parse(readFileSync(path.join(localeDir(locale), file), 'utf8'));

const countToken = (text, token) =>
  [...text.matchAll(new RegExp(`(?<![A-Z_])${token}(?![A-Z_])`, 'g'))].length;

const tokenCounts = text => {
  const counts = {};

  for (const token of SUBSTITUTION_TOKENS) {
    const seen = countToken(text, token);

    if (seen) {
      counts[token] = seen;
    }
  }

  return counts;
};

const sameCounts = (a, b) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// Keys the code reaches for through String.replace, harvested rather than remembered so a
// new substitution has to be added to the table above before the suite goes green.
const tokensReplacedInCode = () => {
  const found = new Set();

  for (const entry of readdirSync(src, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) {
      continue;
    }

    const file = path.join(entry.parentPath ?? entry.path, entry.name);

    for (const match of readFileSync(file, 'utf8').matchAll(/\.replace\(\s*'([A-Z][A-Z_]{2,})'/g)) {
      found.add(match[1]);
    }
  }

  return found;
};

const templateFiles = () => {
  const pages = ['optionsPage/optionsPage.html', 'installPage/installPage.html'];

  for (const entry of readdirSync(path.join(src, 'views'), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      pages.push(path.join('views', path.relative(path.join(src, 'views'), path.join(entry.parentPath ?? entry.path, entry.name))));
    }
  }

  return pages;
};

const defaultMessages = () => {
  const messages = new Map();

  for (const file of jsonFiles(DEFAULT_LOCALE)) {
    for (const [key, entry] of Object.entries(catalogue(DEFAULT_LOCALE, file))) {
      messages.set(key, { file, message: entry.message });
    }
  }

  return messages;
};

describe('locale catalogues', () => {
  it('declares the default locale the manifests are built against', () => {
    const drift = [];

    for (const name of ['chrome', 'edge', 'firefox', 'safari']) {
      const manifest = JSON.parse(readFileSync(manifestFile(name), 'utf8'));

      if (manifest.default_locale !== DEFAULT_LOCALE) {
        drift.push(`${name}.json: ${manifest.default_locale}`);
      }
    }

    expect(drift).toEqual([]);
    expect(localeNames).toContain(DEFAULT_LOCALE);
  });

  it('never declares the same key in two files of one locale', () => {
    const collisions = [];

    for (const locale of localeNames) {
      const owner = new Map();

      for (const file of jsonFiles(locale)) {
        for (const key of Object.keys(catalogue(locale, file))) {
          if (owner.has(key)) {
            collisions.push(`${locale}/${key}: ${owner.get(key)} vs ${file}`);
          } else {
            owner.set(key, file);
          }
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it('ships the same files in every locale as the default locale', () => {
    const expected = jsonFiles(DEFAULT_LOCALE);
    const drift = otherLocales.filter(locale => JSON.stringify(jsonFiles(locale)) !== JSON.stringify(expected));

    expect(drift, `files differ from ${DEFAULT_LOCALE} (${expected.join(',')})`).toEqual([]);
  });

  it('defines the same keys per file in every locale', () => {
    const mismatches = [];

    for (const locale of otherLocales) {
      for (const file of jsonFiles(DEFAULT_LOCALE)) {
        if (!jsonFiles(locale).includes(file)) {
          continue;
        }

        const base = Object.keys(catalogue(DEFAULT_LOCALE, file));
        const other = Object.keys(catalogue(locale, file));

        const missing = base.filter(key => !other.includes(key));
        const extra = other.filter(key => !base.includes(key));

        if (missing.length || extra.length) {
          mismatches.push(`${locale}/${file}: missing ${missing.join(',')} extra ${extra.join(',')}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('carries exactly the tokens the code substitutes, in every locale', () => {
    const broken = [];

    for (const locale of localeNames) {
      for (const { file, key, tokens } of TOKENISED_MESSAGES) {
        const entry = catalogue(locale, file)?.[key];

        if (!entry) {
          broken.push(`${locale}/${file}:${key} missing`);
          continue;
        }

        const found = tokenCounts(entry.message);

        if (!sameCounts(found, tokens)) {
          broken.push(`${locale}/${file}:${key} expected ${JSON.stringify(tokens)} found ${JSON.stringify(found)}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it('keeps the token table covering every substitution the code performs', () => {
    const replaced = tokensReplacedInCode();
    const tabled = new Set(TOKENISED_MESSAGES.flatMap(entry => Object.keys(entry.tokens)));

    const undeclared = [...replaced].filter(token => !tabled.has(token));
    const unused = [...tabled].filter(token => !replaced.has(token));

    expect(undeclared, 'String.replace targets missing from TOKENISED_MESSAGES').toEqual([]);
    expect(unused, 'TOKENISED_MESSAGES entries no longer replaced anywhere in src').toEqual([]);
  });

  it('leaves no message holding a token the table does not declare', () => {
    const declared = new Map(TOKENISED_MESSAGES.map(entry => [entry.key, entry.tokens]));
    const strays = [];

    for (const locale of localeNames) {
      for (const file of jsonFiles(locale)) {
        for (const [key, entry] of Object.entries(catalogue(locale, file))) {
          if (declared.has(key)) {
            continue;
          }

          const found = tokenCounts(entry.message);

          if (Object.keys(found).length) {
            strays.push(`${locale}/${file}:${key} -> ${JSON.stringify(found)}`);
          }
        }
      }
    }

    expect(strays, 'a literal token would reach the screen untranslated').toEqual([]);
  });

  it('resolves the pairing name pattern in every locale', () => {
    const broken = [];

    for (const locale of localeNames) {
      const pattern = catalogue(locale, 'general.json')?.deviceNamePattern?.message;

      if (!pattern) {
        broken.push(`${locale}: deviceNamePattern missing`);
        continue;
      }

      for (const token of NAME_PATTERN_TOKENS) {
        if (countToken(pattern, token) !== 1) {
          broken.push(`${locale}: ${token} x${countToken(pattern, token)}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it('falls back to exactly the default locale wording where the code hardcodes one', () => {
    // Two catalogues are read through a `|| 'literal'` guard so a missing message still
    // renders; if that guard drifts from default_locale, English output changes silently.
    const drift = [];
    const sources = [
      { file: 'optionsPage/functions/generateDevicesList.js', key: 'pairDateFormat', target: 'optionsPage.json' },
      { file: 'background/functions/getBrowserInfo.js', key: 'deviceNamePattern', target: 'general.json' }
    ];

    for (const { file, key, target } of sources) {
      const code = readFileSync(path.join(src, file), 'utf8');
      const guard = code.match(new RegExp(`getMessage\\('${key}'\\)\\s*\\|\\|\\s*'([^']*)'`));
      const declared = catalogue(DEFAULT_LOCALE, target)?.[key]?.message;

      if (!guard) {
        drift.push(`${file}: no fallback guard for ${key}`);
      } else if (guard[1] !== declared) {
        drift.push(`${file}: ${key} guard ${JSON.stringify(guard[1])} != ${DEFAULT_LOCALE} ${JSON.stringify(declared)}`);
      }
    }

    expect(drift).toEqual([]);
  });

  it('has a default-locale message for every data-i18n reference', () => {
    const messages = defaultMessages();
    const dangling = [];

    for (const page of templateFiles()) {
      for (const match of readFileSync(path.join(src, page), 'utf8').matchAll(/data-i18n="([^"]+)"/g)) {
        if (!messages.has(match[1])) {
          dangling.push(`${page} ${match[1]}`);
        }
      }
    }

    expect(dangling).toEqual([]);
  });

  it('has a default-locale message for every __MSG_ the manifests reference', () => {
    // A missing key here is not cosmetic: the browser refuses to load the extension.
    const messages = defaultMessages();
    const missing = [];

    for (const name of ['chrome', 'edge', 'firefox', 'safari']) {
      for (const match of readFileSync(manifestFile(name), 'utf8').matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
        if (!messages.has(match[1])) {
          missing.push(`${name}.json ${match[1]}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('never ships an empty message', () => {
    const blanks = [];

    for (const locale of localeNames) {
      for (const file of jsonFiles(locale)) {
        for (const [key, entry] of Object.entries(catalogue(locale, file))) {
          if (typeof entry.message !== 'string' || entry.message.trim() === '') {
            blanks.push(`${locale}/${file}:${key}`);
          }
        }
      }
    }

    expect(blanks).toEqual([]);
  });

  it('builds user-facing strings from catalogues, not literals, in the icon picker', () => {
    const code = readFileSync(path.join(src, 'optionsPage/functions/setIconSelect.js'), 'utf8');

    expect(code).not.toMatch(/text: 'Default'/);
    expect(code).not.toMatch(/text: 'Type [12]'/);

    for (const key of ['iconDefault', 'iconType1', 'iconType2']) {
      expect(catalogue(DEFAULT_LOCALE, 'optionsPage.json')[key], key).toBeTruthy();
    }
  });
});
