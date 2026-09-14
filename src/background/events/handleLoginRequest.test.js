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
import browser from 'webextension-polyfill';
import config from '@/config.js';
import { saveToSessionStorage } from '@sessionStorage/index.js';
import { saveToLocalStorage } from '@localStorage/index.js';

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const closeRequest = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/closeRequest.js', () => ({ default: (...a) => closeRequest(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

const showNativePush = vi.fn().mockResolvedValue('id');
vi.mock('@notification/functions', () => ({ showNativePush: (...a) => showNativePush(...a) }));

vi.mock('@background/functions/Crypt.js', () => ({
  default: class {
    stringToArrayBuffer () { return new ArrayBuffer(0); }
    decrypt () { return Promise.resolve(new ArrayBuffer(0)); }
    decodeText () { return 'TOKEN42'; }
  }
}));

const getOrMigratePrivateKey = vi.fn();
vi.mock('@background/functions/privateKeyStore.js', () => ({ getOrMigratePrivateKey: (...a) => getOrMigratePrivateKey(...a) }));

const reportMissingPrivateKey = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/reportMissingPrivateKey.js', () => ({
  default: (...a) => reportMissingPrivateKey(...a),
  clearMissingPrivateKeyReport: vi.fn().mockResolvedValue(undefined)
}));

const selfHealMissingPrivateKey = vi.fn().mockResolvedValue(false);
vi.mock('@background/functions/selfHealMissingPrivateKey.js', () => ({
  default: (...a) => selfHealMissingPrivateKey(...a),
  HEAL_REGENERATED: 'regenerated',
  HEAL_KEY_PRESENT: 'keyPresent',
  RECHECK_DELAY_MS: 0
}));

vi.mock('@background/functions/syncDevicesWithAPI.js', () => ({ default: vi.fn().mockResolvedValue({ storage: { devices: [] } }) }));

const resolveTokenTargetFrame = vi.fn();
vi.mock('@background/functions/resolveTokenTargetFrame.js', () => ({ default: (...a) => resolveTokenTargetFrame(...a) }));

import handleLoginRequest from './handleLoginRequest.js';

const TAB = 9;
const REQ = 'req-1';
const DATA = { token: 'enc', token_request_id: REQ };

let inputTokenResponse;
let showTokenBehavior;

const setup = async ({ tabData, frameUrl } = {}) => {
  await saveToSessionStorage({ [`tabData-${TAB}`]: tabData ?? { origin: 'https://site.test', requestID: REQ } });
  vi.spyOn(browser.tabs, 'get').mockResolvedValue({});
  vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: frameUrl ?? 'https://site.test/login' });
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (tabId, msg) => {
    if (msg.action === 'inputToken') {
      return inputTokenResponse;
    }

    if (msg.action === 'showTokenNotification') {
      if (showTokenBehavior === 'reject') {
        throw new Error('no content script');
      }

      return { status: showTokenBehavior === 'omitted' ? 'omitted' : 'ok' };
    }

    return {};
  });
};

const sentActions = () => browser.tabs.sendMessage.mock.calls.map(c => c[1].action);

beforeEach(() => {
  vi.restoreAllMocks();
  storeLog.mockClear();
  closeRequest.mockClear();
  showNativePush.mockClear();
  notificationShow.mockClear();
  resolveTokenTargetFrame.mockReset();
  getOrMigratePrivateKey.mockReset();
  getOrMigratePrivateKey.mockResolvedValue({});
  reportMissingPrivateKey.mockClear();
  // Was missing: without a reset this mock's call history (and any queued `...Once`)
  // leaked into the next test, so a `not.toHaveBeenCalled()` assertion could fail on
  // a call another test made.
  selfHealMissingPrivateKey.mockReset();
  selfHealMissingPrivateKey.mockResolvedValue(false);
  inputTokenResponse = { status: 'completed' };
  showTokenBehavior = 'ok';
});

describe('handleLoginRequest — token delivery tail', () => {
  it('autofills and shows NO fallback notification when the fill completes', async () => {
    resolveTokenTargetFrame.mockResolvedValue(0);
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).toEqual(['inputToken']);
    expect(showNativePush).not.toHaveBeenCalled();
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
  });

  it('shows the token notification in the top frame when the fill did not complete', async () => {
    resolveTokenTargetFrame.mockResolvedValue(3);
    inputTokenResponse = { status: 'unverified' };
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).toEqual(['inputToken', 'showTokenNotification']);
    expect(browser.tabs.sendMessage.mock.calls[1][1].token).toBe('TOKEN42');
    expect(showNativePush).not.toHaveBeenCalled();
  });

  it('Z2: shows the token notification when there is no safe target frame (null)', async () => {
    resolveTokenTargetFrame.mockResolvedValue(null);
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).toEqual(['showTokenNotification']);
    expect(browser.tabs.sendMessage.mock.calls[0][1].token).toBe('TOKEN42');
  });

  it('F1: NEVER surfaces the token via a native OS notification — drops it and logs when the front-end notification cannot be delivered', async () => {
    resolveTokenTargetFrame.mockResolvedValue(0);
    inputTokenResponse = { status: 'unverified' };
    showTokenBehavior = 'reject';
    await setup();

    await handleLoginRequest(TAB, DATA);

    // The front-end token notification was attempted (and rejected) ...
    expect(sentActions()).toEqual(['inputToken', 'showTokenNotification']);
    // ... but the token is NEVER pushed to a native OS notification.
    expect(showNativePush).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('warning', 58, expect.objectContaining({ message: expect.stringContaining('withheld') }), 'handleLoginRequest');
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
  });

  it('Z1: withholds the token SILENTLY (no notification, no log) when the top frame navigated to a different origin', async () => {
    resolveTokenTargetFrame.mockResolvedValue(null);
    await setup({ tabData: { origin: 'https://site.test', requestID: REQ }, frameUrl: 'https://evil.test/x' });

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).not.toContain('showTokenNotification');
    expect(showNativePush).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
  });

  it('Z1: withholds the token, logs info 61 and notifies the user when the request was superseded (requestID mismatch)', async () => {
    resolveTokenTargetFrame.mockResolvedValue(null);
    await setup({ tabData: { origin: 'https://site.test', requestID: 'a-newer-request' } });

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).not.toContain('showTokenNotification');
    expect(showNativePush).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('info', 61, expect.any(Error), 'handleLoginRequest');
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.OldRequest, TAB);
  });
});

describe('handleLoginRequest — missing private key', () => {
  it('routes through the deduped log-57 reporter, shows the re-pair notification per request, closes the request — no error 8', async () => {
    getOrMigratePrivateKey.mockResolvedValue(null);
    resolveTokenTargetFrame.mockResolvedValue(0);
    selfHealMissingPrivateKey.mockResolvedValue(false);
    await setup();

    await handleLoginRequest(TAB, DATA);

    // Log 57 (deduped by the helper) instead of a per-request error 8 flood.
    expect(reportMissingPrivateKey).toHaveBeenCalledWith(expect.anything(), 'handleLoginRequest', { notify: false });
    expect(storeLog).not.toHaveBeenCalled();

    // The user actively awaited this token, so the actionable re-pair
    // notification is shown on EVERY request, not once per incident.
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.StorageIntegrity, TAB);
    expect(notificationShow).not.toHaveBeenCalledWith(config.Texts.Error.UndefinedError, TAB);

    // The pending token_request no longer dangles until the backend timeout.
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);

    // No token delivery is attempted without a key.
    expect(sentActions()).toEqual([]);
  });
});

describe('handleLoginRequest — missing private key, Safari self-heal (issue #142)', () => {
  it('closes the request BEFORE regenerating, shows the "data lost, pair again" notification on the tab, no error 8', async () => {
    getOrMigratePrivateKey.mockResolvedValue(null);
    resolveTokenTargetFrame.mockResolvedValue(0);
    selfHealMissingPrivateKey.mockResolvedValue('regenerated');
    closeRequest.mockClear();
    selfHealMissingPrivateKey.mockClear();
    await setup();

    await handleLoginRequest(TAB, DATA);

    // userInitiated lifts the Safari-only gate: the user is waiting on this token, and
    // no token can be decrypted with the dead identity on any platform.
    expect(selfHealMissingPrivateKey).toHaveBeenCalledWith(expect.anything(), 'handleLoginRequest', { userInitiated: true });
    // closeRequest reads the CURRENT extensionID / signing key — both are replaced by the heal.
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
    expect(closeRequest.mock.invocationCallOrder.at(-1)).toBeLessThan(selfHealMissingPrivateKey.mock.invocationCallOrder.at(-1));

    // The heal logs 57 itself; the report-only path is not taken.
    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();

    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.StorageRecovered, TAB);
    expect(notificationShow).not.toHaveBeenCalledWith(config.Texts.Error.StorageIntegrity, TAB);
    expect(notificationShow).not.toHaveBeenCalledWith(config.Texts.Error.UndefinedError, TAB);
    expect(sentActions()).not.toContain('inputToken');
    expect(sentActions()).not.toContain('showTokenNotification');
  });

  it('finishes the request with the token when the delayed re-read found the key after all', async () => {
    // False alarm (a concurrent regeneration was in flight): nothing was wiped and
    // the token in hand is still decryptable, so deliver it instead of making the
    // user approve a second push for a request the backend already saw completed.
    getOrMigratePrivateKey.mockResolvedValueOnce(null).mockResolvedValue('private-key');
    resolveTokenTargetFrame.mockResolvedValue(0);
    selfHealMissingPrivateKey.mockResolvedValue('keyPresent');
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(sentActions()).toContain('inputToken');
    expect(notificationShow).not.toHaveBeenCalledWith(config.Texts.Error.UndefinedError, TAB);
    expect(notificationShow).not.toHaveBeenCalledWith(config.Texts.Error.StorageIntegrity, TAB);
    expect(notificationShow).not.toHaveBeenCalledWith(config.Texts.Error.StorageRecovered, TAB);
  });

  it('asks for a fresh token — not a re-pair — when only the heal\'s own re-read finds the key', async () => {
    // Our pre-close re-read came back empty but the heal's did not: storage is fine,
    // the request is simply already closed. Reporting 57 here would blame a healthy
    // install; the user just needs to approve a new push.
    getOrMigratePrivateKey.mockResolvedValue(null);
    selfHealMissingPrivateKey.mockResolvedValue('keyPresent');
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.UndefinedError, TAB);
    expect(notificationShow).not.toHaveBeenCalledWith(config.Texts.Error.StorageIntegrity, TAB);
  });

  it('does not try to decrypt with a key from an identity minted after the request', async () => {
    // A reset/heal completed between the push and its delivery: the new keypair was
    // never seen by the phone, so decryptToken could only fail. Say the extension was
    // reset instead of reporting a broken install.
    await setup();
    await saveToLocalStorage({ keys: { publicKey: 'pub-old' }, extensionID: 'ext-old' });
    // The regeneration lands between the first read and the re-read.
    getOrMigratePrivateKey
      .mockImplementationOnce(async () => {
        await saveToLocalStorage({ keys: { publicKey: 'pub-new' }, extensionID: 'ext-new' });
        return null;
      })
      .mockResolvedValue('fresh-key');

    await handleLoginRequest(TAB, DATA);

    expect(selfHealMissingPrivateKey).not.toHaveBeenCalled();
    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.StorageRecovered, TAB);
    expect(sentActions()).not.toContain('inputToken');
  });
});
