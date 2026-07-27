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

// jsdom does no layout, so the real isVisible (which checks rendered dimensions)
// would report every element hidden and defeat segmented-group detection.
vi.mock('@partials/isVisible.js', () => ({ default: () => true }));
vi.mock('@content/functions/getTabData.js', () => ({ default: () => Promise.resolve({ status: 'loading' }) }));
vi.mock('@content/functions/pendingSubmit.js', () => ({
  setPendingSubmit: vi.fn(),
  resumePendingSubmit: vi.fn(),
  clearPendingSubmit: vi.fn(),
  consumeLoadCompleteSignal: vi.fn(() => false),
  MAX_PENDING_SUBMIT_AGE_MS: 15000
}));

import inputToken from './inputToken.js';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('inputToken — segmented per-box fill (T5)', () => {
  it('writes one digit into each detected box, and only into those boxes', async () => {
    const container = document.createElement('div');
    const boxes = [];

    for (let i = 0; i < 6; i++) {
      const box = document.createElement('input');
      box.setAttribute('maxlength', '1');
      box.type = 'tel';
      container.appendChild(box);
      boxes.push(box);
    }

    // An unrelated input right next to the group must be left untouched.
    const bystander = document.createElement('input');
    bystander.type = 'text';
    container.appendChild(bystander);

    document.body.appendChild(container);
    boxes[0].focus();

    const res = await inputToken({ token: '135790' }, boxes[0], 'https://example.test');

    expect(res.status).toBe('completed');
    expect(boxes.map(b => b.value)).toEqual(['1', '3', '5', '7', '9', '0']);
    // Overriding constraint: the digit stream never spilled into a non-box field.
    expect(bystander.value).toBe('');
  });

  it('reports unverified (not completed) when there are fewer boxes than digits', async () => {
    const container = document.createElement('div');
    const boxes = [];

    for (let i = 0; i < 4; i++) {
      const box = document.createElement('input');
      box.setAttribute('maxlength', '1');
      box.type = 'tel';
      container.appendChild(box);
      boxes.push(box);
    }

    document.body.appendChild(container);
    boxes[0].focus();

    // 6-digit token into a 4-box group: surplus digits are dropped, so the fill is
    // reported unverified (→ copy fallback), never a false 'completed'.
    const res = await inputToken({ token: '135790' }, boxes[0], 'https://example.test');

    expect(res.status).toBe('unverified');
  });
});
