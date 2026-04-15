// ============================================================
// Scene3D — Three.js renderer, camera system, lighting
// ============================================================

import * as THREE from 'three';
import { FlightState } from '../physics/FlightModel';

export class Scene3D {
  private renderer:    THREE.WebGLRenderer;
  private scene:       THREE.Scene;
  private camera:      THREE.PerspectiveCamera;
  private container:   HTMLDivElement;

  // Camera modes
  private cameraMode:  'chase' | 'cockpit' | 'orbit' | 'side' = 'chase';
  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(0, 3, 12);
  private cameraSmooth: THREE.Vector3 = new THREE.Vector3();

  // Lighting
  private sun:         THREE.DirectionalLight;
  private ambient:     THREE.AmbientLight;
  private hemi:        THREE.HemisphereLight;

  // Sky
  private skyMesh:     THREE.Mesh;
  private sunPosition: THREE.Vector3 = new THREE.Vector3(1, 0.4, 0.5).normalize();
  private timeOfDay:   number = 9; // 0-24 hours

  // Fog
  private fogColor:    THREE.Color = new THREE.Color(0xc8d8e8);

  constructor(container: HTMLDivElement) {
    this.container = container;
    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // ── Renderer ─────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias:   true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace  = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // ── Scene ─────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.fogColor, 800, 8000);

    // ── Camera ────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.5, 15000);
    this.camera.position.set(0, 5, 12);

    // ── Sky ───────────────────────────────────────────────
    this.skyMesh = this.buildSky();
    this.scene.add(this.skyMesh);

    // ── Lighting ─────────────────────────────────────────
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.5);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xFFF5E0, 1.8);
    this.sun.position.copy(this.sunPosition).multiplyScalar(500);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width  = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.sun.shadow.camera.near    = 1;
    this.sun.shadow.camera.far     = 2000;
    this.sun.shadow.camera.left    = -400;
    this.sun.shadow.camera.right   = 400;
    this.sun.shadow.camera.top     = 400;
    this.sun.shadow.camera.bottom  = -400;
    this.sun.shadow.bias           = -0.001;
    this.scene.add(this.sun);

    // ── Camera mode key ───────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') this.cycleCameraMode();
    });

    console.log('[Scene3D] Initialized', w, 'x', h);
  }

  // ── Sky dome ──────────────────────────────────────────────
  private buildSky(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(8000, 32, 16);
    // Alabama sky shader material (vertex-colored gradient)
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        topColor:    { value: new THREE.Color(0x3A7BD5) },
        bottomColor: { value: new THREE.Color(0xc8d8e8) },
        offset:      { value: 33 },
        exponent:    { value: 0.6 },
        sunDir:      { value: this.sunPosition },
        sunColor:    { value: new THREE.Color(0xFFF5C0) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          vec3 skyCol = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));
          // Sun disc
          vec3 viewDir = normalize(vWorldPosition);
          float sun = max(dot(viewDir, normalize(sunDir)), 0.0);
          skyCol += sunColor * pow(sun, 180.0) * 2.0;
          // Sun halo
          skyCol += sunColor * 0.3 * pow(sun, 8.0);
          gl_FragColor = vec4(skyCol, 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  // ── Camera update ─────────────────────────────────────────
  updateCamera(heloPos: THREE.Vector3, attitude: THREE.Euler): void {
    const target = heloPos.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.cameraTarget.lerp(target, 0.05);

    // Move shadow camera with helicopter
    this.sun.position.copy(heloPos).add(this.sunPosition.clone().multiplyScalar(500));
    this.sun.target.position.copy(heloPos);
    this.sun.target.updateMatrixWorld();

    switch (this.cameraMode) {
      case 'chase': {
        // Follow from behind and above
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, attitude.y, 0, 'YXZ')
        );
        const offset = new THREE.Vector3(0, 4.5, 14).applyQuaternion(q);
        const idealPos = heloPos.clone().add(offset);
        this.cameraSmooth.lerp(idealPos, 0.04);
        this.camera.position.copy(this.cameraSmooth);
        this.camera.lookAt(this.cameraTarget);
        break;
      }
      case 'cockpit': {
        // First person: inside cockpit
        const q = new THREE.Quaternion().setFromEuler(attitude);
        const cockpitOffset = new THREE.Vector3(0, 1.2, 1.0);
        cockpitOffset.applyQuaternion(q);
        this.camera.position.copy(heloPos).add(cockpitOffset);
        const lookAt = heloPos.clone().add(
          new THREE.Vector3(0, 0, -50).applyQuaternion(q)
        );
        this.camera.lookAt(lookAt);
        break;
      }
      case 'orbit': {
        // Fixed orbit around helicopter
        const t   = performance.now() / 10000;
        const r   = 30;
        const orbitPos = new THREE.Vector3(
          heloPos.x + Math.cos(t) * r,
          heloPos.y + 8,
          heloPos.z + Math.sin(t) * r
        );
        this.camera.position.lerp(orbitPos, 0.03);
        this.camera.lookAt(this.cameraTarget);
        break;
      }
      case 'side': {
        // Side-on view
        const sidePos = heloPos.clone().add(new THREE.Vector3(25, 5, 0));
        this.camera.position.lerp(sidePos, 0.04);
        this.camera.lookAt(this.cameraTarget);
        break;
      }
    }
  }

  private cycleCameraMode(): void {
    const modes: Array<typeof this.cameraMode> = ['chase', 'cockpit', 'orbit', 'side'];
    const idx = modes.indexOf(this.cameraMode);
    this.cameraMode = modes[(idx + 1) % modes.length];
    console.log('[Scene3D] Camera mode:', this.cameraMode);
  }

  // ── Render ────────────────────────────────────────────────
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // ── Resize ────────────────────────────────────────────────
  onResize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── Accessors ─────────────────────────────────────────────
  getScene():    THREE.Scene    { return this.scene; }
  getCamera():   THREE.PerspectiveCamera { return this.camera; }
  getRenderer(): THREE.WebGLRenderer { return this.renderer; }
}
