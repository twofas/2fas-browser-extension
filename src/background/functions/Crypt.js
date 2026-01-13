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

/* global TextEncoder, TextDecoder, crypto */
import ab2b64 from '@background/functions/ab2b64.js';
import b642ab from '@background/functions/b642ab.js';

class Crypt {
  constructor () {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder('utf-8');
  }

  generateKeys () {
    return crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: { name: 'SHA-512' }
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  importKey (key, format, keyUsages) {
    return crypto.subtle.importKey(
      format,
      key,
      { name: 'RSA-OAEP', hash: { name: 'SHA-512' } },
      false,
      keyUsages
    )
  }

  exportKey (format, key) {
    return crypto.subtle.exportKey(format, key);
  }

  ArrayBufferToString (key) {
    const buf = new Uint8Array(key);
    return ab2b64(buf);
  }

  stringToArrayBuffer (string) {
    return b642ab(string);
  }

  encodeText (text) {
    return this.encoder.encode(text);
  }

  decodeText (text) {
    const decDV = new DataView(text);
    return this.decoder.decode(decDV);
  }

  encrypt (key, encodedText) {
    return crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      key,
      encodedText
    );
  }

  decrypt (key, encryptedText) {
    return crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      key,
      encryptedText
    );
  }
}

export default Crypt;
