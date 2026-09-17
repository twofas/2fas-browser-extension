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

// Console output for key-adjacent modules. Every argument passes through the
// key-material redactor before it reaches the console, so an error that echoes
// a key (a backend Reason, a request body, a parser message) prints as
// kind+length markers. ESLint forbids a raw `console` in those modules (see
// eslint.config.js). Its only import is the import-free redactor, so it is safe
// in every bundle, content scripts included.

import { redactLogValue } from './redactKeyMaterial.js';

/**
 * Builds a console printer that redacts every argument first. The console
 * method is looked up at call time, so a replaced or spied console is honoured,
 * and nothing is ever thrown: callers print from catch blocks.
 * @param {'error'|'warn'|'log'} method - The console method to print through.
 * @return {function(...*): void} The redacting printer.
 */
const redactingPrinter = method => (...args) => {
  try {
    console[method](...args.map(arg => redactLogValue(arg)));
  } catch {}
};

/**
 * Redacting console: `error`, `warn` and `log` print key-free copies of their
 * arguments (see {@link redactLogValue}). An Error prints as its redacted
 * `{name, message, stack, cause}`. Redaction is idempotent, so an already
 * redacted value prints unchanged.
 * @type {Readonly<{error: function(...*): void, warn: function(...*): void, log: function(...*): void}>}
 */
const safeConsole = Object.freeze({
  error: redactingPrinter('error'),
  warn: redactingPrinter('warn'),
  log: redactingPrinter('log')
});

export default safeConsole;
