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

/* global crypto, Buffer */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import browser from 'webextension-polyfill';
import storeLog from '@partials/storeLog.js';
import {
  getSigningState,
  readSigningState,
  patchSigningState,
  activateSigning,
  noteSigningAuthResult,
  markSigningConflict,
  conflictLogInfo,
  ageBucket,
  AUTH_401_THRESHOLD,
  SIGNING_REQUIRED_REPORTED_FLAG,
  SIGNING_CONFLICT_REPORTED_FLAG
} from './signingState.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { longestSurvivor } from '@test/helpers/keySinks.js';
import config from '@/config.js';
import remindSigningRepair, { REMINDED_VERSION_KEY } from './remindSigningRepair.js';

const CONFLICT_MESSAGE = 'Signing key conflict: backend holds a different public signing key';
const SENTINEL = 'browser extension already has public signing key: updating public signing key is not supported';
const HOUR_MS = 60 * 60 * 1000;

// Opaque labels only: toEqual on a payload built from this error cannot print a key.
const KEYLESS_CONFLICT = {
  status: 400,
  statusText: 'Bad Request',
  signed: false,
  url: 'https://api.example.test/browser_extensions/ext-1',
  content: { Code: 400, Type: 'BadRequest', Description: 'Malformed request syntax.', Reason: `cannot update key from "key-A" to "key-B": ${SENTINEL}` }
};

const EMPTY_CAUSE = {
  keyGenerations: null,
  sendsWithThisKey: null,
  keyAgeBucket: 'unknown',
  recordAttempts: null,
  recordAgeBucket: 'unknown',
  storedExtensionVersion: null
};

const generateP256Spki = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  return Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
};

const conflictPayloads = () => storeLog.mock.calls.filter(call => call[1] === 64).map(call => call[2]);

const STORAGE_READ_ERROR = 'An unexpected error occurred';
const ACTIVE_STATE = { active: true, conflict: false, registrationRequired: false, auth401Count: 0, challenged: false };

const rejectRead = () => Promise.reject(new Error(STORAGE_READ_ERROR));

/**
 * Lets the first `passes` storage.local reads through and rejects every later
 * one. The caller restores the returned spy.
 */
const failLocalReadsAfter = passes => {
  const realGet = browser.storage.local.get;
  let reads = 0;

  return vi.spyOn(browser.storage.local, 'get').mockImplementation(keys => {
    reads += 1;

    return reads <= passes ? realGet(keys) : rejectRead();
  });
};

const readsKey = (keys, key) => keys === key || (Array.isArray(keys) && keys.includes(key));

beforeEach(async () => {
  vi.clearAllMocks();
  // Native notifications: the front-end push path needs a DOM this node-env
  // test does not have.
  await saveToLocalStorage({ nativePush: true });
});

describe('getSigningState / patchSigningState', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSigningState()).toEqual({ active: false, conflict: false, registrationRequired: false, auth401Count: 0, challenged: false });
  });

  it('fills defaults for missing fields of a stored partial state', async () => {
    await saveToLocalStorage({ signing: { active: true } });

    expect(await getSigningState()).toEqual({ active: true, conflict: false, registrationRequired: false, auth401Count: 0, challenged: false });
  });

  it('patch merges into the stored state', async () => {
    await patchSigningState({ active: true });
    await patchSigningState({ auth401Count: 2 });

    expect(await getSigningState()).toMatchObject({ active: true, auth401Count: 2 });
  });

  it('serializes concurrent mutations — a tap-style reset cannot overwrite a concurrent activation', async () => {
    // Regression for the activation-race review finding: fire the durable
    // commit's activateSigning and a response-tap-style counter reset without
    // awaiting either. Whatever the interleaving, both writes must land —
    // active:true must never be lost to a stale-snapshot rewrite.
    await patchSigningState({ auth401Count: 2 });

    await Promise.all([
      activateSigning(),
      patchSigningState({ auth401Count: 0, registrationRequired: false })
    ]);

    const state = await getSigningState();
    expect(state.active).toBe(true);
    expect(state.auth401Count).toBe(0);
  });
});

describe('strict signing-state reads', () => {
  let consoleError;

  beforeEach(() => {
    // loadFromLocalStorage and the swallowing catch blocks print the injected
    // read error; keep the test output quiet.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('readSigningState rejects on a failed read; getSigningState still falls back to defaults for read-only callers', async () => {
    await saveToLocalStorage({ signing: ACTIVE_STATE });
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(rejectRead);

    try {
      await expect(readSigningState()).rejects.toBeTruthy();
      expect((await getSigningState()).active).toBe(false);
    } finally {
      get.mockRestore();
    }

    expect((await readSigningState()).active).toBe(true);
  });

  it('a failed read inside the lock never overwrites active:true', async () => {
    await saveToLocalStorage({ signing: ACTIVE_STATE });
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(rejectRead);
    const set = vi.spyOn(browser.storage.local, 'set');

    try {
      await expect(patchSigningState({ auth401Count: 1 })).rejects.toBeTruthy();
      expect(set.mock.calls.length).toBe(0);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }

    const state = await getSigningState();
    expect(state.active).toBe(true);
    expect(state.auth401Count).toBe(0);
  });

  it('a rejected patch does not wedge the queue', async () => {
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(rejectRead);

    try {
      await expect(patchSigningState({ auth401Count: 1 })).rejects.toBeTruthy();
    } finally {
      get.mockRestore();
    }

    await patchSigningState({ auth401Count: 2 });
    expect((await getSigningState()).auth401Count).toBe(2);
  });

  it('401 with a failing inner read keeps active:true', async () => {
    await saveToLocalStorage({ signing: ACTIVE_STATE });
    const get = failLocalReadsAfter(1);

    try {
      await expect(noteSigningAuthResult(401)).resolves.toBeUndefined();
    } finally {
      get.mockRestore();
    }

    const state = await getSigningState();
    expect(state.active).toBe(true);
    expect(state.auth401Count).toBe(0);
  });

  it('success-reset with a failing inner read keeps active:true and the counter', async () => {
    await saveToLocalStorage({ signing: { ...ACTIVE_STATE, auth401Count: 1 } });
    const get = failLocalReadsAfter(1);

    try {
      await expect(noteSigningAuthResult(200)).resolves.toBeUndefined();
    } finally {
      get.mockRestore();
    }

    const state = await getSigningState();
    expect(state.active).toBe(true);
    expect(state.auth401Count).toBe(1);
  });

  it.each([401, 200])('%i with a failing outer read writes nothing', async status => {
    await saveToLocalStorage({ signing: { ...ACTIVE_STATE, auth401Count: 1 } });
    const get = failLocalReadsAfter(0);
    const set = vi.spyOn(browser.storage.local, 'set');

    try {
      await expect(noteSigningAuthResult(status)).resolves.toBeUndefined();
      expect(set.mock.calls.length).toBe(0);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }

    const state = await getSigningState();
    expect(state.active).toBe(true);
    expect(state.auth401Count).toBe(1);
  });

  it('a 401 whose outer read alone fails keeps the counter, so the next 401 still reaches the threshold (66)', async () => {
    await saveToLocalStorage({ signing: { ...ACTIVE_STATE, auth401Count: AUTH_401_THRESHOLD - 1 } });
    // Only the first read fails: a non-strict outer read would count from the
    // defaults, and the passing inner read would write the lowered counter back.
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementationOnce(rejectRead);

    try {
      await expect(noteSigningAuthResult(401)).resolves.toBeUndefined();
    } finally {
      get.mockRestore();
    }

    expect((await getSigningState()).auth401Count).toBe(AUTH_401_THRESHOLD - 1);

    await noteSigningAuthResult(401);

    const state = await getSigningState();
    expect(state.auth401Count).toBe(AUTH_401_THRESHOLD);
    expect(state.registrationRequired).toBe(true);
  });

  it('activateSigning(extra) commits extras and activation in one set without reading', async () => {
    await saveToLocalStorage({
      signing: { active: false, conflict: true, registrationRequired: true, auth401Count: 2 },
      pendingBrowserRegistration: { op: 'update', attempts: 1 }
    });
    const get = vi.spyOn(browser.storage.local, 'get');
    const set = vi.spyOn(browser.storage.local, 'set');

    try {
      await activateSigning({ browserInfo: { name: 'Chrome' }, extensionVersion: 'v', pendingBrowserRegistration: null });

      expect(set.mock.calls.length).toBe(1);

      const [written] = set.mock.calls[0];
      expect(written.signing?.active === true).toBe(true);
      expect('pendingBrowserRegistration' in written).toBe(true);
      expect(written.extensionVersion === 'v').toBe(true);
      expect(get.mock.calls.filter(([keys]) => readsKey(keys, 'signing')).length).toBe(0);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }

    expect(await getSigningState()).toEqual(ACTIVE_STATE);
    expect((await loadFromLocalStorage('pendingBrowserRegistration')).pendingBrowserRegistration === null).toBe(true);
  });

  it('activateSigning commits even while the signing-state read fails, and extras never override the activation', async () => {
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(rejectRead);

    try {
      await activateSigning({ signing: { active: false, conflict: true } });
    } finally {
      get.mockRestore();
    }

    expect(await getSigningState()).toEqual(ACTIVE_STATE);
  });
});

describe('noteSigningAuthResult', () => {
  it(`flips registrationRequired after ${AUTH_401_THRESHOLD} consecutive 401s and reports once (log 66)`, async () => {
    for (let i = 0; i < AUTH_401_THRESHOLD; i++) {
      await noteSigningAuthResult(401);
    }

    const state = await getSigningState();
    expect(state.registrationRequired).toBe(true);
    expect(state.auth401Count).toBe(AUTH_401_THRESHOLD);
    expect(storeLog).toHaveBeenCalledWith('error', 66, expect.anything(), expect.stringContaining('reportSigningRequired'));
    expect((await loadFromLocalStorage(SIGNING_REQUIRED_REPORTED_FLAG))[SIGNING_REQUIRED_REPORTED_FLAG]).toBe(true);

    // Further 401s never re-report.
    storeLog.mockClear();
    await noteSigningAuthResult(401);
    expect(storeLog).not.toHaveBeenCalledWith('error', 66, expect.anything(), expect.anything());
  });

  it('a success between 401s resets the counter — only CONSECUTIVE 401s escalate', async () => {
    await noteSigningAuthResult(401);
    await noteSigningAuthResult(401);
    await noteSigningAuthResult(200);
    await noteSigningAuthResult(401);

    const state = await getSigningState();
    expect(state.registrationRequired).toBe(false);
    expect(state.auth401Count).toBe(1);
  });

  it('a success clears registrationRequired (self-healing) and re-arms the report', async () => {
    for (let i = 0; i < AUTH_401_THRESHOLD; i++) {
      await noteSigningAuthResult(401);
    }
    await noteSigningAuthResult(204);

    const state = await getSigningState();
    expect(state.registrationRequired).toBe(false);
    expect(state.auth401Count).toBe(0);
    expect((await loadFromLocalStorage(SIGNING_REQUIRED_REPORTED_FLAG))[SIGNING_REQUIRED_REPORTED_FLAG]).toBeUndefined();
  });

  it('ignores 500 (deleted record / backend fault is retryable, not a re-registration signal) and other non-401 errors', async () => {
    await noteSigningAuthResult(500);
    await noteSigningAuthResult(500);
    await noteSigningAuthResult(500);
    await noteSigningAuthResult(404);

    const state = await getSigningState();
    expect(state.registrationRequired).toBe(false);
    expect(state.auth401Count).toBe(0);
  });

  it('never throws on invalid input', async () => {
    await expect(noteSigningAuthResult(undefined)).resolves.toBeUndefined();
    await expect(noteSigningAuthResult('401')).resolves.toBeUndefined();
  });
});

describe('markSigningConflict', () => {
  it('sets conflict, disables signing, logs 64 and notifies exactly once', async () => {
    await patchSigningState({ active: true });

    await markSigningConflict({ status: 400, content: 'already has public signing key' });

    const state = await getSigningState();
    expect(state.conflict).toBe(true);
    expect(state.active).toBe(false);
    expect(storeLog).toHaveBeenCalledWith('warning', 64, expect.anything(), expect.stringContaining('markSigningConflict'));
    expect((await loadFromLocalStorage(SIGNING_CONFLICT_REPORTED_FLAG))[SIGNING_CONFLICT_REPORTED_FLAG]).toBe(true);

    storeLog.mockClear();
    await markSigningConflict({ status: 400 });
    expect(storeLog).not.toHaveBeenCalled();
  });
});

describe('markSigningConflict — strict reads and per-extensionID dedupe of log 64', () => {
  let consoleError;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each([
    ['the conflict check', 0],
    ['the read inside the lock', 1]
  ])('a failing state read in %s writes nothing and logs no 64', async (_, passes) => {
    await saveToLocalStorage({ extensionID: 'ext-1', signing: ACTIVE_STATE });
    const get = failLocalReadsAfter(passes);
    const set = vi.spyOn(browser.storage.local, 'set');

    try {
      await expect(markSigningConflict(KEYLESS_CONFLICT)).resolves.toBeUndefined();
      expect(set.mock.calls.length).toBe(0);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }

    expect(conflictPayloads().length).toBe(0);

    const state = await getSigningState();
    expect(state.conflict).toBe(false);
    expect(state.active).toBe(true);
  });

  it('a failing conflict-check read alone writes nothing and logs no 64, though every later read passes', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1', signing: ACTIVE_STATE });
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementationOnce(rejectRead);
    const set = vi.spyOn(browser.storage.local, 'set');

    try {
      await expect(markSigningConflict(KEYLESS_CONFLICT)).resolves.toBeUndefined();
      expect(set.mock.calls.length).toBe(0);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }

    expect(conflictPayloads().length).toBe(0);

    const state = await getSigningState();
    expect(state.conflict).toBe(false);
    expect(state.active).toBe(true);
  });

  it('64 is logged once per extensionID even if conflict is cleared in between', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1' });

    await markSigningConflict(KEYLESS_CONFLICT);
    await patchSigningState({ conflict: false });
    await markSigningConflict(KEYLESS_CONFLICT);

    expect(conflictPayloads().length).toBe(1);
    expect((await getSigningState()).conflict).toBe(true);
    expect((await loadFromLocalStorage('signingConflictLoggedFor')).signingConflictLoggedFor === 'ext-1').toBe(true);

    await saveToLocalStorage({ extensionID: 'ext-2' });
    await patchSigningState({ conflict: false });
    await markSigningConflict(KEYLESS_CONFLICT);

    expect(conflictPayloads().length).toBe(2);
    expect((await loadFromLocalStorage('signingConflictLoggedFor')).signingConflictLoggedFor === 'ext-2').toBe(true);
  });

  it('a failed dedupe read still logs 64 and notifies, but records no identity', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1' });
    const realGet = browser.storage.local.get;
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(keys => (
      readsKey(keys, 'signingConflictLoggedFor') ? rejectRead() : realGet(keys)
    ));

    try {
      await markSigningConflict(KEYLESS_CONFLICT);
    } finally {
      get.mockRestore();
    }

    expect(conflictPayloads().length).toBe(1);
    expect((await getSigningState()).conflict).toBe(true);
    expect('signingConflictLoggedFor' in (await loadFromLocalStorage('signingConflictLoggedFor'))).toBe(false);
    expect((await loadFromLocalStorage(SIGNING_CONFLICT_REPORTED_FLAG))[SIGNING_CONFLICT_REPORTED_FLAG]).toBe(true);
  });

  it('an install without an extensionID logs 64 and records no identity', async () => {
    await markSigningConflict(KEYLESS_CONFLICT);

    expect(conflictPayloads().length).toBe(1);
    expect('signingConflictLoggedFor' in (await loadFromLocalStorage('signingConflictLoggedFor'))).toBe(false);
  });
});

describe('markSigningConflict — key-free log 64 payload', () => {
  it('logs a constructed object without backend content', async () => {
    const [previous, next] = await Promise.all([generateP256Spki(), generateP256Spki()]);

    await markSigningConflict({
      ...KEYLESS_CONFLICT,
      content: { ...KEYLESS_CONFLICT.content, Reason: `cannot update key from "${previous}" to "${next}": ${SENTINEL}` }
    });

    const payloads = conflictPayloads();
    expect(payloads.length).toBe(1);

    const [payload] = payloads;
    const wire = JSON.stringify(payload);

    expect('content' in payload).toBe(false);
    expect('url' in payload).toBe(false);
    expect(longestSurvivor(wire, previous)).toBe(0);
    expect(longestSurvivor(wire, next)).toBe(0);
    expect(payload.message === CONFLICT_MESSAGE).toBe(true);
    expect(payload.status === 400).toBe(true);
    expect(payload.statusText === 'Bad Request').toBe(true);
    expect(payload.signed === false).toBe(true);
    expect(payload.backendCode === 400).toBe(true);
    expect(payload.backendType === 'BadRequest').toBe(true);
  });

  it('carries the supplied diagnostics and fills the rest from storage', async () => {
    await saveToLocalStorage({
      signingKeyGenerations: 2,
      signingKeyGeneratedAt: Date.now() - 2 * HOUR_MS,
      signingKeySends: 3,
      extensionVersion: '1.8.4'
    });

    await markSigningConflict(KEYLESS_CONFLICT, { recordAttempts: 1, recordAgeBucket: '<1m', sendsWithThisKey: 0 });

    expect(conflictPayloads()[0]?.cause).toEqual({
      keyGenerations: 2,
      sendsWithThisKey: 0,
      keyAgeBucket: '<1d',
      recordAttempts: 1,
      recordAgeBucket: '<1m',
      storedExtensionVersion: '1.8.4'
    });
  });

  it('a backward-compatible call reads the stored counters; nothing stored means null or unknown', async () => {
    await markSigningConflict(KEYLESS_CONFLICT);

    expect(conflictPayloads()[0]?.cause).toEqual(EMPTY_CAUSE);
  });

  it('stored values that are not counters, timestamps or release versions are not trusted', async () => {
    await saveToLocalStorage({
      signingKeyGenerations: '2',
      signingKeyGeneratedAt: 'yesterday',
      signingKeySends: -1,
      extensionVersion: '1.9.1-beta'
    });

    await markSigningConflict(KEYLESS_CONFLICT);

    expect(conflictPayloads()[0]?.cause).toEqual({ ...EMPTY_CAUSE, storedExtensionVersion: 'other' });
  });
});

describe('ageBucket', () => {
  it('maps an age in ms to a coarse bucket', () => {
    const cases = [
      [0, '<1m'],
      [59999, '<1m'],
      [60000, '<1h'],
      [HOUR_MS - 1, '<1h'],
      [HOUR_MS, '<1d'],
      [24 * HOUR_MS - 1, '<1d'],
      [24 * HOUR_MS, '<7d'],
      [7 * 24 * HOUR_MS - 1, '<7d'],
      [7 * 24 * HOUR_MS, '>=7d'],
      [365 * 24 * HOUR_MS, '>=7d']
    ];

    expect(cases.map(([ms]) => ageBucket(ms))).toEqual(cases.map(([, bucket]) => bucket));
  });

  it('is unknown for anything that is not a non-negative finite age', () => {
    expect([-1, NaN, Infinity, undefined, null, '60000'].map(ageBucket)).toEqual(Array(6).fill('unknown'));
  });
});

describe('conflictLogInfo', () => {
  it('is total: no error and no diagnostics give a payload of nulls', () => {
    const empty = {
      message: CONFLICT_MESSAGE,
      status: null,
      statusText: null,
      signed: null,
      backendCode: null,
      backendType: null,
      cause: EMPTY_CAUSE
    };

    expect(conflictLogInfo(null)).toEqual(empty);
    expect(conflictLogInfo(undefined, undefined)).toEqual(empty);
    expect(conflictLogInfo('text', 'text')).toEqual(empty);
  });

  it('keeps only typed diagnostics', () => {
    const info = conflictLogInfo(KEYLESS_CONFLICT, {
      keyGenerations: 1.5,
      sendsWithThisKey: '0',
      keyAgeBucket: 'soon',
      recordAttempts: -2,
      recordAgeBucket: 7,
      storedExtensionVersion: '1.9',
      extra: 'dropped'
    });

    expect(info.cause).toEqual({ ...EMPTY_CAUSE, storedExtensionVersion: 'other' });
  });

  it('accepts every valid counter, bucket and version', () => {
    const info = conflictLogInfo(KEYLESS_CONFLICT, {
      keyGenerations: 1,
      sendsWithThisKey: 0,
      keyAgeBucket: '>=7d',
      recordAttempts: 8,
      recordAgeBucket: '<7d',
      storedExtensionVersion: '1.9.0'
    });

    expect(info).toEqual({
      message: CONFLICT_MESSAGE,
      status: 400,
      statusText: 'Bad Request',
      signed: false,
      backendCode: 400,
      backendType: 'BadRequest',
      cause: {
        keyGenerations: 1,
        sendsWithThisKey: 0,
        keyAgeBucket: '>=7d',
        recordAttempts: 8,
        recordAgeBucket: '<7d',
        storedExtensionVersion: '1.9.0'
      }
    });
  });

  it('never copies a backend Type outside the allowlist, nor a non-numeric Code', () => {
    expect(conflictLogInfo({ status: 400, content: { Code: '400', Type: 'Teapot' } })).toMatchObject({ backendCode: null, backendType: 'other' });
    expect(conflictLogInfo({ status: 400, content: 'already has public signing key' })).toMatchObject({ backendCode: null, backendType: null });
  });
});

describe('noteSigningAuthResult — an unsigned 401 challenges an inactive install to sign (1.9.1)', () => {
  const INACTIVE = { active: false, conflict: false, registrationRequired: false, auth401Count: 0, challenged: false };

  it('defaults carry challenged: false', async () => {
    expect((await getSigningState()).challenged).toBe(false);
  });

  it('an unsigned 401 while inactive sets challenged and still counts', async () => {
    await saveToLocalStorage({ signing: INACTIVE });

    await noteSigningAuthResult(401, { signed: false });

    expect(await getSigningState()).toMatchObject({ challenged: true, auth401Count: 1, active: false });
  });

  it.each([
    ['active', { ...INACTIVE, active: true }],
    ['in conflict', { ...INACTIVE, conflict: true }]
  ])('an unsigned 401 never challenges an install that is %s', async (_, signing) => {
    await saveToLocalStorage({ signing });

    await noteSigningAuthResult(401, { signed: false });

    expect((await getSigningState()).challenged).toBe(false);
  });

  it('a 401 without request context (legacy callers) only counts', async () => {
    await saveToLocalStorage({ signing: INACTIVE });

    await noteSigningAuthResult(401);

    expect(await getSigningState()).toMatchObject({ challenged: false, auth401Count: 1 });
  });

  it('a signed success while challenged activates signing — the backend verified the held key', async () => {
    await saveToLocalStorage({ signing: { ...INACTIVE, challenged: true, auth401Count: 2 } });

    await noteSigningAuthResult(200, { signed: true });

    expect(await getSigningState()).toEqual({ active: true, conflict: false, registrationRequired: false, auth401Count: 0, challenged: false });
  });

  it('a signed success activates only after a challenge — a keyless row passes any signature unverified', async () => {
    await saveToLocalStorage({ signing: INACTIVE });

    await noteSigningAuthResult(200, { signed: true });

    expect((await getSigningState()).active).toBe(false);
  });

  it('an unsigned success while challenged resets the counter and nothing else', async () => {
    await saveToLocalStorage({ signing: { ...INACTIVE, challenged: true, auth401Count: 1 } });

    await noteSigningAuthResult(204, { signed: false });

    expect(await getSigningState()).toMatchObject({ active: false, challenged: true, auth401Count: 0 });
  });
});

describe('one-shot notices reach a front-end-push install too (Safari default), and count as the reminder', () => {
  let create;
  let query;
  let sendMessage;

  beforeEach(() => {
    create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('id');
    query = vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ id: 7 }]);
    sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('markSigningConflict renders the conflict notice in the active tab and marks the version', async () => {
    await saveToLocalStorage({ nativePush: false });

    await markSigningConflict(KEYLESS_CONFLICT);

    expect(create).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toMatchObject({ action: 'notification', title: config.Texts.Error.SigningKeyConflict.Title });
    expect((await loadFromLocalStorage(SIGNING_CONFLICT_REPORTED_FLAG))[SIGNING_CONFLICT_REPORTED_FLAG]).toBe(true);
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBe(config.ExtensionVersion);
  });

  it('with no page to render in, the one-shot stays spent but the version is not marked — the reminder delivers later', async () => {
    await saveToLocalStorage({ nativePush: false });
    query.mockResolvedValue([]);

    await markSigningConflict(KEYLESS_CONFLICT);

    expect(sendMessage).not.toHaveBeenCalled();
    expect((await getSigningState()).conflict).toBe(true);
    expect((await loadFromLocalStorage(SIGNING_CONFLICT_REPORTED_FLAG))[SIGNING_CONFLICT_REPORTED_FLAG]).toBe(true);
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBeUndefined();

    query.mockResolvedValue([{ id: 9 }]);
    await remindSigningRepair();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe(9);
  });

  it('reportSigningRequired (3×401) renders the renewal notice in the active tab', async () => {
    await saveToLocalStorage({ nativePush: false });

    for (let i = 0; i < AUTH_401_THRESHOLD; i++) {
      await noteSigningAuthResult(401);
    }

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toMatchObject({ title: config.Texts.Error.SigningRequired.Title });
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBe(config.ExtensionVersion);
  });

  it('a delivered one-shot counts as this version\'s reminder: no second notice on the next start', async () => {
    await markSigningConflict(KEYLESS_CONFLICT);

    expect(create).toHaveBeenCalledTimes(1);

    await remindSigningRepair();

    expect(create).toHaveBeenCalledTimes(1);
  });
});
