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

import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import classifyKeyMaterial, { missingKeyName, KEY_MATERIAL_VALID } from '@background/functions/keyMaterialState.js';
import reportMissingPrivateKey, { clearMissingPrivateKeyReport } from '@background/functions/reportMissingPrivateKey.js';
import selfHealMissingPrivateKey, { HEAL_KEY_PRESENT, HEAL_REGENERATED } from '@background/functions/selfHealMissingPrivateKey.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import enqueueBrowserRegistration from '@background/functions/update/enqueueBrowserRegistration.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import storeLog from '@partials/storeLog.js';

// Single-flight: reachable from onInstalled AND onStartup; two overlapping runs
// over an empty storage would each generate + register an identity.
let inFlight = null;

const runCheck = async browserInfo => {
  try {
    const storage = await loadFromLocalStorage(null);

    // A registered identity is public key + extensionID — the same predicate as
    // verifyStorageIntegrity and the pages' storageValidation. browserInfo is
    // deliberately NOT part of it: this runs on every start, and a missing
    // browser-info record must never be a reason to mint a new identity (that
    // would orphan the pairings); updateBrowserInfo rewrites it on its own.
    const hasBaseStorage = Boolean(storage?.keys?.publicKey && storage?.extensionID);

    const keyState = hasBaseStorage ? await classifyKeyMaterial(storage) : null;

    if (keyState === KEY_MATERIAL_VALID) {
      await clearMissingPrivateKeyReport();

      return;
    }

    if (hasBaseStorage) {
      const key = missingKeyName(keyState);
      const outcome = await selfHealMissingPrivateKey(storage, 'checkSafariStorage', { key });

      if (outcome === HEAL_KEY_PRESENT) {
        // False alarm (the re-read found the key) — storage is valid after all.
        await clearMissingPrivateKeyReport();
      } else if (outcome !== HEAL_REGENERATED) {
        await reportMissingPrivateKey(storage, 'checkSafariStorage', { notify: key === 'rsa', cause: { key } });
      }

      return;
    }

    // Keys exist but no extensionID — the registration never landed. Since this
    // check runs on EVERY Safari start, minting a fresh keypair here would repeat
    // per launch: a deterministic 4xx leaves no durable record (only retryable
    // failures enqueue one), so the old "no record ⇒ regenerate" rule burned a
    // keypair, a POST and an `attempt` on every single launch. The existing keys
    // are perfectly registrable — hand them to the durable create instead. It is
    // idempotent, so an already-pending record just keeps its backoff. This also
    // covers the window where another run (install, storageReset, self-heal) has
    // written keys and is still awaiting its own POST.
    //
    // Unless the private half is gone: sendCreate refuses to register a public key
    // whose private key cannot be resolved and drops the record, so enqueueing
    // would be a permanent no-op. Nothing was ever registered in this state (no
    // extensionID), so regenerating orphans no pairing — it is the only way out.
    if (storage?.keys?.publicKey && (await getOrMigratePrivateKey(storage))) {
      await enqueueBrowserRegistration({ op: 'create', payload: storage?.browserInfo || browserInfo });
      return;
    }

    await generateDefaultStorage(browserInfo);

    // Open the pairing page only once registered; without an extensionID the
    // page's storageValidation would trigger yet another reset. Nothing else can
    // have opened it: this branch only runs when storage held no keys at all, so
    // no concurrent heal/reset owns the identity that was just created.
    const fresh = await loadFromLocalStorage(['extensionID']);

    if (fresh?.extensionID) {
      await openInstallPage();
    }
  } catch (err) {
    await storeLog('error', 35, err, 'checkSafariStorage');
  }
};

/**
 * Checks if Safari storage has all required data and regenerates it if missing.
 *
 * A fully registered install whose private key vanished (storage.local intact,
 * IndexedDB record gone — GitHub issue #142; RSA token key or, once signing is
 * active, the ECDSA signing key) is self-healed: reported (log 57 + 69),
 * regenerated and sent to the install page to pair again. On Safari the
 * reinstall this path handles cannot clear that state by itself (storage.local
 * outlives the app), the devices are already unusable, and the only manual way
 * out is the Reset button — see selfHealMissingPrivateKey. Runs on install AND on
 * every Safari start (onStartup) — the background never runs before WebKit has
 * finished re-homing the extension origin, so no pre-check delay is needed.
 *
 * @param {Object} browserInfo - The browser information object
 * @returns {Promise<void>}
 */
const checkSafariStorage = browserInfo => {
  if (inFlight) {
    return inFlight;
  }

  inFlight = runCheck(browserInfo).finally(() => {
    inFlight = null;
  });

  return inFlight;
};

export default checkSafariStorage;
