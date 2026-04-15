// ============================================================
// RotorSystem — Blade Element Theory (simplified)
// Models main and tail rotor aerodynamics
// ============================================================

import { AtmosphericConditions } from './Atmosphere';

export interface RotorState {
  rpm:           number;    // actual rotor RPM
  rpmPercent:    number;    // % of governed RPM (100% = normal)
  thrustN:       number;    // total thrust in Newtons
  torqueNm:      number;    // engine torque (Nm)
  torquePct:     number;    // torque as % of max torque
  diskAngleX:    number;    // cyclic longitudinal tilt (rad)
  diskAngleZ:    number;    // cyclic lateral tilt (rad)
  powerRequired: number;    // HP
  induced:       number;    // induced velocity m/s
  coning:        number;    // blade coning angle (rad)
}

export interface TailRotorState {
  thrustN:   number;
  torquePct: number;
  powerHP:   number;
}

export class RotorSystem {
  // Main rotor geometry
  private R:     number;   // radius (m)
  private A:     number;   // disk area (m²)
  private b:     number;   // number of blades
  private c:     number;   // chord (m)
  private twist: number;   // blade twist (rad)
  private clAlpha: number; // lift curve slope (/rad)
  private cd0:   number;   // blade profile drag
  private maxRPM: number;
  private designRPM: number;

  // Tail rotor geometry
  private trR:    number;
  private trA:    number;
  private trMaxThrust: number;

  // Engine
  private maxPowerHP: number;
  private maxTorquePct: number = 100;
  private governorActive: boolean = true;

  // State
  private currentRPM: number;
  private rotorPhase:  number = 0;  // for animation

  constructor(config: {
    mainRotorRadius:     number;
    numBlades:           number;
    bladeChord:          number;
    bladeTwist:          number;
    designRPM:           number;
    maxPowerHP:          number;
    tailRotorRadius:     number;
    tailRotorMaxThrust:  number;
  }) {
    this.R        = config.mainRotorRadius;
    this.A        = Math.PI * this.R * this.R;
    this.b        = config.numBlades;
    this.c        = config.bladeChord;
    this.twist    = config.bladeTwist;
    this.designRPM = config.designRPM;
    this.maxRPM   = config.designRPM * 1.1;
    this.currentRPM = 0;
    this.maxPowerHP = config.maxPowerHP;
    this.clAlpha  = 5.73; // /rad, typical NACA 0012 low Mach
    this.cd0      = 0.011;

    this.trR   = config.tailRotorRadius;
    this.trA   = Math.PI * this.trR * this.trR;
    this.trMaxThrust = config.tailRotorMaxThrust;
  }

  /**
   * Main update — computes rotor state from collective, cyclic, and atmospheric conditions.
   * dt in seconds, collective 0-1, cyclic in rad, velocity m/s
   */
  update(
    dt: number,
    collective: number,
    cyclicLong: number,
    cyclicLat:  number,
    pedals:     number,
    velocity:   [number, number, number],
    atmo:       AtmosphericConditions,
    engineN1:   number,   // 0-100 engine gas gen %
    weightN:    number,
    groundEffectFactor: number
  ): { main: RotorState; tail: TailRotorState } {
    const rho = atmo.airDensity;

    // ── Governor / RPM model ────────────────────────────
    const targetRPM = this.governorActive
      ? this.designRPM * (engineN1 / 100)
      : this.currentRPM;

    // RPM spool up/down (time constant ~8s for startup)
    const rpmTau = engineN1 > 60 ? 6 : 20;
    this.currentRPM += (targetRPM - this.currentRPM) * (dt / rpmTau);
    this.currentRPM  = Math.max(0, this.currentRPM);

    const rpmRatio   = this.currentRPM / this.designRPM;
    const Omega      = (this.currentRPM * 2 * Math.PI) / 60; // rad/s
    const vtip       = Omega * this.R;                         // m/s

    // Solidity
    const sigma      = (this.b * this.c) / (Math.PI * this.R);

    // Blade pitch (collective) — linear map 0→pitchMin, 1→pitchMax
    const pitchMin   = -2 * (Math.PI / 180);   // -2°
    const pitchMax   = 20 * (Math.PI / 180);    // 20°
    const theta0     = pitchMin + collective * (pitchMax - pitchMin);

    // Advance ratio μ (forward flight)
    const velX       = velocity[0];
    const velZ       = velocity[2];
    const vHoriz     = Math.sqrt(velX * velX + velZ * velZ);
    const mu         = vHoriz / (vtip + 0.001);

    // Inflow ratio λ (iterative momentum theory)
    const lambda     = this.solveInflow(theta0, sigma, mu, rho);

    // Thrust coefficient CT
    const CT = (sigma * this.clAlpha / 2) *
      (theta0 * (1/3 + mu * mu / 2) - lambda / 2 - mu * mu * this.twist / 4);

    const CT_clamped = Math.max(0, Math.min(CT, 0.025));

    // Raw OGE thrust
    const thrustOGE  = CT_clamped * rho * this.A * vtip * vtip;

    // Apply ground effect and RPM ratio
    const thrustN    = thrustOGE * groundEffectFactor * rpmRatio * rpmRatio;

    // Induced velocity
    const induced    = Math.sqrt(thrustN / (2 * rho * this.A + 0.001));

    // Power required (profile + induced)
    const CP_induced = CT_clamped * lambda;
    const CP_profile = sigma * this.cd0 / 8 * (1 + 4.65 * mu * mu);
    const CP         = CP_induced + CP_profile;
    const powerW     = CP * rho * this.A * vtip * vtip * vtip;
    const powerHP    = powerW / 745.7;

    // Torque = Power / Omega
    const torqueNm   = (powerW / (Omega + 0.001));
    // Max torque reference (from max power at design RPM)
    const maxTorRef  = (this.maxPowerHP * 745.7) / (this.designRPM * 2 * Math.PI / 60);
    const torquePct  = (torqueNm / maxTorRef) * 100;

    // Coning angle (simplified)
    const coning = Math.atan(thrustN / (this.b * weightN / this.b + 1));

    // Rotor disk tilt from cyclic (delayed slightly)
    const diskAngleX = cyclicLong * 0.12;  // ±7° max
    const diskAngleZ = cyclicLat  * 0.10;  // ±6° max

    // ── Tail rotor ──────────────────────────────────────
    const tail = this.calcTailRotor(pedals, torqueNm, rho, rpmRatio);

    // Phase for animation
    this.rotorPhase += Omega * dt;

    return {
      main: {
        rpm:           this.currentRPM,
        rpmPercent:    rpmRatio * 100,
        thrustN,
        torqueNm,
        torquePct:     Math.max(0, torquePct),
        diskAngleX,
        diskAngleZ,
        powerRequired: powerHP,
        induced,
        coning,
      },
      tail,
    };
  }

  /** Solve inflow ratio λ iteratively (simple momentum theory) */
  private solveInflow(theta0: number, sigma: number, mu: number, rho: number): number {
    let lambda = 0.05;
    for (let i = 0; i < 20; i++) {
      const CT    = (sigma * this.clAlpha / 2) * (theta0 * (1/3 + mu * mu / 2) - lambda / 2);
      const denom = 2 * Math.sqrt(mu * mu + lambda * lambda) + 0.001;
      const lambdaNew = CT / denom;
      if (Math.abs(lambdaNew - lambda) < 1e-5) break;
      lambda = lambdaNew;
    }
    return Math.max(lambda, 0);
  }

  private calcTailRotor(
    pedals:     number,
    mainTorqueNm: number,
    rho:         number,
    rpmRatio:    number
  ): TailRotorState {
    // Tail rotor must produce enough thrust to counteract main rotor torque
    // plus extra for directional control
    const Omega_tr    = (this.currentRPM * 2 * Math.PI / 60) * 5.5; // gear ratio ~5.5:1
    const vtip_tr     = Omega_tr * this.trR;

    // Torque from main rotor → moment arm → required anti-torque thrust
    // (assuming ~4.5m lever arm for UH-1H)
    const leverArm    = 4.5;
    const antiTorqueN = mainTorqueNm / leverArm;

    // Pedal input adds or subtracts control authority
    const controlN    = pedals * this.trMaxThrust;

    const totalThrust = antiTorqueN + controlN;
    const clampedT    = Math.max(-this.trMaxThrust, Math.min(this.trMaxThrust, totalThrust));

    // Power for tail rotor
    const induced_tr  = Math.sqrt(Math.abs(clampedT) / (2 * rho * this.trA + 0.001));
    const powerW_tr   = Math.abs(clampedT) * induced_tr * 1.2; // 20% profile drag
    const powerHP_tr  = powerW_tr / 745.7;

    return {
      thrustN:   clampedT * rpmRatio,
      torquePct: (Math.abs(clampedT) / this.trMaxThrust) * 100,
      powerHP:   powerHP_tr,
    };
  }

  getRotorPhase(): number { return this.rotorPhase; }
  getCurrentRPM():  number { return this.currentRPM; }
  getDesignRPM():   number { return this.designRPM; }
  getRadius():      number { return this.R; }
  getDiskArea():    number { return this.A; }

  setGovernor(active: boolean): void { this.governorActive = active; }
  forceRPM(rpm: number): void { this.currentRPM = rpm; }
}
