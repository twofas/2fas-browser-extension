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

import Crypt from '@background/functions/Crypt.js';
import createKeyStore from '@background/functions/keyStore.js';
import storeLog from '@partials/storeLog.js';

// The RSA-OAEP token-decryption private key. Persistence rules live in
// keyStore.js: storage.local pkcs8 (`keys.privateKey`) wins when present and is
// used in place; otherwise the non-extractable CryptoKey record in IndexedDB.
const PRIVATE_KEY_ID = 'privateKey';

const withCrypt = options => options?.crypt || new Crypt();

const rsaKeyStore = createKeyStore({
  recordId: PRIVATE_KEY_ID,
  storageField: 'privateKey',
  publicField: 'publicKey',
  importKey: base64 => {
    const crypt = new Crypt();

    return crypt.importKey(crypt.stringToArrayBuffer(base64), 'pkcs8', ['decrypt']);
  },
  generatePair: (extractable, options) => withCrypt(options).generateKeys(extractable),
  exportPublic: async (key, options) => {
    const crypt = withCrypt(options);

    return crypt.ArrayBufferToString(await crypt.exportKey('spki', key));
  },
  exportPrivate: async (key, options) => {
    const crypt = withCrypt(options);

    return crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', key));
  },
  logFallback: err => storeLog('warning', 60, err, 'generateDefaultStorage - IndexedDB unavailable, private key stored in storage.local fallback')
});

/**
 * Persists the private CryptoKey in IndexedDB, overwriting any previous one.
 * @param {CryptoKey} privateKey - A non-extractable RSA-OAEP private key.
 * @returns {Promise<void>}
 */
const savePrivateKey = privateKey => rsaKeyStore.save(privateKey);

/**
 * Reads the IndexedDB private CryptoKey, if any.
 * @returns {Promise<CryptoKey|undefined>}
 */
const getPrivateKey = () => rsaKeyStore.get();

/**
 * Removes the IndexedDB private CryptoKey (storage reset / regeneration).
 * @returns {Promise<void>}
 */
const deletePrivateKey = () => rsaKeyStore.remove();

/**
 * Returns the usable private key: the storage.local pkcs8 copy (imported
 * non-extractable, used in place — never promoted, never stripped) when present,
 * otherwise the IndexedDB record. Throws on an IndexedDB failure when no
 * storage.local copy exists, so a transient error never reads as "missing".
 *
 * The name is historical (it once migrated storage.local keys into IndexedDB);
 * it is kept because every caller and test mock refers to it.
 *
 * @param {Object} storage - Storage snapshot that may hold `keys.privateKey`.
 * @returns {Promise<CryptoKey|null>}
 */
const getOrMigratePrivateKey = storage => rsaKeyStore.resolve(storage);

/**
 * Generates the RSA-OAEP token keypair and persists the private half per
 * keyStoragePolicy (IndexedDB non-extractable, or the storage.local pkcs8
 * fallback — also used, with warning 60, when IndexedDB is unavailable).
 *
 * @param {Crypt} [crypt] - Optional Crypt instance for generation/export.
 * @returns {Promise<{publicKey: string, privateKey?: string}>} RSA fields of the keys object.
 */
const generateRSAKeyMaterial = crypt => rsaKeyStore.generateMaterial({ crypt });

export { savePrivateKey, getPrivateKey, deletePrivateKey, getOrMigratePrivateKey, generateRSAKeyMaterial, PRIVATE_KEY_ID };
