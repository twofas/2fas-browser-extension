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

/**
 * Decrypts an encrypted 2FA token using the extension's private key.
 * @async
 * @param {string} encryptedToken - The encrypted token from the mobile app.
 * @param {CryptoKey} privateKey - The non-extractable RSA-OAEP private key from IndexedDB.
 * @returns {Promise<string>} The decrypted token.
 */
const decryptToken = async (encryptedToken, privateKey) => {
  const crypt = new Crypt();
  const decrypted = await crypt.decrypt(privateKey, crypt.stringToArrayBuffer(encryptedToken));

  return crypt.decodeText(decrypted);
};

export default decryptToken;
