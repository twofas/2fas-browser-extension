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

// Where a NEWLY generated private key (RSA token key, ECDSA signing key) is
// persisted, per platform.
//
//  - true  : non-extractable CryptoKey in the extension-origin IndexedDB
//            (cryptoKeyStore). Its raw bytes cannot be exported by any JS in the
//            extension context and are out of reach of content scripts, which
//            CAN read storage.local. On disk it is plaintext PKCS#8 on Chromium /
//            Firefox and Keychain-wrapped on WebKit.
//  - false : extractable key exported as pkcs8 base64 into storage.local (the
//            same format as the IndexedDB-unavailable fallback and as installs
//            ≤1.8.2). Durable wherever storage.local is, at the cost of the
//            content-script boundary.
//
// Keys already in storage.local are always honoured regardless of this policy
// (keyStore resolves storage.local first), so flipping a platform only changes
// what future generations do — no data migration.
//
// Safari → storage.local (decision 2026-08-31, GitHub issue #142): its extension
// IndexedDB lives under a per-launch rotating origin, survives only through
// WebKit's async rename-on-load, is ordinary website data (Clear History,
// eviction, the 26.6 stale-origin sweep) — a structural, recurring loss where
// every self-heal costs the user a re-pair. storage.local is a separate
// per-extension store that outlives all of that. Accepted trade: no Keychain
// wrap at rest (the Safari container is TCC-protected anyway) and content
// scripts can read the key (Safari ships no storage.local.setAccessLevel yet;
// WebKit main / STP 251 adds it — call it once available). Existing Safari
// installs keep their IndexedDB key until a reset / self-heal regenerates them
// under this policy.
//
// Chrome/Edge/Firefox → IndexedDB: no measured key loss there (unlimitedStorage,
// Firefox ≥92 never evicts extension IndexedDB, permanent private browsing
// already takes the fallback), and on Firefox the content-script boundary can
// never be closed (no setAccessLevel at all). Revisit Chrome only if log 57
// shows loss — then storage.local + setAccessLevel (Chrome ≥140) + a prefs
// proxy for the content script.
const IDB_PREFERRED_BY_PLATFORM = {
  Chrome: true,
  Edge: true,
  Firefox: true,
  Safari: false
};

/**
 * Whether new private keys should be generated as non-extractable CryptoKeys in
 * IndexedDB (true) or as pkcs8 base64 in storage.local (false) on the current
 * platform. Read at call time so tests can stub the platform.
 *
 * @returns {boolean}
 */
const preferIdb = () => IDB_PREFERRED_BY_PLATFORM[process.env.EXT_PLATFORM] ?? true;

export { preferIdb, IDB_PREFERRED_BY_PLATFORM };
