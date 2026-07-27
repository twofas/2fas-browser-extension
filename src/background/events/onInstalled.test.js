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

vi.mock('@background/functions/getBrowserInfo.js', () => ({ default: vi.fn().mockResolvedValue({ name: 'Chrome' }) }));
vi.mock('@background/contextMenu/index.js', () => ({ initContextMenu: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/openInstallPage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/generateDefaultStorage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/checkSafariStorage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/updateBrowserInfo.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/storageMigrations.js', () => ({ default: vi.fn().mockResolvedValue(1), CURRENT_SCHEMA_VERSION: 1 }));

import onInstalled from './onInstalled.js';
import runStorageMigrations from '@background/functions/storageMigrations.js';
import updateBrowserInfo from '@background/functions/updateBrowserInfo.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('onInstalled', () => {
  it('runs storage migrations before updating browser info on update', async () => {
    await onInstalled({ reason: 'update' });

    expect(runStorageMigrations).toHaveBeenCalled();
    expect(updateBrowserInfo).toHaveBeenCalled();
    expect(runStorageMigrations.mock.invocationCallOrder[0])
      .toBeLessThan(updateBrowserInfo.mock.invocationCallOrder[0]);
  });

  it('does not run migrations on a fresh install (version comes from default storage)', async () => {
    await onInstalled({ reason: 'install' });

    expect(runStorageMigrations).not.toHaveBeenCalled();
    expect(generateDefaultStorage).toHaveBeenCalled();
  });
});
