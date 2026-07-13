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

/**
 * Whether a device list contains a device with the given id. Shared between the
 * pairing path (handleConfigurationRequest) and the token-delivery security gate
 * (isDevicePaired) so the two can't drift.
 * @param {Array<{device_id: string}>} devices - The paired-device list.
 * @param {string} deviceId - The device id to look for.
 * @returns {boolean} True when a device with that id is present.
 */
const deviceListHasId = (devices, deviceId) => devices.some(device => device.device_id === deviceId);

export default deviceListHasId;
