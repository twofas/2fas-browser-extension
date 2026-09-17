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

// In-memory stand-in for the backend's browser_extensions rows and their
// public_signing_key column, for registration tests. It keeps the keys the
// tests send, but reports only booleans, counters and opaque labels: the
// conflict Reason names 'key-1' / 'key-2' instead of the keys (the real backend
// echoes both), and no accessor returns a stored key. A failing assertion on a
// logged payload or a thrown error therefore cannot print key material.

const SIGNING_KEY_CONFLICT_SENTINEL = 'browser extension already has public signing key: updating public signing key is not supported';
const API_URL = 'https://api.example.test/browser_extensions';

/**
 * Creates a fake backend. Wire its `updateBrowserExtension` and
 * `createExtensionInstance` into a mocked SDK; both reject with the shapes
 * SDK.onError produces (HTTP-shaped `{status, statusText, url, signed, content}`
 * or network-shaped `{name, message}`).
 *
 * @return {Object} The fake backend.
 */
const createFakeSigningBackend = () => {
  const rows = new Map();
  const labels = new Map();
  const gates = [];
  let lostResponsesToCause = 0;
  let createdRows = 0;
  let sentMatchedStored = null;

  const stats = {
    requests: 0,
    keyedRequests: 0,
    conflicts: 0,
    lostResponses: 0
  };

  /** @return {string} A stable opaque label for a key; never derived from its bytes. */
  const labelFor = key => {
    if (!labels.has(key)) {
      labels.set(key, `key-${labels.size + 1}`);
    }

    return labels.get(key);
  };

  const httpError = (id, status, statusText, Type, Description, Reason) => ({
    status,
    statusText,
    url: `${API_URL}/${id}`,
    signed: false,
    content: { Code: status, Type, Description, Reason }
  });

  /** The network-shaped rejection SDK.onError makes of an aborted request. */
  const abortError = () => ({ name: 'AbortError', message: 'signal is aborted without reason' });

  /** Waits at arrival when a test holds the next request (deferNext). */
  const arrive = async () => {
    stats.requests += 1;

    const gate = gates.shift();

    if (gate) {
      gate.enter();
      await gate.released;
    }
  };

  /** Resolves with `data`, or loses the response of an already-committed request. */
  const respond = data => {
    if (lostResponsesToCause > 0) {
      lostResponsesToCause -= 1;
      stats.lostResponses += 1;

      return Promise.reject(abortError());
    }

    return Promise.resolve(data);
  };

  /**
   * Stores a keyed request's key in the row, TOFU like the backend: an empty
   * column takes the key, the same key is a no-op, a different key is refused.
   * @return {boolean} Whether the key was accepted.
   */
  const acceptKey = (row, key) => {
    stats.keyedRequests += 1;
    sentMatchedStored = row.signingKey !== null && row.signingKey === key;

    if (row.signingKey !== null && row.signingKey !== key) {
      stats.conflicts += 1;

      return false;
    }

    row.signingKey = key;

    return true;
  };

  return {
    /**
     * Adds a row, optionally already holding a signing key (e.g. one set by
     * another copy of the identity).
     * @param {string} id - extensionID.
     * @param {Object} [options]
     * @param {string|null} [options.signingKey=null] - Key the row already holds.
     * @return {void}
     */
    seedExtension (id, { signingKey = null } = {}) {
      rows.set(id, { signingKey });
    },

    /**
     * PUT /browser_extensions/:id. 404 for an unknown row; the conflict 400 (with
     * opaque labels) for a different key.
     * @return {Promise<Object>}
     */
    async updateBrowserExtension (id, payload) {
      await arrive();

      const row = rows.get(id);

      if (!row) {
        return Promise.reject(httpError(id, 404, 'Not Found', 'NotFound', 'Resource not found.', 'browser extension could not be found'));
      }

      const key = payload?.public_signing_key;

      if (typeof key === 'string' && !acceptKey(row, key)) {
        return Promise.reject(httpError(
          id,
          400,
          'Bad Request',
          'BadRequest',
          'Malformed request syntax.',
          `cannot update key from "${labelFor(row.signingKey)}" to "${labelFor(key)}": ${SIGNING_KEY_CONFLICT_SENTINEL}`
        ));
      }

      return respond({ id });
    },

    /**
     * POST /browser_extensions: always creates a new row holding the sent key.
     * @return {Promise<{id: string}>}
     */
    async createExtensionInstance (body) {
      await arrive();

      createdRows += 1;

      const id = `fake-ext-${createdRows}`;
      const row = { signingKey: null };

      rows.set(id, row);

      if (typeof body?.public_signing_key === 'string') {
        acceptKey(row, body.public_signing_key);
      }

      return respond({ id });
    },

    /**
     * The next `count` requests commit server-side and then lose their response
     * (an AbortError, like the registration timeout).
     * @param {number} [count=1]
     * @return {void}
     */
    commitThenAbort (count = 1) {
      lostResponsesToCause += count;
    },

    /**
     * Holds the next request at arrival, before anything is committed.
     * @return {{reached: Promise<void>, release: function(): void}} `reached`
     *   settles once the request arrived; `release` lets it proceed.
     */
    deferNext () {
      let enter;
      let release;
      const reached = new Promise(resolve => {
        enter = resolve;
      });
      const released = new Promise(resolve => {
        release = resolve;
      });

      gates.push({ enter, released });

      return { reached, release };
    },

    /** @return {number} Requests received (keyed or not). */
    get requests () {
      return stats.requests;
    },

    /** @return {number} Requests that carried a public signing key. */
    get keyedRequests () {
      return stats.keyedRequests;
    },

    /** @return {number} Keyed requests refused with the conflict 400. */
    get conflicts () {
      return stats.conflicts;
    },

    /** @return {number} Committed requests whose response was lost. */
    get lostResponses () {
      return stats.lostResponses;
    },

    /** @return {number} Rows created by POST. */
    get createdRows () {
      return createdRows;
    },

    /**
     * @return {boolean|null} Whether the last keyed request carried exactly the
     *   key its row already held (a same-key re-send); null before any.
     */
    get sentMatchedStored () {
      return sentMatchedStored;
    },

    /** @return {boolean} Whether the row holds any signing key. */
    holdsSigningKey (id) {
      return typeof rows.get(id)?.signingKey === 'string';
    },

    /** @return {boolean} Whether the row holds exactly `key`. */
    holdsSameSigningKey (id, key) {
      const stored = rows.get(id)?.signingKey;

      return typeof stored === 'string' && stored === key;
    }
  };
};

export { createFakeSigningBackend, SIGNING_KEY_CONFLICT_SENTINEL };
