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

/* global crypto, TextEncoder, TextDecoder, DOMException */
import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { savePrivateKey, getPrivateKey, deletePrivateKey, getOrMigratePrivateKey } from './privateKeyStore.js';
import Crypt from './Crypt.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

const GEN_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };

const decrypt = (key, ciphertext) =>
  crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, ciphertext).then(buf => new TextDecoder().decode(buf));

// Returns a key pair plus a ciphertext encrypted with its public key, so a test
// can prove a retrieved/migrated private key is genuinely the matching key.
const keyMaterial = async ({ extractable }) => {
  const pair = await crypto.subtle.generateKey(GEN_PARAMS, extractable, ['encrypt', 'decrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pair.publicKey, new TextEncoder().encode('123456'));
  return { pair, ciphertext };
};

// Exports a pair as the storage.local (pkcs8 base64) tier would hold it.
const localMaterial = async () => {
  const crypt = new Crypt();
  const { pair, ciphertext } = await keyMaterial({ extractable: true });

  return {
    ciphertext,
    publicKey: crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey)),
    privateKey: crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey))
  };
};

describe('privateKeyStore', () => {
  describe('save / get / delete', () => {
    it('returns undefined when no key is stored', async () => {
      expect(await getPrivateKey()).toBeUndefined();
    });

    it('stores and retrieves a usable, still-non-extractable private key', async () => {
      const { pair, ciphertext } = await keyMaterial({ extractable: false });

      await savePrivateKey(pair.privateKey);
      const retrieved = await getPrivateKey();

      expect(retrieved.extractable).toBe(false);
      expect(await decrypt(retrieved, ciphertext)).toBe('123456');
    });

    it('deletes the stored key', async () => {
      const { pair } = await keyMaterial({ extractable: false });

      await savePrivateKey(pair.privateKey);
      await deletePrivateKey();

      expect(await getPrivateKey()).toBeUndefined();
    });
  });

  describe('getOrMigratePrivateKey — read rule', () => {
    it('returns null when there is neither an IndexedDB key nor a storage.local key', async () => {
      expect(await getOrMigratePrivateKey({ keys: { publicKey: 'pub' } })).toBeNull();
    });

    it('returns the key stored in IndexedDB', async () => {
      const { pair, ciphertext } = await keyMaterial({ extractable: false });
      await savePrivateKey(pair.privateKey);

      const key = await getOrMigratePrivateKey({ keys: { publicKey: 'pub' } });

      expect(await decrypt(key, ciphertext)).toBe('123456');
    });

    it('uses a storage.local key in place — imported non-extractable, never promoted, never stripped', async () => {
      const { publicKey, privateKey, ciphertext } = await localMaterial();
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      expect(await decrypt(key, ciphertext)).toBe('123456');
      expect(key.extractable).toBe(false);
      // No promotion into IndexedDB ...
      expect(await getPrivateKey()).toBeUndefined();
      // ... and the storage.local copy is untouched, on this and every later read.
      await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));
      const after = await loadFromLocalStorage(['keys']);
      expect(after.keys.privateKey).toBe(privateKey);
      expect(after.keys.publicKey).toBe(publicKey);
    });

    it('prefers the storage.local key over a stale IndexedDB key and leaves the stale record alone', async () => {
      // A reset that ran while IndexedDB was unavailable leaves the OLD key in
      // IndexedDB and the NEW (registered) key in storage.local.
      const stale = await keyMaterial({ extractable: false });
      await savePrivateKey(stale.pair.privateKey);
      const fresh = await localMaterial();
      await saveToLocalStorage({ keys: { publicKey: fresh.publicKey, privateKey: fresh.privateKey } });

      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys']));

      expect(await decrypt(key, fresh.ciphertext)).toBe('123456');
      // The read path never writes: the stale record is still the old key.
      expect(await decrypt(await getPrivateKey(), stale.ciphertext)).toBe('123456');
      expect((await loadFromLocalStorage(['keys'])).keys.privateKey).toBe(fresh.privateKey);
    });

    it('falls through to the IndexedDB key when the storage.local copy is corrupt, without touching it', async () => {
      const { pair, ciphertext } = await keyMaterial({ extractable: false });
      await savePrivateKey(pair.privateKey);
      await saveToLocalStorage({ keys: { publicKey: 'pub', privateKey: 'not-a-key' } });

      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys']));

      expect(await decrypt(key, ciphertext)).toBe('123456');
      expect((await loadFromLocalStorage(['keys'])).keys.privateKey).toBe('not-a-key');
    });

    it('resolves null (a reportable missing state) when the storage.local copy is corrupt and IndexedDB is empty', async () => {
      expect(await getOrMigratePrivateKey({ keys: { publicKey: 'pub', privateKey: 'not-a-key' } })).toBeNull();
    });

    it('survives an IndexedDB wipe between sessions when a storage.local copy exists', async () => {
      const { publicKey, privateKey, ciphertext } = await localMaterial();
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });
      await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      globalThis.indexedDB = new IDBFactory();

      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));
      expect(await decrypt(key, ciphertext)).toBe('123456');
    });
  });

  describe('getOrMigratePrivateKey — IndexedDB unavailable', () => {
    // Firefox with "Never remember history" (permanent private browsing) makes
    // indexedDB.open throw InvalidStateError for extension pages too (Bugzilla
    // 1841806); a corrupted profile storage behaves the same. Reinstalling the
    // extension does not clear that condition.
    const breakIndexedDB = () => {
      globalThis.indexedDB = {
        open: () => {
          throw new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError');
        }
      };
    };

    it('uses the storage.local key without touching IndexedDB at all', async () => {
      const { publicKey, privateKey, ciphertext } = await localMaterial();
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

      breakIndexedDB();

      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      expect(await decrypt(key, ciphertext)).toBe('123456');
      expect(key.extractable).toBe(false);
      expect((await loadFromLocalStorage(['keys'])).keys.privateKey).toBe(privateKey);
    });

    it('still throws (transient, never "missing") when there is no storage.local key either', async () => {
      breakIndexedDB();

      await expect(getOrMigratePrivateKey({ keys: { publicKey: 'pub' } })).rejects.toThrow();
    });

    it('throws (never null) when the storage.local copy is corrupt AND IndexedDB is broken', async () => {
      breakIndexedDB();

      await expect(getOrMigratePrivateKey({ keys: { publicKey: 'pub', privateKey: 'not-a-key' } })).rejects.toThrow();
    });
  });
});
