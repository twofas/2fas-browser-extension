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

import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import { getOrMigrateSigningKey } from '@background/functions/signing/signingKeyStore.js';

const KEY_MATERIAL_VALID = 'valid';
const KEY_MATERIAL_MISSING_PRIVATE_KEY = 'missingPrivateKey';
const KEY_MATERIAL_MISSING_SIGNING_KEY = 'missingSigningKey';

/**
 * Classifies the private-key material of a REGISTERED install (the caller has
 * already confirmed keys.publicKey + extensionID exist):
 *
 *  - 'valid'             : the RSA token key is usable and, when request signing
 *                          is active (signing.active — the public signing key is
 *                          registered on the backend), so is the ECDSA signing key.
 *  - 'missingPrivateKey' : the RSA token key is gone — no token can be decrypted.
 *  - 'missingSigningKey' : signing is active but the ECDSA key is gone — every API
 *                          request goes out unsigned; after the backend's migration
 *                          window that is a 401 → registrationRequired dead end.
 *                          Before signing is active the key is minted on demand
 *                          (ensureUsableSigningKeyMaterial), so its absence is not
 *                          a fault.
 *
 * A transient IndexedDB error makes the key stores throw (never resolve null),
 * so it propagates instead of masquerading as a missing key.
 *
 * @async
 * @param {Object} storage - Storage snapshot with `keys` and `signing`.
 * @returns {Promise<'valid'|'missingPrivateKey'|'missingSigningKey'>}
 */
const classifyKeyMaterial = async storage => {
  if (!(await getOrMigratePrivateKey(storage))) {
    return KEY_MATERIAL_MISSING_PRIVATE_KEY;
  }

  if (storage?.signing?.active && !(await getOrMigrateSigningKey(storage))) {
    return KEY_MATERIAL_MISSING_SIGNING_KEY;
  }

  return KEY_MATERIAL_VALID;
};

/**
 * Maps a non-valid classification to the `cause.key` value used in log 57 / 69.
 *
 * @param {string} state - A classifyKeyMaterial result.
 * @returns {'rsa'|'signing'}
 */
const missingKeyName = state => (state === KEY_MATERIAL_MISSING_SIGNING_KEY ? 'signing' : 'rsa');

export default classifyKeyMaterial;
export {
  missingKeyName,
  KEY_MATERIAL_VALID,
  KEY_MATERIAL_MISSING_PRIVATE_KEY,
  KEY_MATERIAL_MISSING_SIGNING_KEY
};
