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

/* global crypto, TextEncoder */
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';

// Durability bookkeeping for a storage.local → IndexedDB key promotion,
// shared by every promoted key (each key uses its own stamp storage key). A
// put that resolves proves nothing about persistence (ephemeral
// private-browsing databases accept writes that vanish on restart), so a
// plaintext copy in storage.local may be stripped only after the promoted
// key is observed in IndexedDB in a LATER browser session. The stamp
// ({ fingerprint, sessionID }) lives in storage.local; the session marker
// lives in storage.session, which the browser clears on restart.
const SESSION_ID_KEY = 'privateKeySessionID';

// Memoized so concurrent callers within one background instance agree on a single
// session marker; after a service-worker restart the marker is re-read from
// storage.session.
let sessionIDPromise = null;

/** Test-only: drops the memoized session marker to simulate a browser restart. */
const __resetSessionIDCacheForTests = () => {
  sessionIDPromise = null;
};

/**
 * Mints the session marker for the promotion durability check. Called from
 * runtime.onStartup ONLY: that event fires solely on a true browser start,
 * while storage.session is also cleared when the extension itself reloads or
 * updates mid-session — minting a marker there would fake the restart-survival
 * proof and allow a premature strip.
 *
 * @async
 * @returns {Promise<void>}
 */
const markBrowserSession = async () => {
  sessionIDPromise = null;
  await saveToSessionStorage({ [SESSION_ID_KEY]: crypto.randomUUID() });
};

/**
 * Returns the current session marker, or null when none was minted yet (browser
 * session started before this build, or the extension reloaded mid-session).
 * Absence is never cached — onStartup may mint a marker later.
 *
 * @async
 * @returns {Promise<?string>} The session marker, or null.
 */
const getSessionID = async () => {
  if (!sessionIDPromise) {
    sessionIDPromise = loadFromSessionStorage(SESSION_ID_KEY)
      .then(stored => stored?.[SESSION_ID_KEY] || null)
      .catch(() => null);
  }

  const id = await sessionIDPromise;

  if (!id) {
    sessionIDPromise = null;
  }

  return id;
};

/**
 * SHA-256 hex fingerprint of the base64 key string, identifying WHICH key a
 * promotion stamp refers to without storing the key material anywhere new.
 *
 * @async
 * @param {string} legacy - The base64 key from storage.local.
 * @returns {Promise<string>} Hex digest.
 */
const fingerprintKey = async legacy => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacy));

  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Determines whether the storage.local key's promotion into IndexedDB has proven
 * durable: the stamp shows THIS key was saved to IndexedDB in a DIFFERENT browser
 * session, and the caller confirmed a key is present in IndexedDB now. Any failure
 * (storage.session unavailable, digest error) degrades to "not durable", which
 * only means the plaintext copy is kept — never data loss.
 *
 * @async
 * @param {string} legacy - The base64 key currently in storage.local.
 * @param {string} stampKey - storage.local key holding the stamp (each stored
 *   key — RSA, signing — tracks its own promotion independently).
 * @returns {Promise<{fingerprint: ?string, sessionID: ?string, durable: boolean, samePromotion: boolean}>}
 */
const checkPromotionDurability = async (legacy, stampKey) => {
  try {
    const [fingerprint, sessionID, stored] = await Promise.all([
      fingerprintKey(legacy),
      getSessionID(),
      loadFromLocalStorage(stampKey)
    ]);
    const stamp = stored?.[stampKey];
    const sameKey = Boolean(stamp?.fingerprint && stamp.fingerprint === fingerprint && stamp?.sessionID);

    return {
      fingerprint,
      sessionID,
      // Without a minted marker (sessionID null) the current session is unknown —
      // that must never count as "a different session than the stamp's".
      durable: Boolean(sessionID) && sameKey && stamp.sessionID !== sessionID,
      samePromotion: Boolean(sessionID) && sameKey && stamp.sessionID === sessionID
    };
  } catch (err) {
    return { fingerprint: null, sessionID: null, durable: false, samePromotion: false };
  }
};

/**
 * Records that the given key was written to IndexedDB in the current session.
 * Skipped (best-effort) when the durability bookkeeping itself is unavailable.
 *
 * @async
 * @param {{fingerprint: ?string, sessionID: ?string}} durability
 * @param {string} stampKey - storage.local key holding the stamp.
 * @returns {Promise<void>}
 */
const stampPromotion = async ({ fingerprint, sessionID }, stampKey) => {
  if (!fingerprint || !sessionID) {
    return;
  }

  await saveToLocalStorage({ [stampKey]: { fingerprint, sessionID } });
};

export {
  markBrowserSession,
  getSessionID,
  checkPromotionDurability,
  stampPromotion,
  SESSION_ID_KEY,
  __resetSessionIDCacheForTests
};
