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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const reportMissingPrivateKey = vi.fn().mockResolvedValue(undefined);
const clearMissingPrivateKeyReport = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/reportMissingPrivateKey.js', () => ({
  default: (...a) => reportMissingPrivateKey(...a),
  clearMissingPrivateKeyReport: (...a) => clearMissingPrivateKeyReport(...a)
}));

const flushBrowserRegistration = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/update/flushBrowserRegistration.js', () => ({ default: (...a) => flushBrowserRegistration(...a) }));

const getBrowserInfo = vi.fn();
vi.mock('@background/functions/getBrowserInfo.js', () => ({ default: (...a) => getBrowserInfo(...a) }));

const generateDefaultStorage = vi.fn();
vi.mock('@background/functions/generateDefaultStorage.js', async importOriginal => ({
  ...(await importOriginal()),
  default: (...a) => generateDefaultStorage(...a)
}));

const openInstallPage = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/openInstallPage.js', () => ({ default: (...a) => openInstallPage(...a) }));

const wait = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/wait.js', () => ({ default: (...a) => wait(...a) }));

const removeAllPairedDevices = vi.fn().mockResolvedValue({});
vi.mock('@sdk/index.js', () => ({ default: class { removeAllPairedDevices (...a) { return removeAllPairedDevices(...a); } } }));

import selfHealMissingPrivateKey, {
  HEAL_REGENERATED,
  HEAL_KEY_PRESENT,
  RECHECK_DELAY_MS,
  PRESERVED_PREFERENCES,
  HEAL_HISTORY_KEY,
  HEAL_WINDOW_MS,
  MAX_HEALS_PER_WINDOW,
  isHealRateLimited,
  nextHealHistory
} from './selfHealMissingPrivateKey.js';
import { RECOVERED_PAGE_PENDING_KEY } from '@partials/installPageReasons.js';
import { OVERRIDABLE_PREFERENCES } from './generateDefaultStorage.js';
import { savePrivateKey } from '@background/functions/privateKeyStore.js';
import { saveSigningKey } from '@background/functions/signing/signingKeyStore.js';
import { clearLocalStorage, loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

const GEN_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };

const STORED_INFO = { name: 'My Safari', browser_name: 'Safari', browser_version: '26.5' };

// Registered install (storage.local intact) whose IndexedDB private key is gone —
// the state reported in GitHub issue #142.
const BROKEN_STORAGE = {
  browserInfo: STORED_INFO,
  keys: { publicKey: 'pub-old', signingPublicKey: 'spub-old' },
  extensionID: 'ext-old',
  devices: [{ id: 'dev-1' }],
  configured: true,
  logging: true,
  contextMenu: false,
  pinInfo: true,
  autoSubmitEnabled: true,
  autoSubmitExcludedDomains: ['bank.test'],
  extIcon: 2,
  signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 },
  privateKeyMissingReported: true,
  attempt: 1
};

// Mirrors the real generateDefaultStorage contract: wipe storage.local, write fresh
// keys + defaults (+ caller overrides, identity winning), then (on a successful
// POST) the new extensionID.
const regenerate = ({ registered = true } = {}) => async (browserInfo, overrides = {}) => {
  await clearLocalStorage();
  await saveToLocalStorage({
    logging: false,
    contextMenu: true,
    pinInfo: false,
    autoSubmitEnabled: false,
    autoSubmitExcludedDomains: [],
    extIcon: 0,
    ...overrides,
    configured: false,
    browserInfo,
    keys: { publicKey: 'pub-new', signingPublicKey: 'spub-new' },
    attempt: 2
  });

  if (registered) {
    await saveToLocalStorage({ extensionID: 'ext-new' });
  }
};

beforeEach(async () => {
  vi.clearAllMocks();
  getBrowserInfo.mockResolvedValue(STORED_INFO);
  generateDefaultStorage.mockImplementation(regenerate());
  await saveToLocalStorage(BROKEN_STORAGE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('selfHealMissingPrivateKey — preference allow-lists', () => {
  it('carries only keys generateDefaultStorage is willing to accept', () => {
    // The two lists are maintained separately and pickPreferences drops anything not
    // on its allow-list silently — a key added to one side only would revert on every
    // heal with nothing to show for it.
    const rejected = PRESERVED_PREFERENCES.filter(key => !OVERRIDABLE_PREFERENCES.includes(key));

    expect(rejected).toEqual([]);
  });
});

describe('selfHealMissingPrivateKey — non-Safari platforms', () => {
  it('regenerates for a request the user is waiting on, on any platform', async () => {
    // The platform gate is about BACKGROUND checks. A token request is the opposite:
    // the user is present, the token provably cannot be decrypted, and re-pairing is
    // the only way forward — so a dead-end notification helps nobody.
    vi.stubEnv('EXT_PLATFORM', 'Chrome');

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'browserAction', { userInitiated: true })).toBe(HEAL_REGENERATED);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    // The user clicked something, so the pairing page may come to the front.
    expect(openInstallPage).toHaveBeenCalledWith('recovered', { focusWindow: true });
  });

  it('does nothing and returns false (the team policy "no silent regeneration" stays)', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Chrome');

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'verifyStorageIntegrity')).toBe(false);

    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('ext-old');
  });
});

describe('selfHealMissingPrivateKey — Safari', () => {
  beforeEach(() => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');
  });

  it('re-reads the key material after a pause and leaves a healthy install untouched (false alarm)', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    // signing.active is true in BROKEN_STORAGE — the signing key must be back too.
    const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await saveSigningKey(signing.privateKey);

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage')).toBe(HEAL_KEY_PRESENT);

    expect(wait).toHaveBeenCalledWith(RECHECK_DELAY_MS);
    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('ext-old');
  });

  it('refuses to regenerate for a signing-only gap — that pairing still works', async () => {
    // 'missingSigningKey' is only ever reported after the RSA key resolved, so the
    // install can still decrypt tokens. This is the one case where the heal's premise
    // ("regenerating orphans nothing that still works") is false, and it is reachable:
    // an install <=1.8.2 keeps its RSA pkcs8 copy in storage.local while its 1.9.0
    // signing key went to IndexedDB, so losing IndexedDB alone lands exactly here.
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage', { key: 'signing' })).toBe(false);

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('refuses a signing-only gap even for a request the user is waiting on', async () => {
    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'browserAction', { key: 'signing', userInitiated: true })).toBe(false);

    expect(generateDefaultStorage).not.toHaveBeenCalled();
  });

  it('reports (57, selfHealed) and logs the heal (69) BEFORE wiping storage, then regenerates and opens the install page', async () => {
    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest')).toBe(HEAL_REGENERATED);

    expect(reportMissingPrivateKey).toHaveBeenCalledWith(BROKEN_STORAGE, 'handleLoginRequest', { notify: false, cause: { selfHealed: true, key: 'rsa' } });
    expect(storeLog).toHaveBeenCalledWith('warning', 69, expect.objectContaining({ cause: { key: 'rsa' } }), 'handleLoginRequest');

    // storeLog needs `logging` + `extensionID` in storage.local to reach the backend —
    // both are gone after generateDefaultStorage's clear, so the order is load-bearing.
    expect(reportMissingPrivateKey.mock.invocationCallOrder[0]).toBeLessThan(generateDefaultStorage.mock.invocationCallOrder[0]);
    expect(storeLog.mock.invocationCallOrder[0]).toBeLessThan(generateDefaultStorage.mock.invocationCallOrder[0]);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).toHaveBeenCalledWith('recovered', { focusWindow: false });

    const after = await loadFromLocalStorage(null);
    expect(after.extensionID).toBe('ext-new');
    expect(after.keys.publicKey).toBe('pub-new');
  });

  it('settles any in-flight durable registration before regenerating', async () => {
    await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage');

    expect(flushBrowserRegistration).toHaveBeenCalledTimes(1);
    expect(flushBrowserRegistration.mock.invocationCallOrder[0]).toBeLessThan(generateDefaultStorage.mock.invocationCallOrder[0]);
  });

  it('keeps the stored extension name (non-forced browser info) and passes it to the regeneration', async () => {
    await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage');

    expect(getBrowserInfo).toHaveBeenCalledWith();
    expect(generateDefaultStorage.mock.calls[0][0]).toEqual(STORED_INFO);
    expect((await loadFromLocalStorage(['browserInfo'])).browserInfo.name).toBe('My Safari');
  });

  it('carries the user preferences through the regeneration atomically, but never identity, pairing or signing state', async () => {
    await selfHealMissingPrivateKey(BROKEN_STORAGE, 'verifyStorageIntegrity');

    // Passed INTO generateDefaultStorage (written with the defaults) rather than
    // re-saved after the network round-trip.
    expect(generateDefaultStorage).toHaveBeenCalledWith(STORED_INFO, {
      logging: true,
      contextMenu: false,
      pinInfo: true,
      autoSubmitEnabled: true,
      autoSubmitExcludedDomains: ['bank.test'],
      extIcon: 2,
      // Plus the heal's own repeat counter — the one non-preference that must ride
      // through, because the regeneration is what it counts.
      [HEAL_HISTORY_KEY]: expect.objectContaining({ count: 1 })
    });

    const after = await loadFromLocalStorage(null);

    // Preferences survive the automatic heal (an explicit Reset would drop them).
    expect(after.logging).toBe(true);
    expect(after.contextMenu).toBe(false);
    expect(after.pinInfo).toBe(true);
    expect(after.autoSubmitEnabled).toBe(true);
    expect(after.autoSubmitExcludedDomains).toEqual(['bank.test']);
    expect(after.extIcon).toBe(2);

    // Everything tied to the old (dead) identity is gone.
    expect(after.extensionID).toBe('ext-new');
    expect(after.keys).toEqual({ publicKey: 'pub-new', signingPublicKey: 'spub-new' });
    expect(after.devices).toBeUndefined();
    expect(after.configured).toBe(false);
    expect(after.signing).toBeUndefined();
    expect(after.privateKeyMissingReported).toBeUndefined();
  });

  it('does not open the install page when the regeneration is still unregistered (offline → durable create retry pending)', async () => {
    generateDefaultStorage.mockImplementation(regenerate({ registered: false }));

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'verifyStorageIntegrity')).toBe(HEAL_REGENERATED);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    // Opening it would make installPage's storageValidation fire a second storageReset
    // while the durable create is still flushing; the toolbar click opens it later.
    expect(openInstallPage).not.toHaveBeenCalled();
    const after = await loadFromLocalStorage(null);
    expect(after.extensionID).toBeUndefined();
    // Preferences are still carried over — they went in with the defaults.
    expect(after.logging).toBe(true);
    expect(after.autoSubmitExcludedDomains).toEqual(['bank.test']);
  });

  it('still counts as regenerated when only the install-page tab fails to open (logs a warning 70, no 57 re-report)', async () => {
    openInstallPage.mockRejectedValueOnce(new Error('No window'));

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest')).toBe(HEAL_REGENERATED);

    expect(storeLog).toHaveBeenCalledWith('warning', 70, expect.any(Error), 'handleLoginRequest - openInstallPage');
    expect(storeLog).not.toHaveBeenCalledWith('error', 70, expect.anything(), expect.anything());
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('ext-new');
  });

  it('does not open the install page when the dead extensionID is still the one in storage', async () => {
    // Fresh keys landed, but the registration reused the old (dead) extensionID —
    // there is nothing to pair against yet, so no page.
    generateDefaultStorage.mockImplementation(async () => {
      await clearLocalStorage();
      await saveToLocalStorage({ keys: { publicKey: 'pub-new', signingPublicKey: 'spub-new' }, extensionID: 'ext-old' });
    });

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest')).toBe(HEAL_REGENERATED);

    expect(openInstallPage).not.toHaveBeenCalled();
  });

  it('refuses to call a silently failed regeneration a heal (generateDefaultStorage never rejects)', async () => {
    // generateDefaultStorage swallows its own failures, so a resolved promise is no
    // proof: here it leaves the dead identity untouched. Reporting HEAL_REGENERATED
    // would tell the user "the extension has been reset" over intact broken storage.
    generateDefaultStorage.mockImplementation(async () => {});

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest')).toBe(false);

    expect(storeLog).toHaveBeenCalledWith('error', 70, expect.any(Error), 'handleLoginRequest');
    expect(openInstallPage).not.toHaveBeenCalled();
    // The old identity is still in storage, and the 57 flag is re-armed so the
    // caller's report-only fallback is not silenced by the aborted heal.
    const after = await loadFromLocalStorage(['extensionID', 'keys']);
    expect(after.extensionID).toBe('ext-old');
    expect(after.keys.publicKey).toBe('pub-old');
    expect(clearMissingPrivateKeyReport).toHaveBeenCalled();
  });

  it('collapses concurrent calls into a single regeneration (token in two tabs / onInstalled racing a token)', async () => {
    const results = await Promise.all([
      selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest'),
      selfHealMissingPrivateKey(BROKEN_STORAGE, 'verifyStorageIntegrity')
    ]);

    expect(results).toEqual([HEAL_REGENERATED, HEAL_REGENERATED]);
    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).toHaveBeenCalledTimes(1);
    expect(storeLog).toHaveBeenCalledTimes(1);
  });

  it('runs again for a later, separate incident once the first heal has finished', async () => {
    await selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest');
    await selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest');

    expect(generateDefaultStorage).toHaveBeenCalledTimes(2);
  });

  it('logs error 70 and returns false when the heal itself throws, without surfacing the error to the caller', async () => {
    generateDefaultStorage.mockRejectedValueOnce(new Error('boom'));

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest')).toBe(false);

    expect(storeLog).toHaveBeenCalledWith('error', 70, expect.any(Error), 'handleLoginRequest');
    expect(openInstallPage).not.toHaveBeenCalled();
  });

  it('never rejects, even when the failure log itself throws', async () => {
    // The heal fails, and the error-70 log fails too. Both mocks must actually be
    // consumed: an unconsumed `...Once` survives `vi.clearAllMocks()` and leaks into
    // whichever test runs next (the suite was order-dependent because of it), and
    // rejecting the FIRST storeLog call would only exercise the log-69 path, not the
    // failure log this test is named after.
    generateDefaultStorage.mockRejectedValueOnce(new Error('boom'));
    storeLog
      .mockResolvedValueOnce(undefined) // 69, before the wipe
      .mockRejectedValueOnce(new Error('storage dead')); // 70, from the catch

    await expect(selfHealMissingPrivateKey(BROKEN_STORAGE, 'handleLoginRequest')).resolves.toBe(false);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(storeLog).toHaveBeenCalledWith('error', 70, expect.any(Error), 'handleLoginRequest');
  });
});

describe('selfHealMissingPrivateKey — brake on repeated regeneration', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('opens a fresh window on the first heal and counts within it', () => {
    const t0 = 1_700_000_000_000;

    const first = nextHealHistory(undefined, t0);
    expect(first).toEqual({ count: 1, firstAt: t0, lastAt: t0 });

    const second = nextHealHistory(first, t0 + DAY);
    expect(second).toEqual({ count: 2, firstAt: t0, lastAt: t0 + DAY });

    // Past the window: start over, do not keep punishing an old incident.
    const later = nextHealHistory(second, t0 + HEAL_WINDOW_MS + 1);
    expect(later).toEqual({ count: 1, firstAt: t0 + HEAL_WINDOW_MS + 1, lastAt: t0 + HEAL_WINDOW_MS + 1 });
  });

  it('refuses only once the cap is reached inside the window', () => {
    const t0 = 1_700_000_000_000;

    expect(isHealRateLimited(undefined, t0)).toBe(false);
    expect(isHealRateLimited({ count: MAX_HEALS_PER_WINDOW - 1, firstAt: t0 }, t0 + DAY)).toBe(false);
    expect(isHealRateLimited({ count: MAX_HEALS_PER_WINDOW, firstAt: t0 }, t0 + DAY)).toBe(true);
    expect(isHealRateLimited({ count: MAX_HEALS_PER_WINDOW, firstAt: t0 }, t0 + HEAL_WINDOW_MS + 1)).toBe(false);
    // Garbage survives a corrupt record: never rate-limit on a malformed history.
    expect(isHealRateLimited({ count: 99 }, t0)).toBe(false);
  });

  it('carries the counter THROUGH the regeneration, so the wipe cannot erase its own brake', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');
    await saveToLocalStorage({ [HEAL_HISTORY_KEY]: { count: 1, firstAt: Date.now() - DAY, lastAt: Date.now() - DAY } });

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage')).toBe(HEAL_REGENERATED);

    const overrides = generateDefaultStorage.mock.calls[0][1];
    expect(overrides[HEAL_HISTORY_KEY]).toEqual(expect.objectContaining({ count: 2 }));
    // And it is a key generateDefaultStorage will actually keep.
    expect(OVERRIDABLE_PREFERENCES).toContain(HEAL_HISTORY_KEY);
  });

  it('refuses a third regeneration inside the window, logs 73 once, and leaves the report-only path to the caller', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');
    const firstAt = Date.now() - DAY;
    await saveToLocalStorage({ [HEAL_HISTORY_KEY]: { count: MAX_HEALS_PER_WINDOW, firstAt, lastAt: firstAt } });

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'browserAction', { userInitiated: true })).toBe(false);
    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'browserAction', { userInitiated: true })).toBe(false);

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    const calls73 = storeLog.mock.calls.filter(call => call[1] === 73);
    expect(calls73).toHaveLength(1);
    expect(calls73[0][2].cause).toEqual(expect.objectContaining({ count: MAX_HEALS_PER_WINDOW, firstAt }));
    // Storage untouched: the dead identity stays for the caller's 57 + notification.
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('ext-old');
  });

  it('heals again once the window has expired', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');
    const firstAt = Date.now() - HEAL_WINDOW_MS - 1;
    await saveToLocalStorage({ [HEAL_HISTORY_KEY]: { count: MAX_HEALS_PER_WINDOW, firstAt, lastAt: firstAt, refusalReported: true } });

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage')).toBe(HEAL_REGENERATED);

    const overrides = generateDefaultStorage.mock.calls[0][1];
    expect(overrides[HEAL_HISTORY_KEY].count).toBe(1);
    expect(overrides[HEAL_HISTORY_KEY].refusalReported).toBeUndefined();
  });
});

describe('selfHealMissingPrivateKey — offline heal hands the pairing page to the durable retry', () => {
  it('leaves the recovered-page marker when the regeneration could not register', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');
    generateDefaultStorage.mockImplementation(regenerate({ registered: false }));

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'verifyStorageIntegrity')).toBe(HEAL_REGENERATED);

    expect(openInstallPage).not.toHaveBeenCalled();
    expect((await loadFromLocalStorage(RECOVERED_PAGE_PENDING_KEY))[RECOVERED_PAGE_PENDING_KEY]).toBe(true);
  });

  it('leaves no marker when the page was opened right away', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'verifyStorageIntegrity')).toBe(HEAL_REGENERATED);

    expect(openInstallPage).toHaveBeenCalledTimes(1);
    expect((await loadFromLocalStorage(RECOVERED_PAGE_PENDING_KEY))[RECOVERED_PAGE_PENDING_KEY]).toBeUndefined();
  });
});

describe('selfHealMissingPrivateKey — unpairs the dead identity on the backend', () => {
  beforeEach(() => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');
    removeAllPairedDevices.mockReset();
    removeAllPairedDevices.mockResolvedValue({});
  });

  it('drops every pairing of the OLD extensionID before the wipe, so the stale entry leaves the 2FAS app', async () => {
    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage')).toBe(HEAL_REGENERATED);

    expect(removeAllPairedDevices).toHaveBeenCalledWith('ext-old');
    // Order is load-bearing: after generateDefaultStorage the old extensionID (and
    // the signing key that could authenticate the call) are gone.
    expect(removeAllPairedDevices.mock.invocationCallOrder[0]).toBeLessThan(generateDefaultStorage.mock.invocationCallOrder[0]);
  });

  it('still heals when the unpair fails (offline, rejected) — and does not report that failure', async () => {
    removeAllPairedDevices.mockRejectedValue(new Error('Failed to fetch'));

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'checkSafariStorage')).toBe(HEAL_REGENERATED);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(storeLog).not.toHaveBeenCalledWith('error', 70, expect.anything(), expect.anything());
  });

  it('never calls the backend when the heal is refused or not applicable', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Chrome');

    expect(await selfHealMissingPrivateKey(BROKEN_STORAGE, 'verifyStorageIntegrity')).toBe(false);

    expect(removeAllPairedDevices).not.toHaveBeenCalled();
  });
});
