export interface Village {
  id: string;
  pcode: string;          // Real GAD P-Code, e.g. MMR017
  nameMm: string;         // Burmese name
  nameEn: string;         // English name
  tractMm: string;        // Village Tract (Burmese label)
  tractEn: string;        // Village Tract (English)
  townshipMm: string;
  townshipEn: string;
  stateMm: string;
  stateEn: string;
  districtEn: string;
  latitude: number;
  longitude: number;
  latDisplay: string;     // Original precision for display/copy (e.g. "95.36093140")
  lngDisplay: string;
  source: string;         // GAD / Field Sources / ...
}

export interface MonitorNote {
  villageId: string;
  note: string;
  updatedAt: string;
}

export interface FlaggedVillage {
  villageId: string;
  flaggedAt: string;
  status: 'pending' | 'monitored' | 'alert' | 'inactive';
}
