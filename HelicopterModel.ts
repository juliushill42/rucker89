// ============================================================
// HelicopterModel — Procedural 3D helicopter geometry
// Builds UH-1H / OH-58 / AH-1 / AH-64 from primitives
// ============================================================

import * as THREE from 'three';
import { FlightState }   from '../physics/FlightModel';
import { AircraftConfig } from '../aircraft/AircraftConfig';

export class HelicopterModel {
  private scene:       THREE.Scene;
  private root:        THREE.Group;
  private body:        THREE.Group;
  private rotorHub:    THREE.Group;
  private blades:      THREE.Mesh[] = [];
  private tailRotor:   THREE.Group;
  private tailBlades:  THREE.Mesh[] = [];
  private exhaustPort: THREE.Group;

  // Animation state
  private bladeAngle:   number = 0;
  private trAngle:      number = 0;
  private bladeFlap:    number[] = [];
  private config:       AircraftConfig;

  // Materials
  private matBody:    THREE.MeshStandardMaterial;
  private matDarkGray: THREE.MeshStandardMaterial;
  private matGlass:   THREE.MeshStandardMaterial;
  private matBlade:   THREE.MeshStandardMaterial;
  private matExhaust: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, config: AircraftConfig) {
    this.scene  = scene;
    this.config = config;
    this.root   = new THREE.Group();
    this.body   = new THREE.Group();
    this.rotorHub = new THREE.Group();
    this.tailRotor = new THREE.Group();
    this.exhaustPort = new THREE.Group();

    // ── Materials ─────────────────────────────────────────
    this.matBody = new THREE.MeshStandardMaterial({
      color:     this.getArmyGreen(config.id),
      roughness: 0.75,
      metalness: 0.1,
    });
    this.matDarkGray = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a, roughness: 0.6, metalness: 0.3,
    });
    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0x88BBCC, roughness: 0.05, metalness: 0.0,
      transparent: true, opacity: 0.4,
    });
    this.matBlade = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.8, metalness: 0.05,
    });
    this.matExhaust = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.9, metalness: 0.5,
      emissive: 0x331100, emissiveIntensity: 0,
    });

    // Build based on aircraft
    switch (config.id) {
      case 'UH1H':  this.buildUH1H(); break;
      case 'OH58':  this.buildOH58(); break;
      case 'AH1':   this.buildAH1();  break;
      case 'AH64':  this.buildAH64(); break;
      default:      this.buildUH1H(); break;
    }

    this.root.add(this.body);
    this.root.castShadow    = true;
    this.root.receiveShadow = false;
    this.scene.add(this.root);

    // Init flap array
    for (let i = 0; i < config.numBlades; i++) this.bladeFlap.push(0);
  }

  private getArmyGreen(id: string): number {
    switch (id) {
      case 'AH64': return 0x3B4A3F;  // darker Apache green
      case 'AH1':  return 0x4A5A42;  // Cobra OD
      default:     return 0x4F6044;  // standard Army OD green
    }
  }

  // ── UH-1H Huey ───────────────────────────────────────────
  private buildUH1H(): void {
    // Fuselage main body
    const fuse = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.75, 4.5, 8, 16),
      this.matBody
    );
    fuse.rotation.x = Math.PI / 2;
    fuse.position.z = -0.5;
    fuse.castShadow = true;
    this.body.add(fuse);

    // Cockpit bubble
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      this.matGlass
    );
    cockpit.position.set(0, 0.3, 2.2);
    cockpit.scale.set(1, 0.7, 0.9);
    this.body.add(cockpit);

    // Tail boom
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.32, 5.5, 12),
      this.matBody
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.15, -5.2);
    tail.castShadow = true;
    this.body.add(tail);

    // Horizontal stabilizer
    const stab = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.05, 0.6),
      this.matBody
    );
    stab.position.set(0, 0.0, -7.5);
    this.body.add(stab);

    // Skids
    this.addSkids(-1.1, 1.1);

    // Engine cowling (top hump)
    const cowl = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.65, 1.6),
      this.matDarkGray
    );
    cowl.position.set(0, 0.85, -0.2);
    cowl.castShadow = true;
    this.body.add(cowl);

    // Exhaust stack
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.6, 8),
      this.matExhaust
    );
    exhaust.position.set(0.4, 1.35, -0.8);
    exhaust.rotation.z = -0.3;
    this.body.add(exhaust);

    // Main rotor system
    this.buildMainRotor(new THREE.Vector3(0, 1.6, 0), config => {});
    // Tail rotor
    this.buildTailRotor(new THREE.Vector3(-0.28, 0.12, -7.8), true);
  }

  // ── OH-58 Kiowa ───────────────────────────────────────────
  private buildOH58(): void {
    // Round egg-shaped body
    const fuse = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 12),
      this.matBody
    );
    fuse.scale.set(0.85, 0.75, 1.2);
    fuse.position.z = 0.3;
    fuse.castShadow = true;
    this.body.add(fuse);

    // Large bubble canopy
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
      this.matGlass
    );
    canopy.position.set(0, 0.3, 0.8);
    canopy.scale.set(1.0, 0.7, 1.0);
    this.body.add(canopy);

    // Slender tail boom
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.22, 4.6, 10),
      this.matBody
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.1, -3.8);
    tail.castShadow = true;
    this.body.add(tail);

    // Skids (short)
    this.addSkids(-0.8, 0.8);

    this.buildMainRotor(new THREE.Vector3(0, 1.4, 0), () => {});
    this.buildTailRotor(new THREE.Vector3(-0.18, 0.08, -6.0), true);
  }

  // ── AH-1 Cobra ────────────────────────────────────────────
  private buildAH1(): void {
    // Very narrow fuselage
    const fuse = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 5.0, 8, 16),
      this.matBody
    );
    fuse.rotation.x = Math.PI / 2;
    fuse.castShadow = true;
    this.body.add(fuse);

    // Forward gunner bubble (lower, narrow)
    const frontCockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.50, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      this.matGlass
    );
    frontCockpit.position.set(0, 0.1, 2.8);
    frontCockpit.scale.set(0.7, 0.5, 0.8);
    this.body.add(frontCockpit);

    // Aft pilot cockpit
    const rearCockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.50, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      this.matGlass
    );
    rearCockpit.position.set(0, 0.2, 1.4);
    rearCockpit.scale.set(0.8, 0.55, 0.8);
    this.body.add(rearCockpit);

    // Tail
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.26, 5.8, 10),
      this.matBody
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.05, -5.5);
    this.body.add(tail);

    // Stub wings
    const lwing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.7), this.matBody);
    lwing.position.set(-1.4, 0.0, 0.2);
    lwing.rotation.z = 0.05;
    this.body.add(lwing);
    const rwing = lwing.clone();
    rwing.position.x = 1.4;
    rwing.rotation.z = -0.05;
    this.body.add(rwing);

    // Chin turret (20mm)
    const turret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.5, 10),
      this.matDarkGray
    );
    turret.position.set(0, -0.42, 3.0);
    this.body.add(turret);

    // Skids
    this.addSkids(-0.65, 0.65);

    this.buildMainRotor(new THREE.Vector3(0, 1.3, 0), () => {});
    this.buildTailRotor(new THREE.Vector3(-0.20, 0.10, -8.0), true);
  }

  // ── AH-64 Apache ─────────────────────────────────────────
  private buildAH64(): void {
    // Wider fuselage
    const fuse = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.72, 4.8, 8, 16),
      this.matBody
    );
    fuse.rotation.x = Math.PI / 2;
    fuse.position.z = -0.3;
    fuse.castShadow = true;
    this.body.add(fuse);

    // Tandem cockpits (distinctive Apache profile)
    const frontGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.55, 1.1),
      this.matGlass
    );
    frontGlass.position.set(0, 0.3, 2.4);
    this.body.add(frontGlass);

    const rearGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.6, 0.9),
      this.matGlass
    );
    rearGlass.position.set(0, 0.35, 1.3);
    this.body.add(rearGlass);

    // Tail
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.30, 6.2, 10),
      this.matBody
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.2, -5.8);
    this.body.add(tail);

    // Stub wings (larger, weapon pylons)
    const lwing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 0.8), this.matBody);
    lwing.position.set(-1.6, -0.1, 0.0);
    this.body.add(lwing);
    const rwing = lwing.clone();
    rwing.position.x = 1.6;
    this.body.add(rwing);

    // Engine fairings (twin)
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 1.4), this.matDarkGray);
    eng.position.set(-0.55, 0.9, 0.0);
    this.body.add(eng);
    const eng2 = eng.clone();
    eng2.position.x = 0.55;
    this.body.add(eng2);

    // Chin TADS/PNVS sensor
    const tads = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.20, 0.4, 12),
      this.matDarkGray
    );
    tads.position.set(0, -0.3, 2.9);
    this.body.add(tads);

    // Hellfire rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), this.matDarkGray);
    rail.position.set(-2.0, -0.15, 0.2);
    this.body.add(rail);
    const rail2 = rail.clone();
    rail2.position.x = 2.0;
    this.body.add(rail2);

    // Skids
    this.addSkids(-1.15, 1.15);

    this.buildMainRotor(new THREE.Vector3(0, 1.85, 0), () => {});
    this.buildTailRotor(new THREE.Vector3(0.38, 0.35, -7.8), false);
  }

  // ── Shared rotor builders ─────────────────────────────────
  private buildMainRotor(position: THREE.Vector3, _cb: (x: any) => void): void {
    this.rotorHub = new THREE.Group();
    this.rotorHub.position.copy(position);

    // Hub
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.22, 12),
      this.matDarkGray
    );
    this.rotorHub.add(hub);

    // Blades
    this.blades = [];
    const n = this.config.numBlades;
    const R = this.config.mainRotorRadius;

    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      // Tapered blade: wider at root, narrow at tip
      const pts: THREE.Vector2[] = [];
      const segs = 12;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        pts.push(new THREE.Vector2(t * R, this.config.bladeChord * (1 - t * 0.55)));
      }
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      pts.forEach(p => shape.lineTo(p.x, p.y));
      shape.lineTo(R, 0);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.04, 0);

      const blade = new THREE.Mesh(geo, this.matBlade.clone());
      blade.castShadow = true;
      blade.rotation.y = angle;
      this.rotorHub.add(blade);
      this.blades.push(blade);
    }

    this.body.add(this.rotorHub);
  }

  private buildTailRotor(position: THREE.Vector3, portSide: boolean): void {
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.copy(position);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8),
      this.matDarkGray
    );
    hub.rotation.z = Math.PI / 2;
    this.tailRotor.add(hub);

    this.tailBlades = [];
    const R = this.config.tailRotorRadius;
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(R * 2, 0.02, 0.11),
        this.matBlade
      );
      blade.rotation.z = i * Math.PI / 2;
      this.tailRotor.add(blade);
      this.tailBlades.push(blade);
    }

    this.body.add(this.tailRotor);
  }

  private addSkids(leftX: number, rightX: number): void {
    const matSkid = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });

    // Left skid tube
    const lSkid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.0, 8), matSkid);
    lSkid.rotation.x = Math.PI / 2;
    lSkid.position.set(leftX, -0.65, -0.3);
    this.body.add(lSkid);

    // Right skid tube
    const rSkid = lSkid.clone();
    rSkid.position.x = rightX;
    this.body.add(rSkid);

    // Cross tubes (struts)
    const strut1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.abs(rightX - leftX) + 0.1, 8), matSkid);
    strut1.rotation.z = Math.PI / 2;
    strut1.position.set(0, -0.42, 0.8);
    this.body.add(strut1);

    const strut2 = strut1.clone();
    strut2.position.z = -1.4;
    this.body.add(strut2);
  }

  // ── Update (animation) ────────────────────────────────────
  update(dt: number, state: FlightState): void {
    // Position & attitude
    this.root.position.copy(state.position);
    this.root.rotation.set(
      state.attitude.x,
      state.attitude.y,
      state.attitude.z,
      'YXZ'
    );

    // Main rotor spin
    const rpmRad = (state.rotorRPM * 2 * Math.PI) / 60;
    this.bladeAngle += rpmRad * dt;
    this.rotorHub.rotation.y = this.bladeAngle;

    // Blade flap (cyclic disk tilt shows as flap difference)
    for (let i = 0; i < this.blades.length; i++) {
      const phase = this.bladeAngle + (i / this.blades.length) * Math.PI * 2;
      const flapAmp = 0.04 * (state.rotor.torquePct / 100);
      this.blades[i].rotation.x = Math.sin(phase) * flapAmp;
    }

    // Tail rotor spin (geared ~5.5:1)
    this.trAngle += rpmRad * 5.5 * dt;
    this.tailRotor.rotation.x = this.trAngle;

    // Exhaust glow at high torque
    (this.matExhaust as THREE.MeshStandardMaterial).emissiveIntensity =
      Math.max(0, (state.torquePct - 80) / 20) * 0.6;
  }

  getRoot(): THREE.Group { return this.root; }
  getBody(): THREE.Group { return this.body; }
}
