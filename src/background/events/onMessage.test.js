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

const handleUpdateList = vi.fn();
vi.mock('@background/functions/updateListAction.js', () => ({ default: (...args) => handleUpdateList(...args) }));

import onMessage from './onMessage.js';
import storeLog from '@partials/storeLog.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  handleUpdateList.mockReset();
  storeLog.mockClear();
});

describe('onMessage — updateList', () => {
  it('applies the mutation and responds with ok plus the new list', async () => {
    handleUpdateList.mockResolvedValue({ list: 'domains', result: ['x.com'], added: true });
    const sendResponse = vi.fn();

    const ret = onMessage({ action: 'updateList', list: 'domains', op: 'add', value: 'x.com' }, {}, sendResponse);
    expect(ret).toBe(true);

    await flush();

    expect(handleUpdateList).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'updateList', list: 'domains', op: 'add', value: 'x.com' })
    );
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', list: 'domains', result: ['x.com'], added: true })
    );
  });

  it('responds with error and logs (id 53) when the mutation fails', async () => {
    handleUpdateList.mockRejectedValue(new Error('boom'));
    const sendResponse = vi.fn();

    onMessage({ action: 'updateList', list: 'domains', op: 'add', value: 'x.com' }, {}, sendResponse);

    await flush();

    expect(storeLog).toHaveBeenCalledWith('error', 53, expect.any(Error), 'updateList');
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error' });
  });

  it('rejects a malformed updateList request without calling the mutator', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'updateList' }, {}, sendResponse);

    await flush();

    expect(handleUpdateList).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});
