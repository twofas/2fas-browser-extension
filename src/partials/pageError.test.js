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

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const showWithoutTimeout = vi.fn().mockResolvedValue('shown');
vi.mock('@notification/index.js', () => ({ default: { showWithoutTimeout: (...a) => showWithoutTimeout(...a) } }));

import pageError from './pageError.js';

beforeEach(() => {
  storeLog.mockClear();
  showWithoutTimeout.mockClear();
});

describe('pageError', () => {
  it('returns a handler that logs the error, then shows the persistent notification', async () => {
    const handler = pageError(20, 'installPage', { text: 'boom' });
    const err = new Error('bootstrap failed');

    const result = await handler(err);

    expect(storeLog).toHaveBeenCalledWith('error', 20, err, 'installPage');
    expect(showWithoutTimeout).toHaveBeenCalledWith({ text: 'boom' });
    expect(result).toBe('shown');
  });

  it('threads the given log id, source and notification through', async () => {
    await pageError(21, 'optionsPage', { text: 'oops' })(new Error('x'));

    expect(storeLog).toHaveBeenCalledWith('error', 21, expect.any(Error), 'optionsPage');
    expect(showWithoutTimeout).toHaveBeenCalledWith({ text: 'oops' });
  });
});
