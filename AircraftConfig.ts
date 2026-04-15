// ============================================================
// AircraftConfig — Authentic 1988–1992 Fort Rucker fleet specs
// Data from FM 1-240, TM 1-1520-210-10, and historical records
// ============================================================

export interface AircraftConfig {
  id:                  string;
  name:                string;
  nickname:            string;
  yearIntroduced:      number;
  role:                string;
  description:         string;

  // Weight
  emptyWeightKg:       number;
  maxGrossWeightKg:    number;
  maxPayloadKg:        number;
  fuelCapacityKg:      number;
  fuelBurnKgPerHr:     number;

  // Main Rotor
  mainRotorRadius:     number;   // m
  numBlades:           number;
  bladeChord:          number;   // m
  bladeTwist:          number;   // degrees (negative wash-out)
  designRPM:           number;   // main rotor RPM at 100% NR
  bladeTipSpeed:       number;   // m/s (approx)

  // Tail Rotor
  tailRotorRadius:     number;   // m
  tailBoom:            number;   // m (moment arm)
  tailRotorMaxThrust:  number;   // N

  // Engine
  maxPowerHP:          number;   // total shaft HP available
  maxTorquePct:        number;   // red-line torque %
  engineCount:         number;

  // Performance
  vneKts:              number;   // never-exceed speed
  vhKts:               number;   // max level flight speed
  vyKts:               number;   // best rate of climb speed
  vxKts:               number;   // best angle of climb
  hovCeilingIGEft:     number;   // IGE hover ceiling (ft) std day
  hovCeilingOGEft:     number;   // OGE hover ceiling (ft) std day
  servicesCeiling:     number;   // ft MSL

  // Aerodynamics
  parasiteDragCoeff:   number;   // flat-plate drag coefficient × area (m²)

  // Inertia (kg⋅m²)
  momentOfInertiaX:    number;   // roll
  momentOfInertiaY:    number;   // yaw
  momentOfInertiaZ:    number;   // pitch

  // Preflight discrepancies pool
  preflight: PreflightDiscrepancy[];
}

export interface PreflightDiscrepancy {
  id:           string;
  system:       string;   // 'rotor' | 'engine' | 'fuel' | 'controls' | 'instruments'
  label:        string;
  description:  string;
  location:     [number, number, number]; // 3D position on model
  severity:     'safety-of-flight' | 'grounding' | 'minor';
}

// ── UH-1H Huey ───────────────────────────────────────────────
const UH1H: AircraftConfig = {
  id: 'UH1H', name: 'Bell UH-1H Iroquois', nickname: 'Huey',
  yearIntroduced: 1967, role: 'Utility / Training',
  description: 'The backbone of Fort Rucker training. If you can fly the Huey, you can fly anything.',

  emptyWeightKg:    2365, maxGrossWeightKg: 4310, maxPayloadKg: 1759,
  fuelCapacityKg:   867,  fuelBurnKgPerHr:  220,

  mainRotorRadius: 7.24, numBlades: 2, bladeChord: 0.53,
  bladeTwist: -9, designRPM: 324, bladeTipSpeed: 245,

  tailRotorRadius: 1.29, tailBoom: 6.73, tailRotorMaxThrust: 4450,

  maxPowerHP: 1100, maxTorquePct: 100, engineCount: 1,

  vneKts: 124, vhKts: 110, vyKts: 75, vxKts: 55,
  hovCeilingIGEft: 13600, hovCeilingOGEft: 7600,
  servicesCeiling: 12600,

  parasiteDragCoeff: 2.8,

  momentOfInertiaX: 3900, momentOfInertiaY: 5800, momentOfInertiaZ: 4200,

  preflight: [
    {
      id: 'uh1h-p1', system: 'rotor',
      label: 'Pitch link rod-end cracked',
      description: 'Forward-left pitch link shows a hairline crack at the rod-end fitting. Safety-of-flight item.',
      location: [0.8, 3.2, 0.5],
      severity: 'safety-of-flight',
    },
    {
      id: 'uh1h-p2', system: 'fuel',
      label: 'JP-8 fuel cap loose',
      description: 'Right fuel cap not fully seated. Will introduce air and degrade fuel flow at altitude.',
      location: [1.1, 2.0, -0.5],
      severity: 'grounding',
    },
    {
      id: 'uh1h-p3', system: 'controls',
      label: 'Tail rotor drive shaft safety wire missing',
      description: 'The safety wire on the tail rotor drive shaft coupling is absent.',
      location: [-4.5, 1.8, 0.0],
      severity: 'safety-of-flight',
    },
    {
      id: 'uh1h-p4', system: 'engine',
      label: 'Engine oil level low',
      description: 'Engine oil level is at the ADD mark. Should be at FULL before flight.',
      location: [0.0, 2.5, -1.2],
      severity: 'grounding',
    },
    {
      id: 'uh1h-p5', system: 'instruments',
      label: 'VSI glass cracked',
      description: 'Vertical speed indicator face glass has a crack. Instrument may be unreadable in bright sun.',
      location: [0.1, 1.6, 1.8],
      severity: 'minor',
    },
  ],
};

// ── OH-58A Kiowa ──────────────────────────────────────────────
const OH58: AircraftConfig = {
  id: 'OH58', name: 'Bell OH-58A/C Kiowa', nickname: 'Kiowa',
  yearIntroduced: 1969, role: 'Observation / Scout Training',
  description: 'Nimble scout bird. Used extensively for primary rotary-wing training at Rucker.',

  emptyWeightKg:    1089, maxGrossWeightKg: 1451, maxPayloadKg: 340,
  fuelCapacityKg:   220,  fuelBurnKgPerHr:  95,

  mainRotorRadius: 5.08, numBlades: 2, bladeChord: 0.33,
  bladeTwist: -8, designRPM: 395, bladeTipSpeed: 210,

  tailRotorRadius: 0.84, tailBoom: 4.94, tailRotorMaxThrust: 1800,

  maxPowerHP: 317, maxTorquePct: 100, engineCount: 1,

  vneKts: 120, vhKts: 110, vyKts: 70, vxKts: 50,
  hovCeilingIGEft: 12200, hovCeilingOGEft: 7000,
  servicesCeiling: 19000,

  parasiteDragCoeff: 1.4,

  momentOfInertiaX: 1200, momentOfInertiaY: 1900, momentOfInertiaZ: 1400,

  preflight: [
    {
      id: 'oh58-p1', system: 'rotor',
      label: 'Rotor blade nick on leading edge',
      description: 'FOD nick on main rotor blade leading edge, approximately 6 inches from tip. Ground aircraft.',
      location: [2.5, 3.0, 0.0],
      severity: 'grounding',
    },
    {
      id: 'oh58-p2', system: 'fuel',
      label: 'Fuel sample shows water contamination',
      description: 'Quick drain sample shows water droplets. Fuel must be re-sampled and sumped.',
      location: [-0.8, 0.5, 0.0],
      severity: 'safety-of-flight',
    },
    {
      id: 'oh58-p3', system: 'controls',
      label: 'Cyclic friction set too tight',
      description: 'Cyclic stick friction is at maximum — will mask trim forces.',
      location: [0.0, 1.2, 0.6],
      severity: 'minor',
    },
    {
      id: 'oh58-p4', system: 'engine',
      label: 'Turbine inlet temp probe loose',
      description: 'TIT probe connector is not fully seated. EGT indication may be false.',
      location: [0.2, 2.2, -0.9],
      severity: 'grounding',
    },
    {
      id: 'oh58-p5', system: 'instruments',
      label: 'Altimeter setting incorrect',
      description: 'Altimeter Kollsman window shows 29.42 inHg but current ATIS is 30.01.',
      location: [0.1, 1.6, 1.8],
      severity: 'minor',
    },
  ],
};

// ── AH-1 Cobra ────────────────────────────────────────────────
const AH1: AircraftConfig = {
  id: 'AH1', name: 'Bell AH-1S Cobra', nickname: 'Snake',
  yearIntroduced: 1967, role: 'Attack / Transition Training',
  description: 'The original attack helicopter. Slim-profile tandem seating, 20mm gun, TOW missiles.',

  emptyWeightKg:    2993, maxGrossWeightKg: 4535, maxPayloadKg: 730,
  fuelCapacityKg:   785,  fuelBurnKgPerHr:  290,

  mainRotorRadius: 6.70, numBlades: 2, bladeChord: 0.53,
  bladeTwist: -10, designRPM: 324, bladeTipSpeed: 228,

  tailRotorRadius: 1.29, tailBoom: 7.12, tailRotorMaxThrust: 5000,

  maxPowerHP: 1800, maxTorquePct: 100, engineCount: 1,

  vneKts: 149, vhKts: 141, vyKts: 80, vxKts: 60,
  hovCeilingIGEft: 12200, hovCeilingOGEft: 7800,
  servicesCeiling: 11500,

  parasiteDragCoeff: 1.8,  // slim profile

  momentOfInertiaX: 3200, momentOfInertiaY: 5000, momentOfInertiaZ: 3800,

  preflight: [
    {
      id: 'ah1-p1', system: 'rotor',
      label: 'Swashplate grease fitting clogged',
      description: 'Upper swashplate grease fitting is blocked. No grease took on last service.',
      location: [0.0, 3.5, 0.2],
      severity: 'grounding',
    },
    {
      id: 'ah1-p2', system: 'fuel',
      label: 'Stub wing fuel boost pump warning light on',
      description: 'Stub wing fuel boost pump light is illuminated during pre-flight BIT check.',
      location: [1.8, 1.4, 0.5],
      severity: 'safety-of-flight',
    },
    {
      id: 'ah1-p3', system: 'controls',
      label: 'Forward gunner stick play excessive',
      description: 'Front cyclic has excessive free play — over 1/2 inch at the grip.',
      location: [0.0, 1.3, 1.0],
      severity: 'grounding',
    },
    {
      id: 'ah1-p4', system: 'engine',
      label: 'Chip detector light',
      description: 'Engine chip detector caution light illuminated. Must investigate before flight.',
      location: [0.0, 2.3, -0.8],
      severity: 'safety-of-flight',
    },
    {
      id: 'ah1-p5', system: 'instruments',
      label: 'Torque indicator flag visible',
      description: 'Torque gauge off-flag is visible. Instrument is unreliable.',
      location: [0.2, 1.5, 1.8],
      severity: 'grounding',
    },
  ],
};

// ── AH-64A Apache ─────────────────────────────────────────────
const AH64: AircraftConfig = {
  id: 'AH64', name: 'Boeing AH-64A Apache', nickname: 'Apache',
  yearIntroduced: 1986, role: 'Attack',
  description: 'The new generation. Arrived at Rucker in force by 1989. FLIR, Hellfire, 30mm. The future.',

  emptyWeightKg:    5165, maxGrossWeightKg: 9525, maxPayloadKg: 1700,
  fuelCapacityKg:   1420, fuelBurnKgPerHr:  500,

  mainRotorRadius: 7.315, numBlades: 4, bladeChord: 0.533,
  bladeTwist: -9, designRPM: 289, bladeTipSpeed: 221,

  tailRotorRadius: 1.397, tailBoom: 8.3, tailRotorMaxThrust: 8000,

  maxPowerHP: 3800, maxTorquePct: 100, engineCount: 2,

  vneKts: 197, vhKts: 150, vyKts: 85, vxKts: 65,
  hovCeilingIGEft: 15000, hovCeilingOGEft: 11500,
  servicesCeiling: 21000,

  parasiteDragCoeff: 3.2,

  momentOfInertiaX: 7500, momentOfInertiaY: 10000, momentOfInertiaZ: 7000,

  preflight: [
    {
      id: 'ah64-p1', system: 'rotor',
      label: 'Elastomeric bearing out of tolerance',
      description: 'Forward-right blade elastomeric bearing shows crazing. Must be replaced.',
      location: [1.0, 4.2, 0.8],
      severity: 'safety-of-flight',
    },
    {
      id: 'ah64-p2', system: 'fuel',
      label: 'APU fuel shutoff valve position indicator',
      description: 'APU fuel shutoff valve indicator misaligned — valve may not be fully open.',
      location: [0.3, 2.0, -1.0],
      severity: 'grounding',
    },
    {
      id: 'ah64-p3', system: 'controls',
      label: 'DASE actuator fault code',
      description: 'Digital Automatic Stabilization Equipment shows fault code 42.',
      location: [0.0, 2.5, 0.5],
      severity: 'grounding',
    },
    {
      id: 'ah64-p4', system: 'engine',
      label: '30mm feed chute misrouted',
      description: 'M230 30mm feed chute has a kink that will cause a jam after ~40 rounds.',
      location: [0.4, 1.2, 1.2],
      severity: 'minor',
    },
    {
      id: 'ah64-p5', system: 'instruments',
      label: 'FLIR boresight off',
      description: 'FLIR boresight check failed by 4 mils. Weapons delivery will be inaccurate.',
      location: [0.0, 1.8, 2.0],
      severity: 'minor',
    },
  ],
};

export const AIRCRAFT_CONFIGS: Record<string, AircraftConfig> = {
  UH1H, OH58, AH1, AH64,
};
