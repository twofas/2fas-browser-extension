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

/* global MutationObserver, HTMLElement, WeakMap */

// Per-container teardown for the host observers/listeners a top-layer mount installs.
// Keyed by the container so a later re-mount (into a different host, or back to the
// body) can dispose the PREVIOUS mount's callbacks before wiring up new ones — else a
// stale 'close'/fullscreen/mutation callback from the old host would later yank the
// container out of the host it is now correctly living in (F5). A WeakMap keeps this
// off the DOM node and lets the entry be GC'd with the container.
const cleanups = new WeakMap();

/**
 * Runs and clears any registered teardown for a container. Idempotent.
 * @param {HTMLElement} container - The mounted container
 * @returns {void}
 */
const runCleanup = container => {
  const teardown = cleanups.get(container);

  if (teardown) {
    cleanups.delete(container);

    try {
      teardown();
    } catch {}
  }
};

/**
 * Finds a top-layer host that would render above a plain `position:fixed`
 * notification: the fullscreen element, or an open native modal `<dialog>`. A
 * `z-index`-only notification (however high) cannot beat the top layer, so it must
 * live inside it. Returns null when nothing competes.
 *
 * @returns {Element|null} The top-layer host, or null
 */
const getTopLayerHost = () => {
  if (document.fullscreenElement) {
    return document.fullscreenElement;
  }

  const openDialogs = document.querySelectorAll('dialog[open]');

  for (const dialog of openDialogs) {
    try {
      if (dialog.matches(':modal')) {
        return dialog;
      }
    } catch {
      // :modal unsupported on this engine — treat any open dialog as a top-layer host.
      return dialog;
    }
  }

  return null;
};

/**
 * Whether the Popover API is available for the element.
 * @param {Element} element - Element to check
 * @returns {boolean}
 */
const supportsPopover = element =>
  typeof HTMLElement !== 'undefined' &&
  'popover' in HTMLElement.prototype &&
  typeof element.showPopover === 'function';

/**
 * Mounts the container in the body as a top-layer POPOVER when supported — top
 * layer beats every z-index, and `popover="manual"` does NOT block the rest of the
 * page (no inert backdrop), so the user can still click through. Falls back to a
 * plain fixed-position child of the body where the API is unavailable.
 *
 * @param {HTMLElement} container - The notification container
 * @returns {void}
 */
const mountInBody = container => {
  if (supportsPopover(container)) {
    try {
      container.setAttribute('popover', 'manual');

      if (container.parentElement !== document.body) {
        document.body.appendChild(container);
      }

      // showPopover throws if the popover is already open; guard on the state.
      const alreadyOpen = typeof container.matches === 'function' && container.matches(':popover-open');

      if (!alreadyOpen) {
        container.showPopover();
      }

      return;
    } catch {
      // Fall through to a plain body mount.
    }
  }

  if (container.getAttribute && container.getAttribute('popover') !== null) {
    container.removeAttribute('popover');
  }

  if (container.parentElement !== document.body) {
    document.body.appendChild(container);
  }
};

/**
 * Mounts the notification container so it is visible above any current top layer
 * (Z6/N3):
 *   - If an open modal `<dialog>` / fullscreen element exists, append the container
 *     INTO it (so it shares that top-layer context and renders above it), and watch
 *     for the host closing / being removed — then move the container back to the
 *     body so the notification survives the top layer disappearing.
 *   - Otherwise mount it as a top-layer popover in the body (non-blocking), or a
 *     plain fixed element where popovers are unavailable.
 *
 * @param {HTMLElement} container - The notification container to mount
 * @returns {void}
 */
const mountTopLayer = container => {
  const host = getTopLayerHost();

  if (!host) {
    // Moving to the body (no top-layer host): dispose any observers/listeners a
    // previous host mount left behind so they can't drag the container around later.
    runCleanup(container);
    mountInBody(container);
    return;
  }

  // Already mounted in this host (a prior call set up its observers) — don't
  // re-append or stack another set of observers/listeners.
  if (container.parentElement === host) {
    return;
  }

  // (Re)mounting into a DIFFERENT top-layer host: tear down the previous mount's
  // observers/listeners first, so a stale callback from the old host can never move
  // the container out of this one (F5).
  runCleanup(container);

  // Inside a top-layer host: mount plainly (a popover attribute would conflict).
  if (container.getAttribute && container.getAttribute('popover') !== null) {
    container.removeAttribute('popover');
  }

  host.appendChild(container);

  let observer = null;

  const teardown = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    host.removeEventListener?.('close', moveToBody);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    cleanups.delete(container);
  };

  function moveToBody () {
    teardown();
    mountInBody(container);
  }

  function onFullscreenChange () {
    if (document.fullscreenElement !== host) {
      moveToBody();
    }
  }

  host.addEventListener?.('close', moveToBody);
  document.addEventListener('fullscreenchange', onFullscreenChange);

  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => {
      const stillHosting = host.isConnected && (host.tagName !== 'DIALOG' || host.hasAttribute('open'));

      if (!stillHosting) {
        moveToBody();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open']
    });
  }

  // Register this mount's teardown so a later re-mount (or body-mount) disposes these
  // observers/listeners before wiring up new ones.
  cleanups.set(container, teardown);
};

export { getTopLayerHost, supportsPopover, mountInBody };
export default mountTopLayer;
