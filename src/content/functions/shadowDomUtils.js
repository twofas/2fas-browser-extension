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

/* global ShadowRoot */
import browser from 'webextension-polyfill';

/**
 * Resolves an element's shadow root, including CLOSED roots. `element.shadowRoot`
 * is null for a closed root, hiding those subtrees; the WebExtensions
 * `browser.dom.openOrClosedShadowRoot(element)` API pierces both (T6). Falls back
 * to `element.shadowRoot` where the API is unavailable (older engines / tests).
 * @param {Element} element - Element whose shadow root to read
 * @returns {ShadowRoot|null} The open or closed shadow root, or null when none
 */
const getShadowRoot = element => {
  if (!element) {
    return null;
  }

  try {
    if (browser?.dom?.openOrClosedShadowRoot) {
      return browser.dom.openOrClosedShadowRoot(element) || null;
    }
  } catch {
    // Element not shadow-hosting / API refused — fall through to the open root.
  }

  return element.shadowRoot || null;
};

/**
 * Gets the deepest active element, traversing through shadowRoots (open or closed).
 * @returns {Element|null} The deepest focused element or null
 */
const getDeepActiveElement = () => {
  let active = document.activeElement;

  while (getShadowRoot(active)?.activeElement) {
    active = getShadowRoot(active).activeElement;
  }

  return active;
};

/**
 * Recursively collects all shadowRoots in the document, including CLOSED ones.
 * @param {Element|Document} root - Starting element to search from
 * @param {Set} visited - Set of visited shadowRoots to avoid duplicates
 * @returns {ShadowRoot[]} Array of all discovered shadowRoots
 */
const collectAllShadowRoots = (root = document, visited = new Set()) => {
  const shadowRoots = [];
  const elements = root.querySelectorAll('*');

  for (const element of elements) {
    const shadowRoot = getShadowRoot(element);

    if (shadowRoot && !visited.has(shadowRoot)) {
      visited.add(shadowRoot);
      shadowRoots.push(shadowRoot);
      shadowRoots.push(...collectAllShadowRoots(shadowRoot, visited));
    }
  }

  return shadowRoots;
};

/**
 * Queries elements across the document and all shadowRoots.
 * @param {string} selector - CSS selector to match
 * @param {ShadowRoot[]} [shadowRoots] - Pre-collected shadow roots to reuse
 *   (avoids re-walking the whole DOM on every call within one operation)
 * @returns {Element[]} Array of all matching elements
 */
const querySelectorAllDeep = (selector, shadowRoots = null) => {
  const results = [];

  results.push(...Array.from(document.querySelectorAll(selector)));

  const roots = shadowRoots || collectAllShadowRoots();

  for (const shadowRoot of roots) {
    try {
      results.push(...Array.from(shadowRoot.querySelectorAll(selector)));
    } catch {
      // Skip invalid selectors in specific shadowRoot contexts
    }
  }

  return results;
};

/**
 * Finds a single element across the document and all shadowRoots.
 * @param {string} selector - CSS selector to match
 * @param {ShadowRoot[]} [shadowRoots] - Pre-collected shadow roots to reuse
 * @returns {Element|null} First matching element or null
 */
const querySelectorDeep = (selector, shadowRoots = null) => {
  const result = document.querySelector(selector);

  if (result) {
    return result;
  }

  const roots = shadowRoots || collectAllShadowRoots();

  for (const shadowRoot of roots) {
    try {
      const found = shadowRoot.querySelector(selector);

      if (found) {
        return found;
      }
    } catch {
      // Skip invalid selectors in specific shadowRoot contexts
    }
  }

  return null;
};

/**
 * Finds the closest ancestor matching a selector, traversing through shadowRoots.
 * @param {Element} element - Starting element
 * @param {string} selector - CSS selector to match
 * @returns {Element|null} Closest matching ancestor or null
 */
const closestDeep = (element, selector) => {
  if (!element) {
    return null;
  }

  const closest = element.closest(selector);

  if (closest) {
    return closest;
  }

  const host = element.getRootNode()?.host;

  if (host) {
    return closestDeep(host, selector);
  }

  return null;
};

/**
 * Gets the root node of an element (document or shadowRoot).
 * @param {Element} element - Element to get root from
 * @returns {Document|ShadowRoot} The root node
 */
const getElementRoot = element => {
  return element?.getRootNode() || document;
};

/**
 * Checks if an element is inside a shadowRoot.
 * @param {Element} element - Element to check
 * @returns {boolean} True if element is inside a shadowRoot
 */
const isInShadowRoot = element => {
  const root = element?.getRootNode();

  return root instanceof ShadowRoot;
};

export {
  getShadowRoot,
  getDeepActiveElement,
  collectAllShadowRoots,
  querySelectorAllDeep,
  querySelectorDeep,
  closestDeep,
  getElementRoot,
  isInShadowRoot
};
