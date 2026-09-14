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

import getBrowserInfo from '@background/functions/getBrowserInfo.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import flushBrowserRegistration from '@background/functions/update/flushBrowserRegistration.js';
import reportMissingPrivateKey, { clearMissingPrivateKeyReport } from '@background/functions/reportMissingPrivateKey.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';
import SDK from '@sdk/index.js';
import wait from '@partials/wait.js';
import { INSTALL_PAGE_REASON_RECOVERED, RECOVERED_PAGE_PENDING_KEY } from '@partials/installPageReasons.js';

// User preferences carried across the automatic regeneration (written atomically
// with the defaults by generateDefaultStorage). Everything else (keys,
// extensionID, devices, configured, signing, pending registration, the
// *Reported flags, promotion stamps, schema version) belongs to the dead identity
// and must be recreated from scratch. `logging` matters most: without it a
// healed install goes dark for every later log.
const PRESERVED_PREFERENCES = [
  'logging',
  'nativePush',
  'contextMenu',
  'pinInfo',
  'autoSubmitEnabled',
  'autoSubmitExcludedDomains',
  'extIcon'
];

// Insurance against a false "missing". NOT against WebKit's per-launch origin
// rename: `WebExtensionContext::load()` calls `loadBackgroundWebViewDuringLoad()`
// only inside the completion handler of `moveLocalStorageIfNeeded`, and
// `m_safeToLoadBackgroundContent` stays false until the `_renameOrigin` reply
// lands, so no extension JS — onInstalled, onStartup, an alarm or a token — can
// ever observe a rename in flight (verified against WebKit trunk and the
// safari-7618…7624 branches, 2026-08-31). What this pause does still cover is a
// concurrent regeneration: a storageReset or another heal between clearLocalStorage
// and the key write leaves a real, momentary "no key" window. Cheap on the broken
// path, and a healthy install must never be wiped.
const RECHECK_DELAY_MS = 1500;

// Outcomes. Anything falsy = not handled (wrong platform / failed) — callers keep
// their report-only behaviour.
const HEAL_REGENERATED = 'regenerated';
const HEAL_KEY_PRESENT = 'keyPresent';

// Brake on repeated regeneration. A heal that keeps recurring is not healing
// anything: the environment is losing the key again (a profile whose IndexedDB is
// corrupt for good, a cleaner that wipes it on a schedule), and every wipe costs the
// user a re-pair and leaves another dead registration on the backend. Nothing else
// bounds it — the log-57 dedupe flag is erased by the very wipe it precedes, and the
// install page the heal opens resets `attempt`. So the count rides THROUGH the
// regeneration (the one non-preference in generateDefaultStorage's allow-list) and
// only a manual Reset drops it: that is the user asking for a fresh start.
const HEAL_HISTORY_KEY = 'selfHealHistory';
const HEAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HEALS_PER_WINDOW = 2;

/**
 * Whether the brake refuses another regeneration right now.
 *
 * @param {{count?: number, firstAt?: number}|undefined} history - Stored heal history.
 * @param {number} now - Epoch ms.
 * @returns {boolean}
 */
const isHealRateLimited = (history, now) =>
  Boolean(history) &&
  Number.isFinite(history.firstAt) &&
  now - history.firstAt < HEAL_WINDOW_MS &&
  (history.count || 0) >= MAX_HEALS_PER_WINDOW;

/**
 * The history to carry into the regenerated storage: a fresh window when the old
 * one expired, one more heal otherwise.
 *
 * @param {{count?: number, firstAt?: number}|undefined} history - Stored heal history.
 * @param {number} now - Epoch ms.
 * @returns {{count: number, firstAt: number, lastAt: number}}
 */
const nextHealHistory = (history, now) => {
  const inWindow = Boolean(history) && Number.isFinite(history.firstAt) && now - history.firstAt < HEAL_WINDOW_MS;

  return {
    count: inWindow ? (history.count || 0) + 1 : 1,
    firstAt: inWindow ? history.firstAt : now,
    lastAt: now
  };
};

/**
 * Whether a registered-but-keyless install may be regenerated automatically.
 *
 * Safari only. There the extension's IndexedDB lives under a per-launch rotating
 * `safari-web-extension://<UUID>` origin and survives only through WebKit's
 * rename-on-load migration; it is ordinary website data (cleared by "Clear
 * History", evictable, orphaned when the migration is interrupted). storage.local
 * is a separate per-extension store that outlives all of that — and an app
 * reinstall — so a lost key cannot be recovered by the "reinstall" advice, the
 * only manual way out is the Reset button hidden under Advanced, and the paired
 * devices are already unusable (their tokens can no longer be decrypted).
 * Regenerating orphans nothing that still works.
 *
 * Chrome/Firefox/Edge keep the report-only policy for BACKGROUND checks: uninstall
 * wipes storage there, so the reinstall advice is a real recovery, and a wipe that
 * fires during a silent browser update has no user to explain itself to. A request
 * the user is waiting on lifts that gate — see mayRegenerate. Read at call time so
 * tests can stub it.
 *
 * @returns {boolean}
 */
const isSelfHealPlatform = () => process.env.EXT_PLATFORM === 'Safari';

/**
 * Whether this call may regenerate regardless of platform.
 *
 * The platform gate above is about BACKGROUND checks — the integrity pass that runs
 * on a browser update has no user in front of it, so on Chrome/Edge/Firefox it stays
 * report-only rather than wiping and stealing focus with a tab during a silent
 * update. A request the user just made is the opposite situation: they are present,
 * waiting for a token that provably cannot arrive, and the only way forward is to
 * re-pair. Regenerating there orphans nothing that still works and replaces a dead
 * end with the pairing page they need.
 *
 * @param {boolean} userInitiated - True when a user action started this flow.
 * @returns {boolean}
 */
const mayRegenerate = userInitiated => userInitiated || isSelfHealPlatform();

// Single-flight: a token arriving in two tabs, or onInstalled racing a token,
// must not run generateDefaultStorage twice — interleaved runs can register the
// keys of one run under the extensionID of the other.
let inFlight = null;

/**
 * Regenerates the extension identity after a confirmed private-key loss.
 *
 * Order is load-bearing: the key is re-read after a pause before anything
 * destructive; the log entries go out BEFORE generateDefaultStorage clears
 * storage.local, because storeLog needs `logging` and `extensionID` to reach the
 * backend at all; a pending durable registration is flushed first so it cannot
 * commit stale data over the fresh identity afterwards.
 *
 * @async
 * @param {Object} storage - Storage snapshot (diagnostics only).
 * @param {string} context - Caller name for the log entries.
 * @param {'rsa'|'signing'} key - Which key the caller found missing (log cause).
 * @param {boolean} userInitiated - Whether a user gesture is behind this heal; only
 *   then may the install page raise its window.
 * @returns {Promise<string>} HEAL_KEY_PRESENT when the re-read found the key
 *   material complete (nothing touched), HEAL_REGENERATED once a NEW keypair is
 *   proven to be in storage.
 * @throws {Error} When the regeneration silently left the old identity in place —
 *   generateDefaultStorage resolves even on failure, so the outcome is verified.
 */
const heal = async (storage, context, key, userInitiated) => {
  await wait(RECHECK_DELAY_MS);

  const current = await loadFromLocalStorage(['keys', 'signing', 'extensionID']);

  // Re-check the RSA key specifically, not the whole material: classifyKeyMaterial
  // also reports a signing-only gap, which must not be "healed" by a wipe.
  if (await getOrMigratePrivateKey(current)) {
    return HEAL_KEY_PRESENT;
  }

  // And confirm the install is still REGISTERED. Without an extensionID there is no
  // dead identity to replace — the install is merely incomplete, and generateDefaultStorage
  // / the durable create own that state. Regenerating would burn a keypair, a POST and
  // an `attempt` for nothing, and log 57's "while registration valid" would be a lie.
  if (!current?.keys?.publicKey || !current?.extensionID) {
    return HEAL_KEY_PRESENT;
  }

  await reportMissingPrivateKey(storage, context, { notify: false, cause: { selfHealed: true, key } });
  await storeLog(
    'warning',
    69,
    new Error('Private key lost while registration valid; storage regenerated, re-pairing required', { cause: { key } }),
    context
  );

  await flushBrowserRegistration();

  // Unpair the dead identity on the backend while its extensionID (and, when it
  // survived, its signing key) are still in storage. The server cannot delete the
  // extension row, but the 2FAS app lists extensions by their pairing rows, so this
  // is what removes the stale entry from the user's phone — without it every heal
  // left one behind for the user to clean up by hand. Best effort: offline or a
  // rejected request must not stop the heal, and it is environment, not a defect,
  // so it is not sent to the log.
  try {
    await new SDK().removeAllPairedDevices(current.extensionID);
  } catch (err) {
    console.warn('selfHealMissingPrivateKey - unpair of the dead identity failed', err);
  }

  // Non-forced: keeps the stored (possibly user-set) extension name.
  const [browserInfo, preferences, before, stored] = await Promise.all([
    getBrowserInfo(),
    loadFromLocalStorage(PRESERVED_PREFERENCES),
    loadFromLocalStorage(['extensionID']),
    loadFromLocalStorage(HEAL_HISTORY_KEY)
  ]);

  await generateDefaultStorage(browserInfo, {
    ...preferences,
    [HEAL_HISTORY_KEY]: nextHealHistory(stored?.[HEAL_HISTORY_KEY], Date.now())
  });

  const fresh = await loadFromLocalStorage(['keys', 'extensionID']);

  // generateDefaultStorage never rejects — it defers a failed registration to the
  // durable retry and swallows everything else into log 28 — so a resolved promise
  // is not proof that anything changed. Without this check a failed clear/keygen
  // would still be reported as a completed heal: 57 (selfHealed) and 69 sent, the
  // user told "the extension has been reset, pair again", while the dead identity
  // is still in storage. Throw instead: the caller's catch logs 70, re-arms the 57
  // flag and falls back to the report-only path.
  const regenerated = Boolean(fresh?.keys?.publicKey) && fresh.keys.publicKey !== storage?.keys?.publicKey;

  if (!regenerated) {
    throw new Error('Storage regeneration left the previous key material in place');
  }

  // Open the install page only once the NEW identity is registered (a fresh
  // extensionID, not the dead one). Without it the page's storageValidation
  // would fire its own storageReset after 5 s while the durable create retry is
  // still flushing; the toolbar click opens it later in that case. A failure to
  // open the tab must not turn a completed regeneration into a "failed" heal.
  const registered = Boolean(fresh?.extensionID) && fresh.extensionID !== before?.extensionID;

  if (registered) {
    try {
      await openInstallPage(INSTALL_PAGE_REASON_RECOVERED, { focusWindow: userInitiated });
    } catch (err) {
      await storeLog('warning', 70, err, `${context} - openInstallPage`).catch(() => {});
    }
  } else {
    // Offline (or the API is down): the durable create owns the registration now.
    // Leave a marker so flushBrowserRegistration opens the pairing page — with the
    // explanation — the moment it commits an extensionID, instead of the user
    // discovering a bare pairing screen on their next click.
    await saveToLocalStorage({ [RECOVERED_PAGE_PENDING_KEY]: true });
  }

  return HEAL_REGENERATED;
};

/**
 * Runs the repeat-regeneration brake, then the heal.
 *
 * @async
 * @param {Object} storage - Storage snapshot (diagnostics only).
 * @param {string} context - Caller name for the log entries.
 * @param {'rsa'|'signing'} key - Which key the caller found missing.
 * @param {boolean} userInitiated - Whether a user gesture is behind this heal.
 * @returns {Promise<string|false>} false when the brake refused; heal()'s outcome otherwise.
 */
const applyBrake = async (storage, context, key, userInitiated) => {
  const now = Date.now();
  const history = (await loadFromLocalStorage(HEAL_HISTORY_KEY).catch(() => null))?.[HEAL_HISTORY_KEY];

  if (!isHealRateLimited(history, now)) {
    return heal(storage, context, key, userInitiated);
  }

  // Reported once per window: the brake itself is the interesting signal (an
  // environment that keeps losing keys), and the caller's report-only fallback
  // still shows the user the re-pair prompt.
  if (!history.refusalReported) {
    await storeLog(
      'warning',
      73,
      new Error('Self-heal refused: private key lost again within the window', {
        cause: { key, count: history.count, firstAt: history.firstAt, userInitiated }
      }),
      context
    ).catch(() => {});
    await saveToLocalStorage({ [HEAL_HISTORY_KEY]: { ...history, refusalReported: true } }).catch(() => {});
  }

  return false;
};

/**
 * Self-heals the 'missingPrivateKey' storage state (public key + extensionID
 * present, private key gone) where that is the right call — see isSelfHealPlatform
 * for the background policy and mayRegenerate for the user-initiated exception.
 *
 * Never throws: a failing heal is logged (error 70) and reported as false so the
 * caller falls back to the plain report path.
 *
 * @async
 * @param {Object} storage - Storage snapshot (diagnostics only).
 * @param {string} context - Caller name for the log entries.
 * @param {Object} [options]
 * @param {'rsa'|'signing'} [options.key='rsa'] - Which key the caller found missing.
 * @param {boolean} [options.userInitiated=false] - True when the user is waiting on
 *   this flow (a token request), which lifts the Safari-only platform gate.
 * @returns {Promise<string|false>} HEAL_REGENERATED when storage was regenerated,
 *   HEAL_KEY_PRESENT when the re-read found the key after all (storage untouched —
 *   treat as valid), false when not applicable or failed.
 */
const selfHealMissingPrivateKey = async (storage, context, { key = 'rsa', userInitiated = false } = {}) => {
  // A signing-only gap must NEVER regenerate. classifyKeyMaterial reports
  // 'missingSigningKey' only after the RSA key resolved, so tokens still decrypt and
  // the pairing is demonstrably alive — the exact opposite of the RSA case this heal
  // was built for, whose whole justification is that regenerating orphans nothing
  // that still works. Wiping here would unpair a working install to fix request
  // signing, which the 401 → registrationRequired path owns instead. Reachable in
  // practice: an install ≤1.8.2 keeps its RSA pkcs8 copy in storage.local while its
  // 1.9.0 signing key went to IndexedDB, so losing IndexedDB alone lands exactly here.
  if (key !== 'rsa') {
    return false;
  }

  if (!mayRegenerate(userInitiated)) {
    return false;
  }

  if (inFlight) {
    return inFlight;
  }

  // `inFlight` is claimed before the first await: two tokens arriving together must
  // both see the same promise, and an await before this line would let both slip
  // past the check and regenerate twice.
  inFlight = applyBrake(storage, context, key, userInitiated)
    .catch(async err => {
      await storeLog('error', 70, err, context).catch(() => {});
      // The 57 report went out before the failure; re-arm it so the caller's
      // report-only fallback (and the next start's retry) is not silenced.
      await clearMissingPrivateKeyReport().catch(() => {});

      return false;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

export default selfHealMissingPrivateKey;
export {
  isSelfHealPlatform,
  mayRegenerate,
  isHealRateLimited,
  nextHealHistory,
  PRESERVED_PREFERENCES,
  RECHECK_DELAY_MS,
  HEAL_REGENERATED,
  HEAL_KEY_PRESENT,
  HEAL_HISTORY_KEY,
  HEAL_WINDOW_MS,
  MAX_HEALS_PER_WINDOW
};
