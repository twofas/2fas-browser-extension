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

import { loadFromLocalStorage } from '@localStorage/index.js';
import isContentScriptContext from '@partials/isContentScriptContext.js';
import { getOrMigrateSigningKey } from './signingKeyStore.js';
import signRequest from './signRequest.js';
import { getClockOffsetMs } from './clockOffset.js';

/**
 * Produces the signature headers for one SDK request, or {} when the request
 * must go unsigned: signing not yet active (key not confirmed registered),
 * key conflict (signing with the wrong key would 401 even inside the
 * migration window), or a signing failure (during the migration window an
 * unsigned request still succeeds; after it the 401 classifier surfaces the
 * broken state — never block the request here).
 *
 * Each call signs afresh (new nonce + timestamp) — retried requests MUST call
 * this again per attempt, or the backend's nonce replay protection rejects them.
 *
 * @async
 * @param {string} method - HTTP method.
 * @param {string} url - Absolute request URL.
 * @param {string} [body=''] - The exact string sent as the request body.
 * @param {Object} [options]
 * @param {boolean} [options.skipLog=false] - Console-only error reporting; set on
 *   the storeLog path, which must never recurse into another storeLog call.
 * @returns {Promise<Object>} Signature headers, or {} for an unsigned request.
 */
const getSigningHeaders = async (method, url, body = '', { skipLog = false } = {}) => {
  try {
    // HARD context guard: a content script runs on the page's origin — its
    // indexedDB is page-readable, so loading (and possibly promoting) the
    // private signing key here would leak key material to the page. Content
    // scripts never sign; their only API call (storeLog fallback) goes
    // unsigned, and the primary path proxies through the background worker.
    if (isContentScriptContext()) {
      return {};
    }

    const stored = await loadFromLocalStorage(['signing', 'keys']);
    const signing = stored?.signing;

    if (!signing?.active || signing?.conflict) {
      return {};
    }

    const privateKey = await getOrMigrateSigningKey({ keys: stored?.keys });

    if (!privateKey) {
      throw new Error('Signing key unavailable while signing is active');
    }

    const clockOffsetMs = await getClockOffsetMs();

    return await signRequest(method, url, body, { privateKey, clockOffsetMs });
  } catch (err) {
    if (skipLog) {
      console.error('getSigningHeaders', err);
    } else {
      try {
        // Dynamic import: storeLog uses the SDK, which uses this module — a
        // static import would create a require cycle.
        const { default: storeLog } = await import(/* webpackMode: "eager" */ '@partials/storeLog.js');
        await storeLog('error', 65, err, 'getSigningHeaders');
      } catch (logErr) {
        console.error('getSigningHeaders - log', logErr);
      }
    }

    return {};
  }
};

export default getSigningHeaders;
