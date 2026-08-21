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

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import storeLog from '@partials/storeLog.js';
import {
  getSigningState,
  patchSigningState,
  activateSigning,
  noteSigningAuthResult,
  markSigningConflict,
  AUTH_401_THRESHOLD,
  SIGNING_REQUIRED_REPORTED_FLAG,
  SIGNING_CONFLICT_REPORTED_FLAG
} from './signingState.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

beforeEach(async () => {
  vi.clearAllMocks();
  // Native notifications: the front-end push path needs a DOM this node-env
  // test does not have.
  await saveToLocalStorage({ nativePush: true });
});

describe('getSigningState / patchSigningState', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSigningState()).toEqual({ active: false, conflict: false, registrationRequired: false, auth401Count: 0 });
  });

  it('fills defaults for missing fields of a stored partial state', async () => {
    await saveToLocalStorage({ signing: { active: true } });

    expect(await getSigningState()).toEqual({ active: true, conflict: false, registrationRequired: false, auth401Count: 0 });
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
