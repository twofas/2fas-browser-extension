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

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/contextMenu/index.js', () => ({ initContextMenu: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/update/flushBrowserRegistration.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/update/ensureSigningKeyRegistration.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/getBrowserInfo.js', () => ({ default: vi.fn().mockResolvedValue({ name: 'Safari' }) }));

const checkSafariStorage = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/checkSafariStorage.js', () => ({ default: (...a) => checkSafariStorage(...a) }));

const wait = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/wait.js', () => ({ default: (...a) => wait(...a) }));

import onStartup from './onStartup.js';
import ensureSigningKeyRegistration from '@background/functions/update/ensureSigningKeyRegistration.js';
import flushBrowserRegistration from '@background/functions/update/flushBrowserRegistration.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('onStartup', () => {
  it('checks (and self-heals) the Safari key material on every browser start, before the signing-key registration', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    await onStartup();

    expect(checkSafariStorage).toHaveBeenCalledTimes(1);
    // Pins the removal: a reinstated pre-check delay would call wait() again.
    expect(wait).not.toHaveBeenCalled();
    expect(checkSafariStorage).toHaveBeenCalledWith({ name: 'Safari' });
    expect(checkSafariStorage.mock.invocationCallOrder[0]).toBeLessThan(ensureSigningKeyRegistration.mock.invocationCallOrder[0]);
    expect(flushBrowserRegistration).toHaveBeenCalledTimes(1);
  });

  it('probes Safari storage immediately — WebKit cannot run us mid-rename, so a delay only postponed the registration work', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    await onStartup();

    expect(checkSafariStorage).toHaveBeenCalledTimes(1);
    // The check still goes first: a heal replaces the identity, so registering a
    // signing key for the old one would be wasted work.
    expect(checkSafariStorage.mock.invocationCallOrder[0])
      .toBeLessThan(ensureSigningKeyRegistration.mock.invocationCallOrder[0]);
    expect(checkSafariStorage.mock.invocationCallOrder[0])
      .toBeLessThan(flushBrowserRegistration.mock.invocationCallOrder[0]);
  });

  it('does not run the Safari storage check on other platforms', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Chrome');

    await onStartup();

    expect(checkSafariStorage).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
    expect(ensureSigningKeyRegistration).toHaveBeenCalledTimes(1);
  });
});
