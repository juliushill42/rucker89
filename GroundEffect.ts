// ============================================================
// Ground Effect — IGE / OGE hover performance calculations
// Based on classical Cheeseman & Bennett ground effect theory
// ============================================================

/**
 * Ground effect increases rotor thrust (or reduces power required)
 * when operating within approximately one rotor diameter of the ground.
 *
 * Theory: Cheeseman–Bennett formula:
 *   T_IGE / T_OGE = 1 / [1 - (R / 4z)²]
 *   where R = rotor radius, z = height above ground
 *
 * Valid for z > R/2 (below that it's landing gear contact range)
 * At z = R: T_IGE ≈ 1.07 × T_OGE
 * At z = 2R: T_IGE ≈ 1.02 × T_OGE  (negligible)
 */

export interface GroundEffectResult {
  factor:          number;   // IGE thrust multiplier (≥ 1.0)
  isInGroundEffect: boolean;
  heightAGL:       number;   // meters
  ratioToRotorDiam: number;  // h / D
  powerReduction:  number;   // fraction of power saved vs OGE
}

export class GroundEffect {
  private rotorRadius: number;  // meters
  private rotorDiameter: number;

  constructor(rotorRadius: number) {
    this.rotorRadius   = rotorRadius;
    this.rotorDiameter = rotorRadius * 2;
  }

  /**
   * Calculate ground effect factor at given height above ground (meters).
   * Returns a multiplier to apply to rotor thrust.
   */
  calculate(heightAGL: number): GroundEffectResult {
    const h   = Math.max(heightAGL, 0.01);
    const R   = this.rotorRadius;
    const z   = h;

    // IGE boundary: within one rotor diameter
    const inIGE = h < this.rotorDiameter;
    const ratio = h / this.rotorDiameter;

    let factor = 1.0;
    if (inIGE && z > R * 0.3) {
      // Cheeseman-Bennett: T_IGE/T_OGE = 1 / (1 - (R/4z)²)
      const term = R / (4 * z);
      const denom = 1 - term * term;
      if (denom > 0.01) {
        factor = 1 / denom;
      } else {
        factor = 1.5; // clamp very close to ground
      }
      factor = Math.min(factor, 1.5); // physical limit ~150%
    }

    // Power reduction: if thrust same, less power needed in IGE
    // P_IGE ≈ P_OGE / factor (simplified — actual is more complex)
    const powerReduction = inIGE ? 1 - (1 / factor) : 0;

    return {
      factor,
      isInGroundEffect: inIGE,
      heightAGL:        h,
      ratioToRotorDiam: ratio,
      powerReduction,
    };
  }

  /**
   * OGE hover ceiling calculation.
   * Given power available (HP), aircraft weight (N), density ratio σ,
   * returns maximum altitude where OGE hover is possible.
   *
   * Simplified: T = k * ρ * Ω² * R⁴ * (collective_pitch)
   * For our purposes we use: OGE hover power ∝ W^(3/2) / (2ρA)^(1/2)
   */
  calcOGEHoverCeiling(
    powerAvailableHP: number,
    weightN: number,
    densityRatioAtAlt: (altFeet: number) => number,
    bladeDiskAreaM2: number
  ): number {
    // Binary search for ceiling altitude (feet)
    let lo = 0, hi = 25000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const sigma = densityRatioAtAlt(mid);
      // Power required for OGE hover (hp):
      // P = W^1.5 / (sqrt(2 * ρ * A))  in SI, then convert
      const rho      = sigma * 1.225;
      const thrustN  = weightN;
      const powerW   = Math.pow(thrustN, 1.5) / Math.sqrt(2 * rho * bladeDiskAreaM2);
      const powerHP  = powerW / 745.7;
      if (powerHP < powerAvailableHP) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  /**
   * Returns approximate IGE hover ceiling (always higher than OGE)
   * because ground effect reduces power required.
   * Very rough estimate: IGE ceiling ≈ OGE ceiling + 1500–2000 ft
   */
  calcIGEHoverCeiling(ogeCeilingFt: number): number {
    return ogeCeilingFt + 1800;
  }

  /**
   * Energy-management puzzle helper:
   * Can we make this departure with current payload at current density altitude?
   */
  assessDepartureFeasibility(
    heightRequiredFt: number,
    densityAltitudeFt: number,
    torquePct: number,
    maxTorquePct: number,
    ogeCeilingFt: number,
  ): { feasible: boolean; margin: number; recommendation: string } {
    const margin      = ogeCeilingFt - densityAltitudeFt - heightRequiredFt;
    const torqueOK    = torquePct <= maxTorquePct;
    const feasible    = margin > 0 && torqueOK;

    let recommendation = '';
    if (!feasible) {
      if (!torqueOK) {
        recommendation = `Torque limit exceeded by ${(torquePct - maxTorquePct).toFixed(0)}%. Reduce load or wait for cooler air.`;
      } else {
        recommendation = `OGE ceiling insufficient. Need ${(-margin).toFixed(0)} more feet of margin. Reduce gross weight.`;
      }
    } else {
      recommendation = `Departure feasible. ${margin.toFixed(0)} ft margin above OGE ceiling.`;
    }

    return { feasible, margin, recommendation };
  }
}
