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
import { savePrivateKey, deletePrivateKey } from '@background/functions/privateKeyStore.js';
import storeLog from '@partials/storeLog.js';

/**
 * Generates the RSA-OAEP token keypair and persists the private key.
 * Preferred: a non-extractable CryptoKey in IndexedDB. When IndexedDB is
 * unavailable — Firefox with "Never remember history" (permanent private
 * browsing) makes indexedDB.open throw for extension pages too (Bugzilla
 * 1841806), and a corrupted profile storage behaves the same; neither is
 * cleared by reinstalling the extension — falls back to the legacy scheme: an
 * extractable key exported as pkcs8 base64, persisted in storage.local via
 * the returned keys object. getOrMigratePrivateKey treats that copy as
 * authoritative and promotes it into IndexedDB automatically if IndexedDB
 * recovers.
 *
 * @async
 * @param {Crypt} [crypt=new Crypt()] - Crypt instance used for key generation and export.
 * @returns {Promise<{publicKey: string, privateKey?: string}>} The RSA fields of the keys object.
 */
const generateRSAKeyMaterial = async (crypt = new Crypt()) => {
  let idbError = null;

  // Reset clears storage.local; wipe any stale IndexedDB key too, so a
  // regeneration is fully clean. A failing delete means IndexedDB is
  // unavailable — switch to the fallback instead of aborting.
  try {
    await deletePrivateKey();
  } catch (err) {
    idbError = err;
  }

  if (!idbError) {
    const pair = await crypt.generateKeys();

    try {
      await savePrivateKey(pair.privateKey);

      return { publicKey: crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey)) };
    } catch (err) {
      idbError = err;
    }
  }

  const pair = await crypt.generateKeys(true);
  const [spki, pkcs8] = await Promise.all([
    crypt.exportKey('spki', pair.publicKey),
    crypt.exportKey('pkcs8', pair.privateKey)
  ]);

  await storeLog('warning', 60, idbError, 'generateDefaultStorage - IndexedDB unavailable, private key stored in storage.local fallback');

  return {
    publicKey: crypt.ArrayBufferToString(spki),
    privateKey: crypt.ArrayBufferToString(pkcs8)
  };
};

export default generateRSAKeyMaterial;
