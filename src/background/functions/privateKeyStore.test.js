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
import { describe, it, expect, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';
import { IDBFactory } from 'fake-indexeddb';
import { savePrivateKey, getPrivateKey, deletePrivateKey, getOrMigratePrivateKey } from './privateKeyStore.js';
import { markBrowserSession, __resetSessionIDCacheForTests } from './keyPromotionDurability.js';
import Crypt from './Crypt.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

beforeEach(async () => {
  __resetSessionIDCacheForTests();
  // runtime.onStartup minted a session marker when the browser started.
  await markBrowserSession();
});

// A browser restart clears storage.session while storage.local and — on a
// healthy profile — IndexedDB survive; onStartup then mints a new marker.
const simulateBrowserRestart = async () => {
  await browser.storage.session.clear();
  __resetSessionIDCacheForTests();
  await markBrowserSession();
};

// An extension reload/update mid-session also wipes storage.session, but
// runtime.onStartup does NOT fire — no new marker is minted.
const simulateExtensionReload = async () => {
  await browser.storage.session.clear();
  __resetSessionIDCacheForTests();
};

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

  describe('getOrMigratePrivateKey', () => {
    it('returns null when there is neither an IDB key nor a legacy key', async () => {
      expect(await getOrMigratePrivateKey({ keys: { publicKey: 'pub' } })).toBeNull();
    });

    it('returns the key already stored in IndexedDB', async () => {
      const { pair, ciphertext } = await keyMaterial({ extractable: false });
      await savePrivateKey(pair.privateKey);

      const key = await getOrMigratePrivateKey({ keys: { publicKey: 'pub' } });

      expect(await decrypt(key, ciphertext)).toBe('123456');
    });

    it('migrates a legacy base64 private key into IndexedDB as non-extractable but keeps the plaintext until proven durable', async () => {
      const crypt = new Crypt();
      const { pair, ciphertext } = await keyMaterial({ extractable: true });
      const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
      const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

      const storage = await loadFromLocalStorage(['keys', 'extensionID']);
      const migrated = await getOrMigratePrivateKey(storage);

      // Same key (decrypts a ciphertext made with the legacy public key) ...
      expect(await decrypt(migrated, ciphertext)).toBe('123456');
      // ... now non-extractable, living in IndexedDB ...
      expect(migrated.extractable).toBe(false);
      expect(await getPrivateKey()).toBeDefined();
      // ... but the plaintext copy is NOT stripped yet — an IndexedDB put that
      // resolves proves nothing about persistence across a restart.
      const after = await loadFromLocalStorage(['keys']);
      expect(after.keys.privateKey).toBe(privateKey);
      expect(after.keys.publicKey).toBe(publicKey);

      // A repeat call in the SAME session must not strip either.
      await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));
      expect((await loadFromLocalStorage(['keys'])).keys.privateKey).toBe(privateKey);
    });

    it('strips the plaintext only in a LATER session, once the IndexedDB copy survived a restart', async () => {
      const crypt = new Crypt();
      const { pair, ciphertext } = await keyMaterial({ extractable: true });
      const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
      const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

      // Session 1: promotes into IndexedDB, keeps the plaintext.
      await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      // Session 2: the IndexedDB copy is still there — now the strip is safe.
      await simulateBrowserRestart();
      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      expect(await decrypt(key, ciphertext)).toBe('123456');
      const after = await loadFromLocalStorage(['keys']);
      expect(after.keys.privateKey).toBeUndefined();
      expect(after.keys.publicKey).toBe(publicKey);
    });

    it('does not strip after an extension reload mid-session (storage.session wiped, no onStartup)', async () => {
      const crypt = new Crypt();
      const { pair, ciphertext } = await keyMaterial({ extractable: true });
      const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
      const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

      // Session 1: promotes and stamps.
      await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      // A hot extension update wipes storage.session WITHOUT a browser restart —
      // the IndexedDB copy has not proven it survives a restart, so no strip.
      await simulateExtensionReload();
      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      expect(await decrypt(key, ciphertext)).toBe('123456');
      expect((await loadFromLocalStorage(['keys'])).keys.privateKey).toBe(privateKey);
    });

    it('never strips when IndexedDB silently loses the key between sessions (ephemeral storage)', async () => {
      const crypt = new Crypt();
      const { pair, ciphertext } = await keyMaterial({ extractable: true });
      const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
      const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

      // Session 1: promotion "succeeds" ...
      await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      // ... but the browser wiped IndexedDB across the restart (e.g. an
      // ephemeral private-browsing database).
      await simulateBrowserRestart();
      globalThis.indexedDB = new IDBFactory();

      const key = await getOrMigratePrivateKey(await loadFromLocalStorage(['keys', 'extensionID']));

      // The storage.local copy carried the key across the loss — and stays put.
      expect(await decrypt(key, ciphertext)).toBe('123456');
      expect((await loadFromLocalStorage(['keys'])).keys.privateKey).toBe(privateKey);
    });

    it('is idempotent and re-strips a lingering plaintext key when the IDB key already exists', async () => {
      const { pair } = await keyMaterial({ extractable: false });
      await savePrivateKey(pair.privateKey);
      await saveToLocalStorage({ keys: { publicKey: 'pub', privateKey: 'legacy-leftover' } });

      const storage = await loadFromLocalStorage(['keys']);
      const key = await getOrMigratePrivateKey(storage);

      expect(key.extractable).toBe(false);
      const after = await loadFromLocalStorage(['keys']);
      expect(after.keys.privateKey).toBeUndefined();
      expect(after.keys.publicKey).toBe('pub');
    });

    it('prefers a valid storage.local key over a stale IndexedDB key and promotes it', async () => {
      // A reset that ran while IndexedDB was unavailable can leave the OLD key in
      // IndexedDB and the NEW (registered) key in storage.local. The storage.local
      // key is always the freshest when present — it must win and overwrite.
      const stale = await keyMaterial({ extractable: false });
      await savePrivateKey(stale.pair.privateKey);

      const crypt = new Crypt();
      const fresh = await keyMaterial({ extractable: true });
      const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', fresh.pair.publicKey));
      const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', fresh.pair.privateKey));
      await saveToLocalStorage({ keys: { publicKey, privateKey } });

      const storage = await loadFromLocalStorage(['keys']);
      const key = await getOrMigratePrivateKey(storage);

      expect(await decrypt(key, fresh.ciphertext)).toBe('123456');
      expect(await decrypt(await getPrivateKey(), fresh.ciphertext)).toBe('123456');
      // The fresh key stays in storage.local until the overwrite proves durable.
      const after = await loadFromLocalStorage(['keys']);
      expect(after.keys.privateKey).toBe(privateKey);
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

    it('falls back to the storage.local key and keeps it there', async () => {
      const crypt = new Crypt();
      const { pair, ciphertext } = await keyMaterial({ extractable: true });
      const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
      const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
      await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

      breakIndexedDB();

      const storage = await loadFromLocalStorage(['keys', 'extensionID']);
      const key = await getOrMigratePrivateKey(storage);

      expect(await decrypt(key, ciphertext)).toBe('123456');
      expect(key.extractable).toBe(false);
      // NOT stripped — storage.local stays the source of truth while IndexedDB is broken.
      const after = await loadFromLocalStorage(['keys']);
      expect(after.keys.privateKey).toBe(privateKey);
    });

    it('still throws (transient, never "missing") when there is no storage.local key either', async () => {
      breakIndexedDB();

      await expect(getOrMigratePrivateKey({ keys: { publicKey: 'pub' } })).rejects.toThrow();
    });
  });
});
