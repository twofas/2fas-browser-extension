// @vitest-environment jsdom
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

// SVG imports are webpack loaders; give them benign strings for the DOM test.
vi.mock('@images/notification-logo.svg', () => ({ default: '<svg></svg>' }));
vi.mock('@images/copy-icon.svg', () => ({ default: '<svg></svg>' }));
vi.mock('@images/notification-close.svg', () => ({ default: '<svg></svg>' }));

const copyToClipboard = vi.fn();
vi.mock('@content/functions/copyToClipboard.js', () => ({ default: (...a) => copyToClipboard(...a) }));

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

// Keep the real mountTopLayer (jsdom → plain body mount).
import tokenNotification from './tokenNotification.js';

const clickCopy = () => document.querySelector('.twofas-be-notification-token-box-copy-button').click();
const copyLabel = () => document.querySelector('.twofas-be-notification-token-box-copy-button span').textContent;

beforeEach(() => {
  document.body.replaceChildren();
  copyToClipboard.mockReset();
  storeLog.mockReset();
  storeLog.mockResolvedValue(undefined);
});

describe('tokenNotification', () => {
  it('renders the token and a copy button', () => {
    tokenNotification('246810', 'req-1');

    expect(document.querySelector('.twofas-be-notification-token-box-text').textContent).toBe('246810');
    expect(document.querySelector('.twofas-be-notification-token-box-copy-button')).not.toBeNull();
  });

  it('shows "Copied" only after a successful copy', async () => {
    copyToClipboard.mockResolvedValue(true);
    tokenNotification('135791', 'req-2');

    const before = copyLabel();
    clickCopy();
    await vi.waitFor(() => expect(copyLabel()).not.toBe(before));

    expect(copyToClipboard).toHaveBeenCalledWith('135791', expect.anything());
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('does NOT show "Copied" when the copy fails, and does not report it to the backend', async () => {
    copyToClipboard.mockResolvedValue(false);
    tokenNotification('112233', 'req-3');

    const label = copyLabel();
    clickCopy();
    await new Promise(resolve => setTimeout(resolve, 20));

    // Label unchanged — never a false "Copied".
    expect(copyLabel()).toBe(label);
    // No secure context, or the site/user denied clipboard access: environment, not
    // a defect. The token stays on screen to copy by hand (log 59 retired).
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('deduplicates within one request id', () => {
    expect(tokenNotification('222222', 'same')).not.toBe(false);
    expect(tokenNotification('222222', 'same')).toBe(false);
  });
});
