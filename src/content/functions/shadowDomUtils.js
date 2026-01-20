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

/**
 * Gets the deepest active element, traversing through shadowRoots.
 * @returns {Element|null} The deepest focused element or null
 */
const getDeepActiveElement = () => {
  let active = document.activeElement;

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active;
};

/**
 * Recursively collects all shadowRoots in the document.
 * @param {Element|Document} root - Starting element to search from
 * @param {Set} visited - Set of visited shadowRoots to avoid duplicates
 * @returns {ShadowRoot[]} Array of all discovered shadowRoots
 */
const collectAllShadowRoots = (root = document, visited = new Set()) => {
  const shadowRoots = [];
  const elements = root.querySelectorAll('*');

  for (const element of elements) {
    if (element.shadowRoot && !visited.has(element.shadowRoot)) {
      visited.add(element.shadowRoot);
      shadowRoots.push(element.shadowRoot);
      shadowRoots.push(...collectAllShadowRoots(element.shadowRoot, visited));
    }
  }

  return shadowRoots;
};

/**
 * Queries elements across the document and all shadowRoots.
 * @param {string} selector - CSS selector to match
 * @returns {Element[]} Array of all matching elements
 */
const querySelectorAllDeep = selector => {
  const results = [];

  results.push(...Array.from(document.querySelectorAll(selector)));

  const shadowRoots = collectAllShadowRoots();

  for (const shadowRoot of shadowRoots) {
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
 * @returns {Element|null} First matching element or null
 */
const querySelectorDeep = selector => {
  const result = document.querySelector(selector);

  if (result) {
    return result;
  }

  const shadowRoots = collectAllShadowRoots();

  for (const shadowRoot of shadowRoots) {
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
  getDeepActiveElement,
  collectAllShadowRoots,
  querySelectorAllDeep,
  querySelectorDeep,
  closestDeep,
  getElementRoot,
  isInShadowRoot
};
