// ============================================================
// FlightModel — Helicopter Flight Dynamics Integrator
// Euler integration of 6DOF equations of motion
// ============================================================

import * as THREE from 'three';
import { RotorSystem, RotorState, TailRotorState } from './RotorSystem';
import { Atmosphere, AtmosphericConditions }         from './Atmosphere';
import { GroundEffect }                              from './GroundEffect';
import { AircraftConfig }                            from '../aircraft/AircraftConfig';

export interface ControlInputs {
  collective:         number;  // 0 to 1
  cyclicLateral:      number;  // -1 (left) to +1 (right)
  cyclicLongitudinal: number;  // -1 (aft) to +1 (forward)
  pedals:             number;  // -1 (left yaw) to +1 (right yaw)
}

export interface FlightState {
  position:       THREE.Vector3;   // world meters (y = AGL)
  velocity:       THREE.Vector3;   // world m/s
  attitude:       THREE.Euler;     // body Euler (pitch, yaw, roll) rad
  angularVelocity: THREE.Vector3;  // body rad/s (p, q, r)
  altitudeAGL:    number;          // meters
  altitudeMSL:    number;          // meters
  airspeedKts:    number;          // knots
  groundspeedKts: number;
  verticalSpeedFPM: number;        // ft/min
  headingDeg:     number;
  rotorRPM:       number;
  torquePct:      number;
  engineN1:       number;          // 0-100
  engineN2:       number;          // 0-100 (NR — rotor RPM normalized)
  egt:            number;          // exhaust gas temp (°C)
  fuelKg:         number;
  weightN:        number;          // current weight (N)
  onGround:       boolean;
  groundContactForce: number;      // N
  rotor:          RotorState;
  tail:           TailRotorState;
  atmo:           AtmosphericConditions;
  groundEffect:   { factor: number; isInGroundEffect: boolean };
  overTorque:     boolean;
  lowRPM:         boolean;
}

const GRAVITY   = 9.80665;  // m/s²
const DEG2RAD   = Math.PI / 180;
const RAD2DEG   = 180 / Math.PI;
const MS2KTS    = 1.94384;
const MS2FPM    = 196.85;

export class FlightModel {
  private config:   AircraftConfig;
  private rotor:    RotorSystem;
  private atmo:     Atmosphere;
  private ge:       GroundEffect;

  // State
  private pos:      THREE.Vector3;
  private vel:      THREE.Vector3;
  private attitude: THREE.Euler;    // X=pitch, Y=yaw, Z=roll
  private angVel:   THREE.Vector3;  // body p, q, r
  private engineN1: number = 0;
  private engineN2: number = 0;
  private egt:      number = 15;    // ambient
  private fuelKg:   number;
  private startingUp: boolean = false;
  private engineRunning: boolean = false;
  private coldAndDark:   boolean = false;

  // Control filter (lag)
  private filtCollective: number = 0;
  private filtCycLat:     number = 0;
  private filtCycLon:     number = 0;
  private filtPedals:     number = 0;

  // Ground height lookup (flat for now, with helipad)
  private terrainHeight: (x: number, z: number) => number;

  // Previous vertical speed for vario
  private prevAltAGL: number = 0;

  constructor(config: AircraftConfig) {
    this.config  = config;

    this.rotor   = new RotorSystem({
      mainRotorRadius:     config.mainRotorRadius,
      numBlades:           config.numBlades,
      bladeChord:          config.bladeChord,
      bladeTwist:          config.bladeTwist * DEG2RAD,
      designRPM:           config.designRPM,
      maxPowerHP:          config.maxPowerHP,
      tailRotorRadius:     config.tailRotorRadius,
      tailRotorMaxThrust:  config.tailRotorMaxThrust,
    });

    this.atmo   = new Atmosphere(91, 15, 0.12);
    this.ge     = new GroundEffect(config.mainRotorRadius);

    this.pos    = new THREE.Vector3(0, 0, 0);
    this.vel    = new THREE.Vector3(0, 0, 0);
    this.attitude = new THREE.Euler(0, 0, 0, 'YXZ'); // yaw-pitch-roll order
    this.angVel  = new THREE.Vector3(0, 0, 0);
    this.fuelKg  = config.fuelCapacityKg;

    this.terrainHeight = (_x, _z) => 0; // flat; FortRuckerMap will override
  }

  // ── Public API ───────────────────────────────────────────

  setTerrainHeightFn(fn: (x: number, z: number) => number): void {
    this.terrainHeight = fn;
  }

  setPosition(p: THREE.Vector3): void { this.pos.copy(p); }

  reset(): void {
    this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.attitude.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.engineN1 = this.engineRunning ? 100 : 0;
    this.engineN2 = this.engineRunning ? 100 : 0;
    this.egt      = this.engineRunning ? 550 : 15;
    this.filtCollective = 0;
    this.filtCycLat     = 0;
    this.filtCycLon     = 0;
    this.filtPedals     = 0;
  }

  coldAndDark(): void {
    this.coldAndDark   = true;
    this.engineRunning = false;
    this.engineN1      = 0;
    this.engineN2      = 0;
    this.egt           = 15;
    this.rotor.forceRPM(0);
    this.rotor.setGovernor(false);
  }

  setEngineRunning(v: boolean): void {
    this.engineRunning = v;
    this.coldAndDark   = false;
    if (v) {
      this.engineN1 = 100;
      this.engineN2 = 100;
      this.egt      = 550;
      this.rotor.setGovernor(true);
      this.rotor.forceRPM(this.config.designRPM);
    }
  }

  startEngine(): void {
    this.startingUp = true;
  }

  // ── Main physics update ──────────────────────────────────

  update(dt: number, controls: ControlInputs): FlightState {
    this.atmo.update(dt);

    // ── Engine simulation ─────────────────────────────────
    this.updateEngine(dt, controls);

    // ── Control filtering (hydraulic servo lag) ───────────
    const tau = 0.07; // 70ms lag
    this.filtCollective += (controls.collective         - this.filtCollective) * (dt / tau);
    this.filtCycLat     += (controls.cyclicLateral      - this.filtCycLat)     * (dt / tau);
    this.filtCycLon     += (controls.cyclicLongitudinal - this.filtCycLon)     * (dt / tau);
    this.filtPedals     += (controls.pedals             - this.filtPedals)     * (dt / tau);

    // ── Terrain height at position ────────────────────────
    const terrH = this.terrainHeight(this.pos.x, this.pos.z);
    const altAGL = this.pos.y - terrH;

    // ── Atmosphere ────────────────────────────────────────
    const atmo = this.atmo.getConditions(Math.max(altAGL, 0));

    // ── Ground Effect ─────────────────────────────────────
    const ge   = this.ge.calculate(altAGL);

    // ── Weight ────────────────────────────────────────────
    const weightN   = (this.config.emptyWeightKg + this.fuelKg + this.config.maxPayloadKg * 0.5)
                      * GRAVITY;

    // ── Rotor ─────────────────────────────────────────────
    const { main: rotorState, tail } = this.rotor.update(
      dt,
      this.filtCollective,
      this.filtCycLon,
      this.filtCycLat,
      this.filtPedals,
      [this.vel.x, this.vel.y, this.vel.z],
      atmo,
      this.engineN1,
      weightN,
      ge.factor
    );

    // ── Forces in body frame ──────────────────────────────
    // Thrust vector (along rotor disk normal, tilted by cyclic)
    const thrustBody = new THREE.Vector3(
      -Math.sin(rotorState.diskAngleZ),   // lateral
       Math.cos(rotorState.diskAngleX) * Math.cos(rotorState.diskAngleZ), // up
      -Math.sin(rotorState.diskAngleX),   // fore/aft
    ).multiplyScalar(rotorState.thrustN);

    // Tail rotor force (lateral body frame)
    const tailForceBody = new THREE.Vector3(tail.thrustN, 0, 0);

    // ── Body to world rotation ────────────────────────────
    const quat = new THREE.Quaternion().setFromEuler(this.attitude);

    // Rotate forces to world frame
    const thrustWorld    = thrustBody.clone().applyQuaternion(quat);
    const tailForceWorld = tailForceBody.clone().applyQuaternion(quat);

    // ── Wind relative velocity ────────────────────────────
    const wind    = new THREE.Vector3(...atmo.windVector);
    const relVel  = this.vel.clone().sub(wind);

    // ── Aerodynamic drag ─────────────────────────────────
    // Parasite drag: D = 0.5 * rho * Cd_flat * A_flat * v²
    const speed    = relVel.length();
    const dragMag  = 0.5 * atmo.airDensity * this.config.parasiteDragCoeff * speed * speed;
    const dragWorld = relVel.length() > 0.01
      ? relVel.clone().normalize().multiplyScalar(-dragMag)
      : new THREE.Vector3();

    // ── Total force ───────────────────────────────────────
    const totalForce = new THREE.Vector3(0, -weightN, 0);  // gravity
    totalForce.add(thrustWorld);
    totalForce.add(tailForceWorld);
    totalForce.add(dragWorld);

    // ── Ground contact ────────────────────────────────────
    let onGround = false;
    let groundContactForce = 0;

    if (altAGL <= 0.05) {
      onGround = true;
      // Normal force to prevent penetration
      if (totalForce.y < 0) {
        groundContactForce = -totalForce.y;
        totalForce.y = 0;
        // Friction
        totalForce.x *= 0.3;
        totalForce.z *= 0.3;
      }
      // Snap to ground
      this.pos.y = terrH;
      if (this.vel.y < 0) this.vel.y = 0;
      this.vel.x *= 0.85;
      this.vel.z *= 0.85;
    }

    // ── Linear acceleration → velocity → position ─────────
    const mass = weightN / GRAVITY;
    const accel = totalForce.clone().divideScalar(mass);
    this.vel.addScaledVector(accel, dt);

    // Clamp velocity to aircraft limits
    const maxSpeed = this.config.vneKts / MS2KTS;
    if (this.vel.length() > maxSpeed) {
      this.vel.setLength(maxSpeed);
    }

    this.pos.addScaledVector(this.vel, dt);

    // ── Attitude dynamics ─────────────────────────────────
    this.updateAttitude(dt, rotorState, tail, atmo, mass, onGround);

    // ── Fuel burn ─────────────────────────────────────────
    const burnRate = this.config.fuelBurnKgPerHr * (rotorState.torquePct / 100);
    this.fuelKg    = Math.max(0, this.fuelKg - burnRate * dt / 3600);

    // ── Derived quantities ────────────────────────────────
    const groundspeed = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    const relSpeed     = Math.sqrt(relVel.x * relVel.x + relVel.z * relVel.z);
    const vsFPM        = ((altAGL - this.prevAltAGL) / dt) * MS2FPM;
    this.prevAltAGL    = altAGL;

    const heading = ((this.attitude.y * RAD2DEG % 360) + 360) % 360;

    const overTorque = rotorState.torquePct > this.config.maxTorquePct;
    const lowRPM     = rotorState.rpmPercent < 90;

    return {
      position:          this.pos.clone(),
      velocity:          this.vel.clone(),
      attitude:          this.attitude.clone(),
      angularVelocity:   this.angVel.clone(),
      altitudeAGL:       Math.max(0, altAGL),
      altitudeMSL:       this.pos.y + 91,
      airspeedKts:       relSpeed * MS2KTS,
      groundspeedKts:    groundspeed * MS2KTS,
      verticalSpeedFPM:  vsFPM,
      headingDeg:        heading,
      rotorRPM:          rotorState.rpm,
      torquePct:         rotorState.torquePct,
      engineN1:          this.engineN1,
      engineN2:          this.engineN2,
      egt:               this.egt,
      fuelKg:            this.fuelKg,
      weightN,
      onGround,
      groundContactForce,
      rotor:             rotorState,
      tail,
      atmo,
      groundEffect:      { factor: ge.factor, isInGroundEffect: ge.isInGroundEffect },
      overTorque,
      lowRPM,
    };
  }

  // ── Private helpers ──────────────────────────────────────

  private updateAttitude(
    dt: number,
    rotor: RotorState,
    tail: TailRotorState,
    atmo: AtmosphericConditions,
    mass: number,
    onGround: boolean
  ): void {
    const Ixx = this.config.momentOfInertiaX; // roll
    const Iyy = this.config.momentOfInertiaY; // yaw
    const Izz = this.config.momentOfInertiaZ; // pitch

    // ── Moments ──────────────────────────────────────────
    // Pitch moment from longitudinal cyclic
    const Mq  = -rotor.thrustN * this.config.mainRotorRadius * rotor.diskAngleX;
    // Roll moment from lateral cyclic
    const Mp  = -rotor.thrustN * this.config.mainRotorRadius * rotor.diskAngleZ;
    // Yaw moment = tail rotor * lever arm - main rotor torque
    const Mr  = tail.thrustN * this.config.tailBoom - (rotor.torqueNm * 0.3);

    // Damping moments (angular velocity damping)
    const dampX = -this.angVel.x * 1200;
    const dampY = -this.angVel.y * 600;
    const dampZ = -this.angVel.z * 1200;

    if (onGround) {
      // Constrain angular motion on ground
      this.angVel.multiplyScalar(0.8);
      // Level attitude slowly
      this.attitude.x *= 0.95;
      this.attitude.z *= 0.95;
      return;
    }

    // Angular accelerations
    const p_dot = (Mp + dampX) / Ixx;
    const q_dot = (Mq + dampZ) / Izz;
    const r_dot = (Mr + dampY) / Iyy;

    this.angVel.x += p_dot * dt;
    this.angVel.y += r_dot * dt;
    this.angVel.z += q_dot * dt;

    // Clamp angular rates
    this.angVel.x = Math.max(-3, Math.min(3, this.angVel.x));
    this.angVel.y = Math.max(-2, Math.min(2, this.angVel.y));
    this.angVel.z = Math.max(-3, Math.min(3, this.angVel.z));

    // Integrate attitude
    this.attitude.x += this.angVel.z * dt;  // pitch from q (Z ang vel)
    this.attitude.y += this.angVel.y * dt;  // yaw from r
    this.attitude.z += this.angVel.x * dt;  // roll from p

    // Clamp pitch & roll to ±60°
    this.attitude.x = Math.max(-1.0, Math.min(1.0, this.attitude.x));
    this.attitude.z = Math.max(-1.0, Math.min(1.0, this.attitude.z));
  }

  private updateEngine(dt: number, controls: ControlInputs): void {
    if (this.coldAndDark && !this.startingUp) {
      return;
    }

    if (this.startingUp) {
      // Startup sequence: N1 spools to 65%, then light-off
      const targetN1 = 105;
      this.engineN1 += (targetN1 - this.engineN1) * (dt / 12);
      if (this.engineN1 > 65) {
        this.egt = Math.min(720, this.egt + dt * 80); // temp spike on light-off
      }
      if (this.engineN1 > 98) {
        // Startup complete
        this.startingUp    = false;
        this.engineRunning = true;
        this.coldAndDark   = false;
        this.rotor.setGovernor(true);
        this.egt = 550;
      }
    }

    if (this.engineRunning) {
      this.engineN1 = 100;
      this.engineN2 = this.rotor.getCurrentRPM() / this.config.designRPM * 100;
      // EGT rises with torque demand
      const targetEGT = 500 + (this.rotor.getCurrentRPM() / this.config.designRPM) * 60;
      this.egt += (targetEGT - this.egt) * (dt / 5);
    }
  }
}
