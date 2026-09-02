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

// Substrings every engine uses for "the request never reached the server".
// Chrome: "Failed to fetch"; Firefox: "NetworkError when attempting to fetch
// resource."; Safari/WebKit: "Load failed" / "The Internet connection appears
// to be offline.".
const NETWORK_MESSAGE_HINTS = [
  'failed to fetch',
  'networkerror',
  'load failed',
  'network request failed',
  'internet connection appears to be offline',
  'the request timed out'
];

/**
 * Whether an error is a transport/backend condition rather than an extension defect:
 * the connection failed, timed out, or the API answered with a server-side status.
 *
 * Used to keep such errors OUT of the backend log. They are environment — offline,
 * captive portal, VPN, DNS, a 2FAS outage — so nobody can act on them, while the
 * volume (one per toolbar click, per options-page load, per device removal) drowns
 * the buckets that do carry defects.
 *
 * Deliberately conservative: an error with no status and no network signature —
 * a TypeError from our own code, a thrown protocol assertion — is NOT a transport
 * error and keeps its log entry. A deterministic 4xx is ours too (bad payload,
 * dead extensionID), so only 408/425/429 and 5xx count as server-side.
 *
 * @param {*} err - The caught error (SDK-normalized object, Error, or anything).
 * @returns {boolean}
 */
/* global DOMException */
const isTransportError = err => {
  if (!err) {
    return false;
  }

  if (typeof err.status === 'number') {
    return err.status === 408 || err.status === 425 || err.status === 429 || err.status >= 500;
  }

  const name = String(err.name || '');

  // An abort/timeout is transport ONLY when it came from the SDK, which normalizes
  // its errors into plain objects. IndexedDB raises a real DOMException named
  // 'AbortError' when a connection is force-closed mid-transaction — exactly the
  // private-key read failure this release exists to instrument — and swallowing
  // that would hide a genuine defect behind "the user was offline".
  if (name === 'AbortError' || name === 'TimeoutError') {
    const isDomException = typeof DOMException !== 'undefined' && err instanceof DOMException;

    return !isDomException;
  }

  const message = String(err.message || '').toLowerCase();

  return NETWORK_MESSAGE_HINTS.some(hint => message.includes(hint));
};

export default isTransportError;
