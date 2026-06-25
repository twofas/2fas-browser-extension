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

import { describe, it, expect } from 'vitest';
import { logURL, sanitizeLogValue } from './storeLog.js';

describe('logURL', () => {
  it('masks scheme, host markers and dots', () => {
    expect(logURL('https://www.example.com')).toBe('h**ps:**w*w*example*com');
    expect(logURL('http://example.com')).toBe('h**p:**example*com');
  });

  it('leaves no recognizable URL markers behind', () => {
    const masked = logURL('https://login.bank.example.com/secret?token=abc');

    expect(masked).not.toContain('http');
    expect(masked).not.toContain('://');
    expect(masked).not.toContain('.');
  });
});

describe('sanitizeLogValue', () => {
  it('masks a URL embedded in a string', () => {
    const out = sanitizeLogValue('Failed at https://www.example.com/login here');

    expect(out).not.toContain('https://');
    expect(out).not.toContain('example.com');
    expect(out).toContain('here'); // surrounding text is preserved
  });

  it('leaves a URL-free string unchanged', () => {
    expect(sanitizeLogValue('just a plain message')).toBe('just a plain message');
  });

  it('returns non-string primitives unchanged', () => {
    expect(sanitizeLogValue(42)).toBe(42);
    expect(sanitizeLogValue(true)).toBe(true);
    expect(sanitizeLogValue(null)).toBeNull();
    expect(sanitizeLogValue(undefined)).toBeUndefined();
  });

  it('extracts and masks an Error message and stack while keeping the name', () => {
    const err = new TypeError('boom at https://www.secret.example.com/x');
    const out = sanitizeLogValue(err);

    expect(out.name).toBe('TypeError');
    expect(out.message).not.toContain('secret.example.com');
    expect(typeof out.stack).toBe('string');
    expect(out.stack).not.toContain('https://');
  });

  it('recurses into arrays and nested objects', () => {
    const out = sanitizeLogValue({
      items: ['ok', 'see https://www.example.com/a'],
      meta: { url: 'https://example.org/b' }
    });

    expect(out.items[0]).toBe('ok');
    expect(out.items[1]).not.toContain('example.com');
    expect(out.meta.url).not.toContain('example.org');
  });

  it('guards against circular references', () => {
    const node = { url: 'https://www.example.com' };
    node.self = node;

    const out = sanitizeLogValue(node);

    expect(out.url).not.toContain('example.com');
    expect(out.self).toBe('[Circular]');
  });

  it('survives a property backed by a throwing getter', () => {
    const obj = {};
    Object.defineProperty(obj, 'bad', {
      enumerable: true,
      get () { throw new Error('nope'); }
    });

    expect(sanitizeLogValue(obj)).toEqual({ bad: '[unserializable]' });
  });

  it('drops sub-trees beyond the depth limit so deep URLs cannot leak raw', () => {
    let deep = { leaf: 'https://www.secret.example.com' };
    for (let i = 0; i < 8; i++) {
      deep = { nested: deep };
    }

    const serialized = JSON.stringify(sanitizeLogValue(deep));

    expect(serialized).toContain('[object]');
    expect(serialized).not.toContain('secret.example.com');
  });
});
