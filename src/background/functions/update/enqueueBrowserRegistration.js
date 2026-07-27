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

import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';
import flushBrowserRegistration from './flushBrowserRegistration.js';

/**
 * Records a pending browser-extension registration and kicks off a delivery attempt.
 *
 * Idempotent: if a record for the same op is already pending, its retry history
 * (attempts / firstAttemptAt / backoff / reported) is preserved and only the target
 * payload is refreshed to the latest detected values — so repeated onInstalled events
 * while offline never reset the backoff or duplicate work. A previously-known name is
 * kept when the incoming one is missing (avoids minting a fresh random-suffix name).
 *
 * @param {Object} params
 * @param {'create'|'update'} params.op - Registration operation (POST vs PUT).
 * @param {{name?: string, browser_name?: string, browser_version?: string}} params.payload
 * @returns {Promise<void>} Resolves once the record is stored and a flush has been triggered.
 */
const enqueueBrowserRegistration = async ({ op, payload }) => {
  const now = Date.now();
  let existing = null;

  try {
    const storage = await loadFromLocalStorage(REGISTRATION_STORAGE_KEY);
    existing = storage?.[REGISTRATION_STORAGE_KEY] || null;
  } catch (err) {
    console.error('enqueueBrowserRegistration - load', err);
  }

  let record;

  if (existing && existing.op === op) {
    record = {
      ...existing,
      payload: {
        name: payload?.name || existing.payload?.name,
        browser_name: payload?.browser_name || existing.payload?.browser_name,
        browser_version: payload?.browser_version || existing.payload?.browser_version
      }
    };
  } else {
    record = {
      op,
      payload: {
        name: payload?.name,
        browser_name: payload?.browser_name,
        browser_version: payload?.browser_version
      },
      attempts: 0,
      firstAttemptAt: now,
      nextAttemptAt: now,
      reported: false
    };
  }

  await saveToLocalStorage({ [REGISTRATION_STORAGE_KEY]: record });

  return flushBrowserRegistration();
};

export default enqueueBrowserRegistration;
