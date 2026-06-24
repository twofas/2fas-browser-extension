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
import browser from 'webextension-polyfill';
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';
import {
  KEEP_ALIVE_ALARM_NAME,
  shouldStopKeepAlive,
  startKeepAlive,
  stopKeepAlive,
  handleKeepAliveAlarm
} from './keepAlive.js';

const DEADLINE_KEY = 'keepAliveUntil';

const getDeadline = async () => {
  const data = await loadFromSessionStorage(DEADLINE_KEY);
  return data?.[DEADLINE_KEY] ?? null;
};

describe('keepAlive', () => {
  describe('shouldStopKeepAlive (pure boundary)', () => {
    it('stops when no deadline is recorded', () => {
      expect(shouldStopKeepAlive(null, 1000)).toBe(true);
      expect(shouldStopKeepAlive(undefined, 1000)).toBe(true);
    });

    it('stops once now has reached or passed the deadline', () => {
      expect(shouldStopKeepAlive(1000, 1000)).toBe(true);
      expect(shouldStopKeepAlive(1000, 2000)).toBe(true);
    });

    it('keeps going while the deadline is still in the future', () => {
      expect(shouldStopKeepAlive(2000, 1000)).toBe(false);
    });
  });

  describe('startKeepAlive', () => {
    it('creates the keep-alive alarm and records a future deadline', async () => {
      await startKeepAlive(60_000);

      const alarm = await browser.alarms.get(KEEP_ALIVE_ALARM_NAME);
      expect(alarm).not.toBeNull();
      expect(alarm.periodInMinutes).toBe(0.5);

      const deadline = await getDeadline();
      expect(deadline).toBeGreaterThan(Date.now());
    });

    it('uses an alarm name distinct from the registration retry alarm', () => {
      expect(KEEP_ALIVE_ALARM_NAME).not.toBe('flushBrowserRegistration');
    });
  });

  describe('stopKeepAlive', () => {
    it('clears the alarm and the deadline; is safe to call when nothing is running', async () => {
      await startKeepAlive(60_000);
      await stopKeepAlive();

      expect(await browser.alarms.get(KEEP_ALIVE_ALARM_NAME)).toBeNull();
      expect(await getDeadline()).toBeNull();

      // Idempotent — a second teardown (e.g. token handled then tab closed) must not throw.
      await expect(stopKeepAlive()).resolves.toBeUndefined();
    });
  });

  describe('handleKeepAliveAlarm', () => {
    it('keeps the alarm alive while the request window is open', async () => {
      await startKeepAlive(60_000);
      await handleKeepAliveAlarm();

      expect(await browser.alarms.get(KEEP_ALIVE_ALARM_NAME)).not.toBeNull();
      expect(await getDeadline()).not.toBeNull();
    });

    it('self-terminates once the deadline has elapsed', async () => {
      // Simulate a hard SW eviction: the alarm survived but the request window passed.
      await browser.alarms.create(KEEP_ALIVE_ALARM_NAME, { periodInMinutes: 0.5 });
      await saveToSessionStorage({ [DEADLINE_KEY]: Date.now() - 1 });

      await handleKeepAliveAlarm();

      expect(await browser.alarms.get(KEEP_ALIVE_ALARM_NAME)).toBeNull();
      expect(await getDeadline()).toBeNull();
    });

    it('self-terminates when no deadline is recorded', async () => {
      await browser.alarms.create(KEEP_ALIVE_ALARM_NAME, { periodInMinutes: 0.5 });

      await handleKeepAliveAlarm();

      expect(await browser.alarms.get(KEEP_ALIVE_ALARM_NAME)).toBeNull();
    });
  });

  describe('heartbeat (the sub-30s primary keep-alive)', () => {
    beforeEach(() => vi.useFakeTimers());

    afterEach(async () => {
      await stopKeepAlive();
      vi.useRealTimers();
    });

    it('reads storage on a sub-30s interval while active, and stops on teardown', async () => {
      const getSpy = vi.spyOn(browser.storage.local, 'get');

      await startKeepAlive(120_000);
      getSpy.mockClear();

      // Each tick lands before the 30s idle timeout would fire.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(getSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(20_000);
      expect(getSpy).toHaveBeenCalledTimes(2);

      await stopKeepAlive();
      getSpy.mockClear();

      // No more reads once the request is over — the worker is free to suspend.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getSpy).not.toHaveBeenCalled();

      getSpy.mockRestore();
    });
  });
});
