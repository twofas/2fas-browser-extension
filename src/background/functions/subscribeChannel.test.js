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

const handleLoginRequest = vi.fn();
const handleConfigurationRequest = vi.fn();
vi.mock('@background/events/index.js', () => ({
  handleLoginRequest: (...a) => handleLoginRequest(...a),
  handleConfigurationRequest: (...a) => handleConfigurationRequest(...a)
}));

const notifShow = vi.fn();
const notifShowWithoutTimeout = vi.fn();
vi.mock('@notification/index.js', () => ({
  default: {
    show: (...a) => notifShow(...a),
    showWithoutTimeout: (...a) => notifShowWithoutTimeout(...a)
  }
}));

const closeRequest = vi.fn();
vi.mock('@background/functions/closeRequest.js', () => ({ default: (...a) => closeRequest(...a) }));

const startKeepAlive = vi.fn();
const stopKeepAlive = vi.fn();
vi.mock('@background/functions/keepAlive.js', () => ({
  startKeepAlive: (...a) => startKeepAlive(...a),
  stopKeepAlive: (...a) => stopKeepAlive(...a)
}));

vi.mock('@background/functions/wsTabChanged.js', () => ({ default: vi.fn() }));
vi.mock('@background/functions/wsTabClosed.js', () => ({ default: vi.fn() }));

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

// Controllable fake WebSocket. Construction can be told to throw to exercise the
// constructor-leak path; instances expose helpers to drive open/message/close.
let sockets = [];
let throwOnConstruct = false;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor (url) {
    if (throwOnConstruct) {
      throw new Error('constructor blew up');
    }

    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    sockets.push(this);
  }

  close () {
    this.readyState = FakeWebSocket.CLOSED;
  }

  open () {
    this.onopen?.();
  }

  message (data) {
    this.onmessage?.({ data });
  }

  drop () {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

globalThis.WebSocket = FakeWebSocket;

const { default: subscribeChannel } = await import('./subscribeChannel.js');

const baseOpts = { login: true, requestID: 'req-1', origin: 'https://example.test' };

beforeEach(() => {
  sockets = [];
  throwOnConstruct = false;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('subscribeChannel — keep-alive on WebSocket constructor throw', () => {
  it('releases the keep-alive and closes the request when the constructor throws', () => {
    throwOnConstruct = true;

    const channel = subscribeChannel({ extensionID: 'ext' }, 1, baseOpts);
    channel.connect();

    // Keep-alive was started (deadline set on first connect) then released via the
    // terminal failure path — no leak until the backstop deadline.
    expect(startKeepAlive).toHaveBeenCalledTimes(1);
    expect(stopKeepAlive).toHaveBeenCalledTimes(1);
    expect(closeRequest).toHaveBeenCalledWith(1, 'req-1');
    expect(storeLog).toHaveBeenCalledWith('error', 11, expect.any(Error), expect.stringContaining('construction failed'));
  });
});

describe('subscribeChannel — malformed frame handling', () => {
  it('skips a malformed JSON frame without releasing the keep-alive, then handles a later valid frame', () => {
    const channel = subscribeChannel({ extensionID: 'ext' }, 1, baseOpts);
    channel.connect();
    const ws = sockets[0];
    ws.open();

    ws.message('this is not json{');

    // The channel is NOT torn down by the bad frame.
    expect(stopKeepAlive).not.toHaveBeenCalled();
    expect(closeRequest).not.toHaveBeenCalled();
    expect(handleLoginRequest).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('error', 13, expect.any(Error), expect.stringContaining('JSON parse error'));

    // A subsequent valid frame is still handled within the same request budget.
    ws.message(JSON.stringify({ event: 'browser_extensions.device.2fa_response', token: 'x' }));
    expect(handleLoginRequest).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeChannel — accept-then-drop does not reconnect forever', () => {
  it('gives up after MAX consecutive immediate drops instead of resetting the counter on every onopen', async () => {
    vi.useFakeTimers();

    const channel = subscribeChannel({ extensionID: 'ext' }, 1, baseOpts);
    channel.connect();

    // Simulate a server that accepts then instantly drops the socket, repeatedly.
    // Each cycle: open (well under the 5s stability threshold) then immediate drop.
    for (let i = 0; i < 6; i++) {
      const ws = sockets[sockets.length - 1];
      ws.open();
      ws.drop();
      // Fast-forward past the backoff delay so the queued reconnect fires.
      await vi.advanceTimersByTimeAsync(5000);
    }

    // With the counter no longer reset on every onopen, the attempt cap is reached
    // and the channel fails terminally rather than reconnecting for the whole budget.
    expect(closeRequest).toHaveBeenCalledWith(1, 'req-1');
    expect(stopKeepAlive).toHaveBeenCalled();
  });
});

describe('subscribeChannel — happy path', () => {
  it('handles a pairing success frame', () => {
    const channel = subscribeChannel({ extensionID: 'ext' }, 1, { login: false });
    channel.connect();
    const ws = sockets[0];
    ws.open();
    ws.message(JSON.stringify({ event: 'browser_extensions.pairing.success', id: 'x' }));

    expect(handleConfigurationRequest).toHaveBeenCalledTimes(1);
    expect(stopKeepAlive).toHaveBeenCalledTimes(1);
  });
});
