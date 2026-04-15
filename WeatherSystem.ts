// ============================================================
// WeatherSystem — Visual weather for Fort Rucker sim
// Alabama summer: hot, humid, afternoon T-storms possible
// ============================================================

import * as THREE from 'three';

export class WeatherSystem {
  private scene:       THREE.Scene;
  private dustParticles: THREE.Points | null = null;
  private rainParticles: THREE.Points | null = null;
  private rainActive:  boolean = false;
  private dustActive:  boolean = false;
  private clock:       number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initDust();
  }

  private initDust(): void {
    // Rotor wash dust / FOD effect near ground
    const count = 800;
    const geo   = new THREE.BufferGeometry();
    const pos   = new Float32Array(count * 3);
    const col   = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = Math.random() * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      col[i * 3]     = 0.7 + Math.random() * 0.2;
      col[i * 3 + 1] = 0.65 + Math.random() * 0.1;
      col[i * 3 + 2] = 0.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size:         0.25,
      vertexColors: true,
      transparent:  true,
      opacity:      0.0,
      depthWrite:   false,
    });

    this.dustParticles = new THREE.Points(geo, mat);
    this.scene.add(this.dustParticles);
  }

  update(dt: number, heloPos: THREE.Vector3): void {
    this.clock += dt;

    // Update dust cloud position to follow helicopter low to ground
    if (this.dustParticles) {
      this.dustParticles.position.set(heloPos.x, heloPos.y, heloPos.z);
      // Show dust if helicopter is close to ground and rotor is spinning
      // (Managed by caller passing altAGL separately — simplified here)
    }

    // Animate dust particles
    if (this.dustParticles) {
      const pos = (this.dustParticles.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const count = pos.length / 3;
      for (let i = 0; i < count; i++) {
        pos[i * 3]     += Math.sin(this.clock * 0.7 + i) * 0.01;
        pos[i * 3 + 1] += 0.008;
        pos[i * 3 + 2] += Math.cos(this.clock * 0.5 + i) * 0.01;
        if (pos[i * 3 + 1] > 3) {
          pos[i * 3]     = (Math.random() - 0.5) * 20;
          pos[i * 3 + 1] = 0;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
        }
      }
      (this.dustParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  showDust(altAGL: number, torquePct: number): void {
    if (!this.dustParticles) return;
    const mat = this.dustParticles.material as THREE.PointsMaterial;
    const targetOpacity = altAGL < 5 && torquePct > 30
      ? Math.max(0, (1 - altAGL / 5)) * (torquePct / 100) * 0.7
      : 0;
    mat.opacity += (targetOpacity - mat.opacity) * 0.05;
  }

  setRain(active: boolean): void {
    this.rainActive = active;
  }
}
