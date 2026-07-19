/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VillageRecord } from "./types";

/**
 * Parses a CSV line respecting standard CSV quoting rules.
 * Fast state machine that avoids expensive regular expressions.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses the villages CSV text into an array of VillageRecords.
 */
export function parseVillagesCSV(text: string): VillageRecord[] {
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const records: VillageRecord[] = [];
  
  // Header index map to be extremely robust to column reordering
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  
  const srPcodeIdx = headers.indexOf("sr_pcode");
  const srIdx = headers.indexOf("sr");
  const districtIdx = headers.indexOf("district");
  const townshipIdx = headers.indexOf("township");
  const villageTractIdx = headers.indexOf("village_tract");
  const villageIdx = headers.indexOf("village");
  const villageMmIdx = headers.indexOf("village_mm");
  const latitudeIdx = headers.indexOf("latitude");
  const longitudeIdx = headers.indexOf("longitude");
  const sourceIdx = headers.indexOf("source");

  // Fallback default index positions if headers are not perfectly matched
  const getVal = (row: string[], index: number, fallbackIdx: number): string => {
    const idx = index !== -1 ? index : fallbackIdx;
    return row[idx] || "";
  };

  const formatTo8Decimals = (val: string): string => {
    const trimmed = val.trim();
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed === 0) return trimmed;
    
    const parts = trimmed.split(".");
    if (parts.length === 2 && parts[1].length > 8) {
      return parsed.toFixed(8);
    }
    return trimmed;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const row = parseCSVLine(line);
    if (row.length < 8) continue; // Must have at least 8 elements to be valid
    
    const record: VillageRecord = {
      srPcode: getVal(row, srPcodeIdx, 0),
      sr: getVal(row, srIdx, 1),
      district: getVal(row, districtIdx, 2),
      township: getVal(row, townshipIdx, 3),
      villageTract: getVal(row, villageTractIdx, 4),
      village: getVal(row, villageIdx, 5),
      villageMm: getVal(row, villageMmIdx, 6),
      latitude: formatTo8Decimals(getVal(row, latitudeIdx, 7)),
      longitude: formatTo8Decimals(getVal(row, longitudeIdx, 8)),
      source: getVal(row, sourceIdx, 9),
    };
    
    // Quick validation: Latitude and Longitude should have some characters
    if (record.village || record.villageMm) {
      records.push(record);
    }
  }
  
  return records;
}
