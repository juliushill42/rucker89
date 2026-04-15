// ============================================================
// Shared Types & Enums
// ============================================================

export enum GameMode {
  MENU              = 'MENU',
  COLD_AND_DARK     = 'COLD_AND_DARK',
  HOVER             = 'HOVER',
  TRAFFIC_PATTERN   = 'TRAFFIC_PATTERN',
  ENERGY_MANAGEMENT = 'ENERGY_MANAGEMENT',
  PREFLIGHT         = 'PREFLIGHT',
}

export interface SimState {
  mode:          GameMode;
  elapsed:       number;   // seconds since mode start
  score:         number;
  aircraftId:    string;
  coldAndDark:   boolean;
  engineRunning: boolean;
  paused:        boolean;
}

export interface ScoreEntry {
  id:         number;
  player:     string;
  mode:       string;
  score:      number;
  aircraft:   string;
  timestamp:  string;
  grade:      string;   // 'EXCEPTIONAL' | 'SATISFACTORY' | 'UNSATISFACTORY'
  details:    string;   // JSON serialized grade breakdown
}

export enum InstructorTone {
  GREETING    = 'greeting',
  INSTRUCTION = 'instruction',
  CORRECTION  = 'correction',
  WARNING     = 'warning',
  PRAISE      = 'praise',
  DEBRIEF     = 'debrief',
}
