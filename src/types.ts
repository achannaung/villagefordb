/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VillageRecord {
  srPcode: string;
  sr: string;            // State / Region (e.g. Ayeyarwady)
  district: string;      // District (e.g. Pyapon)
  township: string;      // Township (e.g. Bogale)
  villageTract: string;  // Village Tract
  village: string;       // Village (English)
  villageMm: string;     // Village (Burmese)
  latitude: string;      // Latitude coordinate in original string form
  longitude: string;     // Longitude coordinate in original string form
  source: string;        // Source GAD or other
}

export interface Stats {
  totalVillages: number;
  totalTownships: number;
  totalDistricts: number;
  totalStates: number;
}
