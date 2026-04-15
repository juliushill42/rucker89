// ============================================================
// InputHandler — Keyboard / Mouse / Gamepad flight controls
// Maps raw inputs to normalized ControlInputs for FlightModel
// ============================================================

import { ControlInputs } from '../physics/FlightModel';

interface KeyMap {
  collective_up:    string[];  // throttle up / collective up
  collective_down:  string[];
  pedal_left:       string[];
  pedal_right:      string[];
  trim_reset:       string[];
  start_engine:     string[];
}

const DEFAULT_KEYMAP: KeyMap = {
  collective_up:   ['w', 'W'],
  collective_down: ['s', 'S'],
  pedal_left:      ['a', 'A'],
  pedal_right:     ['d', 'D'],
  trim_reset:      ['t', 'T'],
  start_engine:    ['e', 'E'],
};

export class InputHandler {
  private keys:         Set<string> = new Set();
  private mouseDeltaX: number = 0;
  private mouseDeltaY: number = 0;
  private mouseDown:   boolean = false;
  private pointerLocked: boolean = false;

  // Gamepad
  private gamepadIndex: number = -1;

  // Smooth control state (integrated)
  private collective:   number = 0;
  private pedals:       number = 0;
  private cycLat:       number = 0;  // cyclic lateral (mouse X)
  private cycLon:       number = 0;  // cyclic longitudinal (mouse Y)

  // Trim
  private trimCycLat:   number = 0;
  private trimCycLon:   number = 0;

  // Sensitivity
  private mouseSensitivity: number = 0.0025;
  private cyclicReturn:     number = 2.5;   // return-to-trim rate (1/s)
  private collectiveRate:   number = 0.4;   // 0→1 in 2.5s

  // Callbacks
  public onStartEngine: () => void = () => {};

  constructor() {
    this.attachKeyboard();
    this.attachMouse();
    this.attachGamepad();
    this.attachPointerLock();
  }

  // ── Keyboard ──────────────────────────────────────────────
  private attachKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (DEFAULT_KEYMAP.start_engine.includes(e.key.toLowerCase())) {
        this.onStartEngine();
      }
      e.preventDefault();
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  // ── Mouse ─────────────────────────────────────────────────
  private attachMouse(): void {
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.mouseDown) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        if (!this.pointerLocked) {
          document.body.requestPointerLock?.();
        }
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement !== null;
    });
  }

  private attachPointerLock(): void {
    // Click canvas to capture mouse
    const canvas = document.querySelector('canvas');
    canvas?.addEventListener('click', () => {
      canvas.requestPointerLock?.();
    });
  }

  // ── Gamepad ───────────────────────────────────────────────
  private attachGamepad(): void {
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = (e as GamepadEvent).gamepad.index;
      console.log('[Input] Gamepad connected:', (e as GamepadEvent).gamepad.id);
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = -1;
    });
  }

  // ── Main update — called each frame ───────────────────────
  getControls(): ControlInputs {
    const dt = 1 / 60; // approx

    // ── Gamepad ─────────────────────────────────────────────
    if (this.gamepadIndex >= 0) {
      const gp = navigator.getGamepads()[this.gamepadIndex];
      if (gp) {
        return this.readGamepad(gp);
      }
    }

    // ── Keyboard collective ──────────────────────────────────
    const collectiveUp   = DEFAULT_KEYMAP.collective_up.some(k => this.keys.has(k));
    const collectiveDown = DEFAULT_KEYMAP.collective_down.some(k => this.keys.has(k));

    if (collectiveUp)   this.collective = Math.min(1, this.collective + this.collectiveRate * dt);
    if (collectiveDown) this.collective = Math.max(0, this.collective - this.collectiveRate * dt);

    // ── Pedals ───────────────────────────────────────────────
    const pedalLeft  = DEFAULT_KEYMAP.pedal_left.some(k => this.keys.has(k));
    const pedalRight = DEFAULT_KEYMAP.pedal_right.some(k => this.keys.has(k));

    if (pedalLeft)  this.pedals = Math.max(-1, this.pedals - 1.2 * dt);
    if (pedalRight) this.pedals = Math.min(1,  this.pedals + 1.2 * dt);
    if (!pedalLeft && !pedalRight) {
      this.pedals *= Math.exp(-dt * 2.5);  // center slowly
    }

    // ── Trim reset ───────────────────────────────────────────
    if (DEFAULT_KEYMAP.trim_reset.some(k => this.keys.has(k))) {
      this.trimCycLat = this.cycLat;
      this.trimCycLon = this.cycLon;
    }

    // ── Cyclic from mouse ────────────────────────────────────
    this.cycLat += this.mouseDeltaX * this.mouseSensitivity;
    this.cycLon -= this.mouseDeltaY * this.mouseSensitivity;  // Y inverted

    // Clamp cyclic
    this.cycLat = Math.max(-1, Math.min(1, this.cycLat));
    this.cycLon = Math.max(-1, Math.min(1, this.cycLon));

    // Return toward trim when mouse not moving
    if (Math.abs(this.mouseDeltaX) < 0.5) {
      this.cycLat += (this.trimCycLat - this.cycLat) * dt * this.cyclicReturn;
    }
    if (Math.abs(this.mouseDeltaY) < 0.5) {
      this.cycLon += (this.trimCycLon - this.cycLon) * dt * this.cyclicReturn;
    }

    // Consume mouse delta
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    return {
      collective:          this.collective,
      cyclicLateral:       this.cycLat,
      cyclicLongitudinal:  this.cycLon,
      pedals:              this.pedals,
    };
  }

  private readGamepad(gp: Gamepad): ControlInputs {
    // Standard mapping:
    // Axis 0 = left stick X  → pedals
    // Axis 1 = left stick Y  → collective (inverted)
    // Axis 2 = right stick X → cyclic lateral
    // Axis 3 = right stick Y → cyclic longitudinal

    const deadband = (v: number) => Math.abs(v) < 0.08 ? 0 : v;

    const rawPed   = deadband(gp.axes[0]);
    const rawColl  = deadband(-gp.axes[1]);  // pull up = increase collective
    const rawCycLat = deadband(gp.axes[2]);
    const rawCycLon = deadband(-gp.axes[3]); // forward = positive

    // Smooth collective
    const dt = 1 / 60;
    this.collective += (rawColl - this.collective) * Math.min(1, dt * 6);

    return {
      collective:          Math.max(0, Math.min(1, this.collective)),
      cyclicLateral:       rawCycLat,
      cyclicLongitudinal:  rawCycLon,
      pedals:              rawPed,
    };
  }

  // ── Public helpers ────────────────────────────────────────
  isKeyDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  setSensitivity(s: number): void {
    this.mouseSensitivity = Math.max(0.0005, Math.min(0.01, s));
  }

  getCollective():  number { return this.collective; }
  getCyclic():      [number, number] { return [this.cycLat, this.cycLon]; }
  getPedals():      number { return this.pedals; }
}
