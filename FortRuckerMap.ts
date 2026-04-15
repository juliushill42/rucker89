// ============================================================
// FortRuckerMap — Procedural terrain for Fort Rucker, AL
// Based on real USGS elevation data for Enterprise/Dale County
// Hanchey Heliport: 31.36°N, 85.72°W, ~300ft MSL
// Lowe Army Heliport: 31.33°N, 85.75°W
// ============================================================

import * as THREE from 'three';

interface HelipadDef {
  id:       string;
  name:     string;
  position: THREE.Vector3;   // world meters from origin
  heading:  number;           // degrees
  radius:   number;           // m
  isActive: boolean;
}

export class FortRuckerMap {
  private scene:       THREE.Scene;
  private terrain:     THREE.Mesh;
  private helipadMeshes: THREE.Group[] = [];
  private trees:       THREE.InstancedMesh | null = null;
  private buildings:   THREE.Group;
  private water:       THREE.Mesh | null = null;

  // Heightmap data
  private heightData:  Float32Array;
  private mapSize:     number = 256;  // grid resolution
  private worldSize:   number = 4000; // meters across

  // Helipads at Fort Rucker (positioned relative to origin = Hanchey)
  public readonly helipads: HelipadDef[] = [
    {
      id: 'HANCHEY', name: 'Hanchey Army Heliport',
      position: new THREE.Vector3(0, 0, 0),
      heading: 36, radius: 15, isActive: true,
    },
    {
      id: 'LOWE',    name: 'Lowe Army Heliport',
      position: new THREE.Vector3(-320, -2, 280),
      heading: 60, radius: 18, isActive: true,
    },
    {
      id: 'WXFORD',  name: 'Wheatley Ford Stage Field',
      position: new THREE.Vector3(450, 3, -600),
      heading: 180, radius: 10, isActive: true,
    },
    {
      id: 'SHELL',   name: 'Shell Stage Field',
      position: new THREE.Vector3(-800, 5, -300),
      heading: 270, radius: 10, isActive: true,
    },
    {
      id: 'CAIRNS',  name: 'Cairns Army Airfield',
      position: new THREE.Vector3(900, 1, 600),
      heading: 18, radius: 30, isActive: true,
    },
  ];

  constructor(scene: THREE.Scene) {
    this.scene     = scene;
    this.buildings = new THREE.Group();

    this.heightData = this.generateHeightmap();
    this.terrain    = this.buildTerrain();
    this.buildHelipads();
    this.buildTrees();
    this.buildBuildings();
    this.buildWater();

    scene.add(this.terrain);
    scene.add(this.buildings);
    if (this.trees) scene.add(this.trees);
    if (this.water) scene.add(this.water);
  }

  // ── Heightmap generation ──────────────────────────────────
  private generateHeightmap(): Float32Array {
    const N    = this.mapSize;
    const data = new Float32Array(N * N);

    // Alabama Wiregrass region: gently rolling, pine forests
    // Elevation range: 280–380ft MSL → ~85–116m → we normalize to ~0–8m variation
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const nx = x / N;
        const nz = z / N;

        // Base gentle rolling terrain (several octaves of noise)
        let h = 0;
        h += this.smoothNoise(nx * 3,  nz * 3)  * 3.0;
        h += this.smoothNoise(nx * 7,  nz * 7)  * 1.2;
        h += this.smoothNoise(nx * 15, nz * 15) * 0.4;
        h += this.smoothNoise(nx * 31, nz * 31) * 0.1;

        // Flatten helipad areas
        for (const hp of this.helipads) {
          const hx = (hp.position.x / this.worldSize + 0.5) * N;
          const hz = (hp.position.z / this.worldSize + 0.5) * N;
          const dist = Math.sqrt((x - hx) ** 2 + (z - hz) ** 2);
          if (dist < 12) {
            h = h * (dist / 12) + hp.position.y * (1 - dist / 12);
          }
        }

        data[z * N + x] = h;
      }
    }
    return data;
  }

  /** Simple smooth noise using cosine interpolation */
  private smoothNoise(x: number, z: number): number {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;

    const n00 = this.prng(xi,     zi);
    const n10 = this.prng(xi + 1, zi);
    const n01 = this.prng(xi,     zi + 1);
    const n11 = this.prng(xi + 1, zi + 1);

    const cx = this.smoothstep(xf);
    const cz = this.smoothstep(zf);

    return (
      n00 * (1 - cx) * (1 - cz) +
      n10 * cx       * (1 - cz) +
      n01 * (1 - cx) * cz       +
      n11 * cx       * cz
    );
  }

  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private prng(x: number, z: number): number {
    // Simple hash
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // ── Terrain mesh ─────────────────────────────────────────
  private buildTerrain(): THREE.Mesh {
    const N   = this.mapSize;
    const W   = this.worldSize;
    const geo = new THREE.PlaneGeometry(W, W, N - 1, N - 1);

    // Apply height data to vertices
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightData[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Vertex colors for terrain variety
    const colors = new Float32Array(pos.count * 3);
    const colGrass  = new THREE.Color(0x5A7B3C);
    const colDirt   = new THREE.Color(0x8B7355);
    const colSand   = new THREE.Color(0xC4A882);

    for (let i = 0; i < pos.count; i++) {
      const h = this.heightData[i];
      let col: THREE.Color;
      if (h < 0.5)       col = colDirt;
      else if (h < 2.5)  col = colGrass;
      else               col = colGrass.clone().lerp(colDirt, (h - 2.5) / 5);
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness:    0.95,
      metalness:    0.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ── Helipads ─────────────────────────────────────────────
  private buildHelipads(): void {
    for (const hp of this.helipads) {
      const group = new THREE.Group();
      group.position.copy(hp.position);
      group.position.y += 0.05;

      // Pad surface
      const padGeo = new THREE.CylinderGeometry(hp.radius, hp.radius, 0.08, 32);
      const padMat = new THREE.MeshStandardMaterial({
        color:     0x2A2A2A,
        roughness: 0.95,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.receiveShadow = true;
      group.add(pad);

      // H marker
      const hMarker = this.makeHMarker(hp.radius * 0.6);
      hMarker.position.y = 0.05;
      group.add(hMarker);

      // Perimeter lights (white)
      const nLights = 12;
      for (let i = 0; i < nLights; i++) {
        const a = (i / nLights) * Math.PI * 2;
        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0xFFFFCC, emissive: 0xFFFFCC, emissiveIntensity: 0.8 })
        );
        light.position.set(Math.cos(a) * hp.radius, 0.1, Math.sin(a) * hp.radius);
        group.add(light);
      }

      // Name label (approach cone marker)
      const windMarker = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: 0xFF6600 })
      );
      windMarker.position.set(0, 1.2, -hp.radius - 2);
      group.add(windMarker);

      this.scene.add(group);
      this.helipadMeshes.push(group);
    }
  }

  private makeHMarker(size: number): THREE.Group {
    const group = new THREE.Group();
    const mat   = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
    // Two vertical strokes
    const vBar  = new THREE.Mesh(new THREE.BoxGeometry(size * 0.15, 0.04, size), mat);
    const vBar2 = vBar.clone();
    vBar.position.x  = -size * 0.35;
    vBar2.position.x = size * 0.35;
    group.add(vBar, vBar2);
    // Cross bar
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(size * 0.85, 0.04, size * 0.15), mat);
    group.add(hBar);
    return group;
  }

  // ── Trees (instanced for performance) ────────────────────
  private buildTrees(): void {
    const N      = 1200;
    const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 4, 6);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5C3B1E, roughness: 0.95 });
    const crownG = new THREE.ConeGeometry(1.8, 6, 7);
    const crownM = new THREE.MeshStandardMaterial({ color: 0x2E5C1A, roughness: 0.9 });

    const trunks = new THREE.InstancedMesh(trunkG, trunkM, N);
    const crowns = new THREE.InstancedMesh(crownG, crownM, N);
    trunks.castShadow = true;
    crowns.castShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      let tx: number, tz: number;
      let attempts = 0;
      do {
        tx = (Math.random() - 0.5) * this.worldSize * 0.95;
        tz = (Math.random() - 0.5) * this.worldSize * 0.95;
        attempts++;
      } while (this.nearHelipad(tx, tz, 50) && attempts < 20);

      const ty = this.getHeight(tx, tz);
      const scale = 0.6 + Math.random() * 0.9;

      dummy.position.set(tx, ty + 2, tz);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.y = ty + 7 * scale;
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    }

    this.scene.add(trunks);
    this.scene.add(crowns);
  }

  // ── Buildings ─────────────────────────────────────────────
  private buildBuildings(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9B8B7A, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5C4A3A, roughness: 0.9 });

    // Hangar complex near Hanchey
    const hangars = [
      { pos: [120, 0, 80],  size: [30, 8, 18] },
      { pos: [160, 0, 80],  size: [30, 8, 18] },
      { pos: [200, 0, 80],  size: [30, 8, 18] },
    ];
    hangars.forEach(h => {
      const geo = new THREE.BoxGeometry(...(h.size as [number, number, number]));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...(h.pos as [number, number, number]));
      mesh.position.y = (h.size as number[])[1] / 2 + this.getHeight(h.pos[0], h.pos[2]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.buildings.add(mesh);
    });

    // Control tower (Cairns area)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 4), mat);
    tower.position.set(905, 10 + this.getHeight(905, 605), 605);
    tower.castShadow = true;
    this.buildings.add(tower);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), roofMat);
    cab.position.copy(tower.position);
    cab.position.y += 10.5;
    this.buildings.add(cab);

    this.scene.add(this.buildings);
  }

  // ── Water feature (small pond/creek) ─────────────────────
  private buildWater(): void {
    const geo = new THREE.PlaneGeometry(80, 40);
    const mat = new THREE.MeshStandardMaterial({
      color:       0x2A5F8A,
      roughness:   0.05,
      metalness:   0.6,
      transparent: true,
      opacity:     0.85,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(-600, this.getHeight(-600, 400) + 0.1, 400);
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  // ── Height queries ────────────────────────────────────────
  getHeight(worldX: number, worldZ: number): number {
    const N  = this.mapSize;
    const W  = this.worldSize;
    const gx = ((worldX / W) + 0.5) * (N - 1);
    const gz = ((worldZ / W) + 0.5) * (N - 1);

    const x0 = Math.max(0, Math.min(N - 2, Math.floor(gx)));
    const z0 = Math.max(0, Math.min(N - 2, Math.floor(gz)));
    const xf = gx - x0;
    const zf = gz - z0;

    const h00 = this.heightData[ z0      * N + x0];
    const h10 = this.heightData[ z0      * N + x0 + 1];
    const h01 = this.heightData[(z0 + 1) * N + x0];
    const h11 = this.heightData[(z0 + 1) * N + x0 + 1];

    return (
      h00 * (1 - xf) * (1 - zf) +
      h10 * xf       * (1 - zf) +
      h01 * (1 - xf) * zf       +
      h11 * xf       * zf
    );
  }

  private nearHelipad(x: number, z: number, margin: number): boolean {
    return this.helipads.some(hp => {
      const dx = x - hp.position.x;
      const dz = z - hp.position.z;
      return Math.sqrt(dx * dx + dz * dz) < margin;
    });
  }

  update(cameraPos: THREE.Vector3): void {
    // LOD / streaming placeholder — terrain is static for now
    // Water animation
    if (this.water) {
      const t = performance.now() / 4000;
      (this.water.material as THREE.MeshStandardMaterial).roughness =
        0.05 + Math.sin(t) * 0.02;
    }
  }

  getNearestHelipad(pos: THREE.Vector3): HelipadDef {
    let best = this.helipads[0];
    let bestDist = Infinity;
    for (const hp of this.helipads) {
      const d = pos.distanceTo(hp.position);
      if (d < bestDist) { bestDist = d; best = hp; }
    }
    return best;
  }
}
