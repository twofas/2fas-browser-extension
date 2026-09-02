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

import { generateRSAKeyMaterial } from '@background/functions/privateKeyStore.js';
import { generateSigningKeyMaterial } from '@background/functions/signing/signingKeyStore.js';

/**
 * Generates the full key material for a fresh install: the RSA-OAEP token
 * keypair plus the ECDSA P-256 request-signing keypair (v1.9.0), each with
 * its own IndexedDB-preferred / storage.local-fallback persistence.
 *
 * @async
 * @param {Crypt} [crypt] - Optional Crypt instance for the RSA generation.
 * @returns {Promise<{publicKey: string, privateKey?: string, signingPublicKey: string, signingPrivateKey?: string}>}
 *   The keys object for storage.local.
 */
const generateKeyMaterial = async crypt => {
  const rsaKeys = await generateRSAKeyMaterial(crypt);
  const signingKeys = await generateSigningKeyMaterial();

  return { ...rsaKeys, ...signingKeys };
};

export default generateKeyMaterial;
