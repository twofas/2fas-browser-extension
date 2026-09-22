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

/* global AbortController */
import browser from 'webextension-polyfill';
import isTransportError from '@partials/isTransportError.js';
import * as signingHeaderNames from '@background/functions/signing/signingHeaderNames.js';

// Host access decides whether the browser applies CORS to our API calls at all.
// Chromium grants host_permissions at install; Safari only once the user allows
// the site (single use / one day / every website), and WebKit bypasses CORS only
// for patterns actually GRANTED. Without that grant every API call is a CORS
// request, and the signed ones (X-2FAS-* headers) need a preflight the backend
// must allow — before server commit 95c3a84 it did not, and every signed request
// died in the browser as "Load failed", indistinguishable from being offline.
const API_HOST_PATTERN = `${new URL(process.env.API_URL).origin}/*`;

const HEALTH_PROBE_TIMEOUT_MS = 5000;

// The SDK's non-safelisted request headers (Accept is safelisted), with dummy
// values: /health is outside the signing middleware and never verifies them. Under
// CORS they force the same preflight the SDK's requests get.
const PREFLIGHTED_PROBE_HEADERS = Object.fromEntries([
  ['Content-Type', 'application/json'],
  ...Object.values(signingHeaderNames).map(name => [name, '0'])
]);

/**
 * Whether the user granted this extension access to the API host.
 *
 * @returns {Promise<?boolean>} true / false, or null when the browser cannot tell.
 */
const hasApiHostAccess = async () => {
  try {
    return Boolean(await browser.permissions.contains({ origins: [API_HOST_PATTERN] }));
  } catch {
    return null;
  }
};

/**
 * Sends GET /health, aborted after HEALTH_PROBE_TIMEOUT_MS.
 *
 * @param {Object} [headers] - Request headers; none keeps it a simple request.
 * @returns {Promise<Response>}
 */
const probeHealth = async headers => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);

  try {
    return await fetch(`${process.env.API_URL}/health`, {
      cache: 'no-store',
      signal: controller.signal,
      ...(headers ? { headers } : {})
    });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Whether the API answers a plain GET /health. No custom headers, so the browser
 * sends it without a preflight even when CORS applies.
 *
 * @returns {Promise<boolean>}
 */
const apiAnswersPlainRequest = async () => {
  try {
    return (await probeHealth()).ok;
  } catch {
    return false;
  }
};

/**
 * Whether the same GET /health with the SDK's request headers dies before any
 * response, the way a request whose preflight the browser rejected does. Any
 * response, even an error status, means the headers got through. A timeout is
 * a slow server, not a rejection.
 *
 * @returns {Promise<boolean>}
 */
const requestWithOurHeadersFails = async () => {
  try {
    await probeHealth(PREFLIGHTED_PROBE_HEADERS);

    return false;
  } catch (err) {
    return isTransportError(err);
  }
};

/**
 * Whether a failed API request was blocked by the browser rather than lost on the
 * network: it never got a response, the extension has no host access (so CORS
 * applied), the API answers a plain request, and the same request with our headers
 * still dies. The second probe keeps a network glitch on an install without host
 * access (the CORS path is permanent there) from reading as a block. The caller
 * can then point the user at the missing site access instead of "check your
 * connection".
 *
 * @param {*} err - The SDK-normalized error of the failed request.
 * @returns {Promise<boolean>}
 */
const isApiBlockedByBrowser = async err => {
  if (!err || typeof err.status === 'number' || !isTransportError(err)) {
    return false;
  }

  // The SDK's own timeout: the server was slow, the request was not refused.
  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    return false;
  }

  if ((await hasApiHostAccess()) !== false) {
    return false;
  }

  // Both at once: a hanging API costs one probe timeout, not two.
  const [plainAnswers, ourHeadersFail] = await Promise.all([apiAnswersPlainRequest(), requestWithOurHeadersFails()]);

  return plainAnswers && ourHeadersFail;
};

export { API_HOST_PATTERN, hasApiHostAccess, isApiBlockedByBrowser };
