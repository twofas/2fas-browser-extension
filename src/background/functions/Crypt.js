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

/**
 * Cryptography class for RSA-OAEP encryption/decryption operations.
 */
class Crypt {
  /**
   * Creates a new Crypt instance with text encoder/decoder.
   */
  constructor () {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder('utf-8');
  }

  /**
   * Generates a new RSA-OAEP key pair.
   * @returns {Promise<CryptoKeyPair>} Promise resolving to the generated key pair
   */
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

  /**
   * Imports a cryptographic key.
   * @param {ArrayBuffer|JsonWebKey} key - The key data to import
   * @param {string} format - The format of the key (spki, pkcs8, jwk, raw)
   * @param {string[]} keyUsages - Array of key usages (encrypt, decrypt)
   * @returns {Promise<CryptoKey>} Promise resolving to the imported key
   */
  importKey (key, format, keyUsages) {
    return crypto.subtle.importKey(
      format,
      key,
      { name: 'RSA-OAEP', hash: { name: 'SHA-512' } },
      false,
      keyUsages
    )
  }

  /**
   * Exports a cryptographic key.
   * @param {string} format - The format to export to (spki, pkcs8, jwk, raw)
   * @param {CryptoKey} key - The key to export
   * @returns {Promise<ArrayBuffer|JsonWebKey>} Promise resolving to the exported key
   */
  exportKey (format, key) {
    return crypto.subtle.exportKey(format, key);
  }

  /**
   * Converts an ArrayBuffer to a Base64 string.
   * @param {ArrayBuffer} key - The ArrayBuffer to convert
   * @returns {string} Base64 encoded string
   */
  ArrayBufferToString (key) {
    return ab2b64(key);
  }

  /**
   * Converts a Base64 string to an ArrayBuffer.
   * @param {string} string - The Base64 string to convert
   * @returns {ArrayBuffer} The converted ArrayBuffer
   */
  stringToArrayBuffer (string) {
    return b642ab(string);
  }

  /**
   * Encodes text to a Uint8Array.
   * @param {string} text - The text to encode
   * @returns {Uint8Array} The encoded text
   */
  encodeText (text) {
    return this.encoder.encode(text);
  }

  /**
   * Decodes an ArrayBuffer to text.
   * @param {ArrayBuffer} text - The ArrayBuffer to decode
   * @returns {string} The decoded text
   */
  decodeText (text) {
    const decDV = new DataView(text);
    return this.decoder.decode(decDV);
  }

  /**
   * Encrypts data using RSA-OAEP.
   * @param {CryptoKey} key - The public key for encryption
   * @param {ArrayBuffer} encodedText - The data to encrypt
   * @returns {Promise<ArrayBuffer>} Promise resolving to the encrypted data
   */
  encrypt (key, encodedText) {
    return crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      key,
      encodedText
    );
  }

  /**
   * Decrypts data using RSA-OAEP.
   * @param {CryptoKey} key - The private key for decryption
   * @param {ArrayBuffer} encryptedText - The data to decrypt
   * @returns {Promise<ArrayBuffer>} Promise resolving to the decrypted data
   */
  decrypt (key, encryptedText) {
    return crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      key,
      encryptedText
    );
  }
}

export default Crypt;
