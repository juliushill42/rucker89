// ============================================================
// Atmosphere — International Standard Atmosphere model
// Fort Rucker elevation: ~300 ft / 91 m MSL (Enterprise, AL)
// ============================================================

export interface AtmosphericConditions {
  densityAltitude:    number;  // feet
  airDensity:         number;  // kg/m³
  temperature:        number;  // Kelvin
  pressure:           number;  // Pa
  speedOfSound:       number;  // m/s
  windVector:         [number, number, number]; // m/s in world frame
  turbulenceIntensity: number; // 0-1
}

const SEA_LEVEL_PRESSURE = 101325;   // Pa
const SEA_LEVEL_TEMP     = 288.15;   // K (15°C)
const SEA_LEVEL_DENSITY  = 1.225;    // kg/m³
const LAPSE_RATE         = 0.0065;   // K/m
const GAS_CONSTANT_AIR   = 287.058;  // J/(kg·K)
const GRAVITY            = 9.80665;  // m/s²
const GAMMA_AIR          = 1.4;      // specific heat ratio

export class Atmosphere {
  private baseAltitude: number;   // meters MSL (terrain elevation)
  private temperatureOffset: number; // departure from ISA (°C)
  private windVector:    [number, number, number];
  private gustTimer:     number = 0;
  private gustVector:    [number, number, number] = [0, 0, 0];
  private turbulence:    number;

  constructor(baseAltitudeMSL = 91, tempOffsetC = 15, turbulence = 0.1) {
    // Fort Rucker: ~91m MSL, Alabama summer averages ~15°C above ISA
    this.baseAltitude      = baseAltitudeMSL;
    this.temperatureOffset = tempOffsetC;
    this.turbulence        = turbulence;
    // Prevailing winds at Rucker: light and variable, 5-10 kts
    this.windVector = [2.5, 0, -1.5]; // m/s roughly south-westerly
  }

  /** Returns conditions at given height AGL (meters) */
  getConditions(altitudeAGL: number): AtmosphericConditions {
    const altMSL = this.baseAltitude + altitudeAGL;

    // ISA temperature at altitude
    const tempK = (SEA_LEVEL_TEMP + this.temperatureOffset) - LAPSE_RATE * altMSL;

    // ISA pressure (troposphere formula)
    const exponent = GRAVITY / (GAS_CONSTANT_AIR * LAPSE_RATE);
    const pressure  = SEA_LEVEL_PRESSURE * Math.pow(tempK / SEA_LEVEL_TEMP, exponent);

    // Air density from ideal gas law
    const density = pressure / (GAS_CONSTANT_AIR * tempK);

    // Speed of sound
    const sos = Math.sqrt(GAMMA_AIR * GAS_CONSTANT_AIR * tempK);

    // Density altitude (feet) — standard formula
    const densityAlt = (1 - Math.pow(density / SEA_LEVEL_DENSITY, 0.235)) * 145442.16;

    // Wind with gusts
    const wind = this.getWindWithGusts();

    return {
      densityAltitude:     densityAlt,
      airDensity:          density,
      temperature:         tempK,
      pressure:            pressure,
      speedOfSound:        sos,
      windVector:          wind,
      turbulenceIntensity: this.turbulence,
    };
  }

  update(dt: number): void {
    // Gust model: random walk with reversion
    this.gustTimer += dt;
    if (this.gustTimer > 3 + Math.random() * 5) {
      this.gustTimer = 0;
      const mag = this.turbulence * (2 + Math.random() * 3);
      const angle = Math.random() * Math.PI * 2;
      this.gustVector = [
        mag * Math.cos(angle),
        0,
        mag * Math.sin(angle),
      ];
    }
    // Decay gust
    this.gustVector[0] *= Math.exp(-dt * 0.8);
    this.gustVector[2] *= Math.exp(-dt * 0.8);
  }

  private getWindWithGusts(): [number, number, number] {
    return [
      this.windVector[0] + this.gustVector[0],
      this.windVector[1],
      this.windVector[2] + this.gustVector[2],
    ];
  }

  /** Density ratio σ = ρ/ρ₀ */
  getDensityRatio(altAGL: number): number {
    return this.getConditions(altAGL).airDensity / SEA_LEVEL_DENSITY;
  }

  setWind(vx: number, vy: number, vz: number): void {
    this.windVector = [vx, vy, vz];
  }

  setTurbulence(t: number): void {
    this.turbulence = Math.max(0, Math.min(1, t));
  }
}
