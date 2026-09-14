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
import { generateSigningKeyMaterial, getOrMigrateSigningKey } from './signingKeyStore.js';

/**
 * Guarantees a usable signing keypair exists and returns its public key.
 * When the current pair is missing or its private half is gone, a fresh pair
 * is generated and merged into storage.local keys — safe ONLY while the key
 * is not yet registered with the backend (the caller must never invoke this
 * once signing.active is true: the server key cannot be replaced).
 *
 * A transient IndexedDB error propagates (retry later) — it must not trigger
 * a needless regeneration.
 *
 * @async
 * @returns {Promise<{signingPublicKey: string, regenerated: boolean}>}
 */
const ensureUsableSigningKeyMaterial = async () => {
  const stored = await loadFromLocalStorage(['keys']);
  const storage = { keys: stored?.keys };

  if (storage.keys?.signingPublicKey) {
    const key = await getOrMigrateSigningKey(storage);

    if (key) {
      return { signingPublicKey: storage.keys.signingPublicKey, regenerated: false };
    }
  }

  const fresh = await generateSigningKeyMaterial();
  const keys = { ...(storage.keys || {}) };

  delete keys.signingPrivateKey;
  keys.signingPublicKey = fresh.signingPublicKey;

  if (fresh.signingPrivateKey) {
    keys.signingPrivateKey = fresh.signingPrivateKey;
  }

  await saveToLocalStorage({ keys });

  return { signingPublicKey: fresh.signingPublicKey, regenerated: true };
};

export default ensureUsableSigningKeyMaterial;
