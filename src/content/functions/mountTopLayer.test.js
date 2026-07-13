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

import { describe, it, expect, beforeEach } from 'vitest';
import mountTopLayer, { getTopLayerHost, supportsPopover } from './mountTopLayer.js';

const makeContainer = () => {
  const el = document.createElement('div');
  el.className = 'twofas-be-notifications';
  return el;
};

beforeEach(() => {
  document.body.replaceChildren();
});

describe('mountTopLayer — no top-layer host', () => {
  it('mounts the container in the body (plain fallback where popovers are unsupported)', () => {
    const container = makeContainer();
    mountTopLayer(container);

    expect(container.parentElement).toBe(document.body);
    // jsdom has no Popover API → no popover attribute is set.
    expect(container.getAttribute('popover')).toBeNull();
  });
});

// jsdom's matches(':modal') returns false rather than the real browser's true for a
// showModal()-opened dialog, so simulate a modal dialog explicitly.
const makeModalDialog = () => {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  dialog.matches = selector => selector === ':modal';
  document.body.appendChild(dialog);
  return dialog;
};

describe('mountTopLayer — existing open dialog (Z6)', () => {
  it('appends the container INTO an open modal dialog, then moves it back to body on close', () => {
    const dialog = makeModalDialog();

    const container = makeContainer();
    mountTopLayer(container);

    // Rendered within the dialog's top-layer context.
    expect(container.parentElement).toBe(dialog);

    // The dialog closes → observer/close listener relocates the notification to body
    // so it survives the top layer disappearing.
    dialog.dispatchEvent(new Event('close'));

    expect(container.parentElement).toBe(document.body);
  });
});

describe('mountTopLayer — re-mount across hosts (F5)', () => {
  it('does not let a stale callback from a previous host move the container after re-mounting into a new host', () => {
    const dialog1 = makeModalDialog();

    const container = makeContainer();
    mountTopLayer(container);
    expect(container.parentElement).toBe(dialog1);

    // A second modal dialog becomes the active top-layer host; the first is no longer
    // modal (so getTopLayerHost now resolves to dialog2), but the container is still
    // physically inside dialog1 — the re-mount path.
    const dialog2 = document.createElement('dialog');
    dialog2.setAttribute('open', '');
    dialog2.matches = selector => selector === ':modal';
    document.body.appendChild(dialog2);
    dialog1.matches = () => false;

    mountTopLayer(container);
    expect(container.parentElement).toBe(dialog2);

    // dialog1 closing must NOT relocate the container: its 'close' listener/observer
    // were torn down on re-mount. Before F5 this stale callback yanked it to the body.
    dialog1.dispatchEvent(new Event('close'));
    expect(container.parentElement).toBe(dialog2);
  });
});

describe('getTopLayerHost', () => {
  it('returns null when nothing is in the top layer', () => {
    expect(getTopLayerHost()).toBeNull();
  });

  it('returns an open modal dialog as the host', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    dialog.matches = selector => selector === ':modal';
    document.body.appendChild(dialog);

    expect(getTopLayerHost()).toBe(dialog);
  });

  it('falls back to treating an open dialog as a host when :modal throws (older engines)', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    dialog.matches = () => { throw new Error(':modal unsupported'); };
    document.body.appendChild(dialog);

    expect(getTopLayerHost()).toBe(dialog);
  });

  it('ignores a non-modal open dialog (not in the top layer)', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    dialog.matches = () => false; // non-modal
    document.body.appendChild(dialog);

    expect(getTopLayerHost()).toBeNull();
  });
});

describe('supportsPopover', () => {
  it('reports false when the Popover API is unavailable (jsdom)', () => {
    expect(supportsPopover(document.createElement('div'))).toBe(false);
  });

  it('uses the Popover API when available', () => {
    // Stub popover support on this element/prototype for one assertion.
    const container = makeContainer();
    let shown = false;
    container.showPopover = () => { shown = true; };
    container.matches = () => false; // not already open
    Object.defineProperty(HTMLElement.prototype, 'popover', { value: null, configurable: true });

    try {
      expect(supportsPopover(container)).toBe(true);
      mountTopLayer(container);
      expect(container.getAttribute('popover')).toBe('manual');
      expect(shown).toBe(true);
    } finally {
      delete HTMLElement.prototype.popover;
    }
  });
});
