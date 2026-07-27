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

/* global setInterval, clearInterval */
import browser from 'webextension-polyfill';
import dummyGetLocalStorage from '@background/functions/dummyGetLocalStorage.js';
import { loadFromSessionStorage, saveToSessionStorage, removeFromSessionStorage } from '@sessionStorage/index.js';

/**
 * Single, request-scoped MV3 keep-alive — the consolidation of the three legacy
 * always-on mechanisms (a 25s setInterval, a 250s port restart and a 10s port
 * ping-pong) into one subsystem that only runs while a 2FA / pairing request is pending,
 * then lets the worker terminate (the legacy mechanisms kept it alive 24/7, the exact
 * MV3 anti-pattern this replaces).
 *
 * Two layers, both bounded to the request:
 *   1. Heartbeat — a sub-30s interval doing a storage read. This is the PRIMARY
 *      keep-alive: calling an extension API resets the worker's 30s idle timer, so the
 *      worker survives the silent pending-approval wait. (The 2FAS WS backend sends no
 *      periodic frames, so there is no WS traffic to lean on during that wait, and a
 *      browser.alarms tick alone floors at 30s and races the idle timeout — hence an
 *      in-worker heartbeat is required.)
 *   2. browser.alarms — the coordination/backstop layer. Survives a hard SW eviction
 *      that the heartbeat cannot, and self-terminates the keep-alive once the request
 *      window has elapsed. Deliberately a different alarm name from
 *      REGISTRATION_ALARM_NAME so the durable registration retry and this keep-alive
 *      never clear or reschedule each other.
 */

/** Name of the alarm that backstops / self-terminates the keep-alive. */
export const KEEP_ALIVE_ALARM_NAME = 'keepAliveDuringRequest';

/** Session-storage key holding the epoch (ms) past which the keep-alive self-terminates. */
const KEEP_ALIVE_DEADLINE_KEY = 'keepAliveUntil';

// The alarm name and the session-storage deadline key are extension-GLOBAL: the
// background service worker and the install page (which also opens a channel via
// subscribeChannel) would otherwise share them, so one context's teardown would
// clear the other's backstop. Only the context that owns the alarm handler — the
// background, marked once via setKeepAliveAlarmOwner() — manages the alarm and the
// deadline key. Every other context (the install page) runs the in-memory
// heartbeat only, which is all a non-evictable page needs and which touches no
// shared state, so the two can never interfere. Detecting "am I the background?"
// via `window`/`self` is unreliable (the background is a page on Firefox/Safari),
// so ownership is declared explicitly from the background entry point instead.
let isAlarmOwner = false;

/**
 * Marks THIS context as the keep-alive alarm owner (called once from the
 * background entry point). Only the owner creates/clears the backstop alarm and
 * writes the shared deadline key.
 * @returns {void}
 */
export const setKeepAliveAlarmOwner = () => {
  isAlarmOwner = true;
};

/**
 * Heartbeat period (ms). Comfortably under the 30s service-worker idle timeout so each
 * storage read resets the timer before it can fire.
 */
const KEEP_ALIVE_INTERVAL_MS = 20000;

/**
 * Backstop alarm period (minutes). 0.5 is Chrome's floor (Chrome 120+; was 1 min before).
 * Used only to self-terminate a stale keep-alive after eviction, never as the heartbeat.
 */
const KEEP_ALIVE_PERIOD_MIN = 0.5;

// Live only inside the (single) service-worker context; reset to null on every stop.
let heartbeatID = null;

// How many requests currently need the keep-alive. Concurrent 2FA/pairing
// requests (e.g. two tabs each awaiting phone approval) share one keep-alive, so
// the first request to finish must NOT tear down the heartbeat/alarm the others
// still depend on — only the last one out does. In-memory, so a hard SW eviction
// resets it to 0, which is correct: an evicted worker has lost its sockets and the
// backstop alarm tears the keep-alive down by deadline.
let activeRequests = 0;

/**
 * Stops the heartbeat interval. Idempotent.
 * @returns {void}
 */
const stopHeartbeat = () => {
  if (heartbeatID !== null) {
    clearInterval(heartbeatID);
    heartbeatID = null;
  }
};

/**
 * (Re)starts the heartbeat interval — a periodic storage read that resets the worker's
 * idle timer. Replaces any existing interval so repeated starts never stack.
 * @returns {void}
 */
const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatID = setInterval(() => {
    dummyGetLocalStorage().catch(() => {});
  }, KEEP_ALIVE_INTERVAL_MS);
};

/**
 * Decides whether the keep-alive should stop: when no deadline is recorded or the request
 * window has already elapsed. Pure (no I/O) so the boundary is unit-testable in isolation —
 * the handler supplies `now` and performs the side effects.
 *
 * @param {number|null|undefined} deadline - Epoch (ms) past which to stop, or null/undefined.
 * @param {number} now - Current epoch time (ms).
 * @returns {boolean}
 */
export const shouldStopKeepAlive = (deadline, now) => typeof deadline !== 'number' || now >= deadline;

/**
 * Unconditionally tears the keep-alive down: clears the heartbeat, the backstop alarm,
 * the deadline and the active-request count. Used by the last request out and by the
 * backstop alarm once the window has elapsed (where the in-memory count may be stale
 * after an eviction).
 *
 * @returns {Promise<void>}
 */
const teardownKeepAlive = async () => {
  activeRequests = 0;
  stopHeartbeat();

  // Only the alarm owner touches the shared alarm / deadline key; a non-owner
  // (install page) has neither, so tearing its heartbeat down is enough.
  if (!isAlarmOwner) {
    return;
  }

  try {
    if (browser?.alarms?.clear) {
      await browser.alarms.clear(KEEP_ALIVE_ALARM_NAME);
    }

    await removeFromSessionStorage(KEEP_ALIVE_DEADLINE_KEY);
  } catch (err) {
    console.error('keepAlive - stop', err);
  }
};

/**
 * Starts the keep-alive for one request: registers the request, kicks off the heartbeat,
 * records a self-terminating deadline and (re)creates the backstop alarm. Safe to call
 * once per request — the heartbeat is replaced and the fixed alarm name replaces any
 * pending one, so concurrent requests share one keep-alive rather than stacking. Each
 * start pushes the deadline to its own window; the latest (furthest) deadline wins and
 * covers every still-active request.
 *
 * @param {number} durationMs - How long to keep the worker warm (the request's time budget).
 * @returns {Promise<void>}
 */
export const startKeepAlive = async durationMs => {
  activeRequests += 1;
  startHeartbeat();

  // Only the alarm owner (background) writes the shared deadline key and creates
  // the backstop alarm. A page context relies solely on its heartbeat while open.
  if (!isAlarmOwner) {
    return;
  }

  try {
    await saveToSessionStorage({ [KEEP_ALIVE_DEADLINE_KEY]: Date.now() + durationMs });

    if (browser?.alarms?.create) {
      await browser.alarms.create(KEEP_ALIVE_ALARM_NAME, { periodInMinutes: KEEP_ALIVE_PERIOD_MIN });
    }
  } catch (err) {
    console.error('keepAlive - start', err);
  }
};

/**
 * Releases one request's hold on the keep-alive. Reference-counted: only the last
 * request out actually tears the heartbeat/alarm/deadline down, so a request that
 * finishes while another is still pending no longer kills the survivor's keep-alive.
 * Idempotent past zero (extra releases are a no-op) so every WS teardown path can call
 * it unconditionally.
 *
 * @returns {Promise<void>}
 */
export const stopKeepAlive = async () => {
  if (activeRequests > 0) {
    activeRequests -= 1;
  }

  if (activeRequests > 0) {
    return;
  }

  await teardownKeepAlive();
};

/**
 * Backstop alarm handler. While the request window is open it touches storage to nudge the
 * worker; once the window has elapsed — including after a hard SW eviction left
 * stopKeepAlive() unrun and the alarm stale — it tears the keep-alive down so the worker is
 * free to terminate (and never wakes forever on a lingering request record). It does NOT
 * restart the heartbeat: a worker the alarm had to re-wake has already lost its WebSocket,
 * so there is nothing left to keep warm.
 *
 * @async
 * @returns {Promise<void>}
 */
export const handleKeepAliveAlarm = async () => {
  let deadline = null;

  try {
    const data = await loadFromSessionStorage(KEEP_ALIVE_DEADLINE_KEY);
    deadline = data?.[KEEP_ALIVE_DEADLINE_KEY] ?? null;
  } catch (err) {
    console.error('keepAlive - handle', err);
  }

  if (shouldStopKeepAlive(deadline, Date.now())) {
    // Force a full teardown regardless of the in-memory count: the window has
    // elapsed (the request budget is up, or a hard eviction left the count stale).
    return teardownKeepAlive();
  }

  return dummyGetLocalStorage();
};
