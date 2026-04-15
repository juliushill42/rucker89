// ============================================================
// SimulatorApp — Top-Level Orchestrator
// Wires together: renderer, physics, input, AI instructor, modes
// ============================================================

import * as THREE from 'three';
import { Scene3D }          from './renderer/Scene';
import { HelicopterModel }  from './renderer/HelicopterModel';
import { WeatherSystem }    from './renderer/WeatherSystem';
import { FlightModel }      from './physics/FlightModel';
import { InputHandler }     from './input/InputHandler';
import { HUD }              from './ui/HUD';
import { Instruments }      from './ui/Instruments';
import { InstructorAI }     from './instructor/InstructorAI';
import { CheckrideSystem }  from './instructor/CheckrideSystem';
import { ScoreSystem }      from './instructor/ScoreSystem';
import { FortRuckerMap }    from './terrain/FortRuckerMap';
import { HoverMode }        from './modes/HoverMode';
import { TrafficPattern }   from './modes/TrafficPattern';
import { ColdAndDark }      from './modes/ColdAndDark';
import { EnergyManagement } from './modes/EnergyManagement';
import { Leaderboard }      from './ui/Leaderboard';
import { PreflightInspection } from './ui/PreflightInspection';
import { AircraftConfig, AIRCRAFT_CONFIGS } from './aircraft/AircraftConfig';
import { GameMode, SimState } from './types';

export class SimulatorApp {
  private container:    HTMLDivElement;
  private scene:        Scene3D;
  private flightModel:  FlightModel;
  private input:        InputHandler;
  private hud:          HUD;
  private instruments:  Instruments;
  private instructor:   InstructorAI;
  private checkride:    CheckrideSystem;
  private score:        ScoreSystem;
  private map:          FortRuckerMap;
  private heloModel:    HelicopterModel;
  private weather:      WeatherSystem;
  private leaderboard:  Leaderboard;
  private preflight:    PreflightInspection;

  private clock:        THREE.Clock;
  private animFrame:    number = 0;
  private paused:       boolean = false;
  private state:        SimState;
  private activeMode:   GameMode = GameMode.MENU;

  // Mode instances
  private modeHover:    HoverMode;
  private modePattern:  TrafficPattern;
  private modeCold:     ColdAndDark;
  private modeEnergy:   EnergyManagement;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.clock     = new THREE.Clock(false);

    // Init aircraft config (default UH-1H Huey)
    const aircraftConfig = AIRCRAFT_CONFIGS['UH1H'];

    // Core systems
    this.scene        = new Scene3D(container);
    this.flightModel  = new FlightModel(aircraftConfig);
    this.input        = new InputHandler();
    this.map          = new FortRuckerMap(this.scene.getScene());
    this.heloModel    = new HelicopterModel(this.scene.getScene(), aircraftConfig);
    this.weather      = new WeatherSystem(this.scene.getScene());

    // UI
    this.hud          = new HUD(document.getElementById('hud-canvas') as HTMLCanvasElement);
    this.instruments  = new Instruments(document.getElementById('ui-layer') as HTMLDivElement);
    this.leaderboard  = new Leaderboard(document.getElementById('ui-layer') as HTMLDivElement);
    this.preflight    = new PreflightInspection(document.getElementById('ui-layer') as HTMLDivElement, aircraftConfig);

    // Instructor & Scoring
    this.instructor   = new InstructorAI(document.getElementById('instructor-panel') as HTMLDivElement);
    this.checkride    = new CheckrideSystem(this.instructor, aircraftConfig);
    this.score        = new ScoreSystem();

    // Game modes
    this.modeHover    = new HoverMode(this.checkride, this.score);
    this.modePattern  = new TrafficPattern(this.checkride, this.score, aircraftConfig);
    this.modeCold     = new ColdAndDark(this.flightModel, aircraftConfig);
    this.modeEnergy   = new EnergyManagement(this.checkride, this.score, aircraftConfig);

    // Initial sim state
    this.state = this.buildInitialState(aircraftConfig);

    // Set starting position at Hanchey Heliport, Rucker
    this.flightModel.setPosition(new THREE.Vector3(0, 0, 0));

    // Wire up mode selector from menu
    this.setupMenuHandlers();

    console.log('[App] SimulatorApp initialized');
  }

  private buildInitialState(cfg: AircraftConfig): SimState {
    return {
      mode:          GameMode.MENU,
      elapsed:       0,
      score:         0,
      aircraftId:    cfg.id,
      coldAndDark:   false,
      engineRunning: false,
      paused:        false,
    };
  }

  // ── Public API ─────────────────────────────────────────
  start(): void {
    this.clock.start();
    this.showMenu();
    this.loop();
    console.log('[App] Simulation loop started');
  }

  pause(): void {
    this.paused = true;
    this.clock.stop();
  }

  resume(): void {
    this.paused = false;
    this.clock.start();
  }

  onResize(w: number, h: number): void {
    this.scene.onResize(w, h);
    this.hud.onResize(w, h);
  }

  // ── Main Loop ──────────────────────────────────────────
  private loop = (): void => {
    this.animFrame = requestAnimationFrame(this.loop);
    if (this.paused) return;

    const dt = Math.min(this.clock.getDelta(), 0.05); // cap at 50ms
    this.state.elapsed += dt;

    const controls = this.input.getControls();

    // Update flight physics
    const flightState = this.flightModel.update(dt, controls);

    // Update helicopter 3D model
    this.heloModel.update(dt, flightState);

    // Update camera to follow helicopter
    this.scene.updateCamera(flightState.position, flightState.attitude);

    // Update terrain LOD
    this.map.update(flightState.position);

    // Update weather
    this.weather.update(dt, flightState.position);

    // Update active game mode
    this.updateActiveMode(dt, flightState, controls);

    // Update HUD
    this.hud.update(flightState, controls, this.state);

    // Update instrument panel if visible
    this.instruments.update(flightState);

    // Render frame
    this.scene.render();
  };

  private updateActiveMode(dt: number, flightState: any, controls: any): void {
    switch (this.activeMode) {
      case GameMode.HOVER:
        this.modeHover.update(dt, flightState);
        break;
      case GameMode.TRAFFIC_PATTERN:
        this.modePattern.update(dt, flightState);
        break;
      case GameMode.COLD_AND_DARK:
        this.modeCold.update(dt, controls);
        break;
      case GameMode.ENERGY_MANAGEMENT:
        this.modeEnergy.update(dt, flightState);
        break;
    }
  }

  // ── Menu & Mode Switching ──────────────────────────────
  private showMenu(): void {
    this.activeMode = GameMode.MENU;
    const uiLayer   = document.getElementById('ui-layer')!;
    uiLayer.innerHTML = this.buildMenuHTML();

    // Greet with instructor
    this.instructor.speak(
      "Welcome to Fort Rucker, '89. I'm Warrant Officer Hayes. " +
      "Pick your mission and let's see what you're made of. " +
      "Remember: smooth is fast. Fast is smooth.",
      'greeting'
    );
  }

  private buildMenuHTML(): string {
    return `
    <div style="
      background: rgba(0,10,20,0.92);
      border: 1px solid rgba(0,255,136,0.3);
      padding: 2.5rem 3rem;
      min-width: min(500px, 90vw);
      font-family: 'Courier New', monospace;
      color: #00ff88;
    ">
      <div style="font-size:1.5rem;letter-spacing:0.4em;margin-bottom:0.3rem;text-align:center;">RUCKER '89</div>
      <div style="font-size:0.65rem;letter-spacing:0.5em;color:#ffb800;text-align:center;margin-bottom:2rem;">SELECT MISSION</div>

      <div style="display:flex;flex-direction:column;gap:0.8rem;">
        ${this.menuBtn('cold-dark',  'COLD AND DARK STARTUP', 'Master the UH-1H startup checklist')}
        ${this.menuBtn('hover',      'PERFECT HOVER CHALLENGE', 'Hold a 3ft hover. Easier said than done.')}
        ${this.menuBtn('pattern',    'TOUCH-AND-GO CIRCUIT',  'Complete a standard traffic pattern at Hanchey')}
        ${this.menuBtn('energy',     'ENERGY MANAGEMENT',     'OGE/IGE load puzzle — manage your power budget')}
        ${this.menuBtn('preflight',  'PREFLIGHT INSPECTION',  'Find the discrepancies on the 3D aircraft')}
        ${this.menuBtn('leaderboard','LEADERBOARD',           'See family & crew scores')}
      </div>

      <div style="margin-top:2rem;font-size:0.6rem;letter-spacing:0.2em;color:rgba(0,255,136,0.4);text-align:center;">
        CONTROLS: W/S=COLLECTIVE  A/D=PEDALS  MOUSE=CYCLIC  ESC=MENU
      </div>
    </div>`;
  }

  private menuBtn(id: string, label: string, sub: string): string {
    return `<button id="btn-${id}" style="
      background:transparent;border:1px solid rgba(0,255,136,0.3);
      color:#00ff88;font-family:inherit;padding:0.75rem 1rem;
      cursor:pointer;text-align:left;transition:all 0.15s;
      display:flex;flex-direction:column;gap:0.2rem;
    " onmouseover="this.style.background='rgba(0,255,136,0.08)';this.style.borderColor='#00ff88'"
       onmouseout="this.style.background='transparent';this.style.borderColor='rgba(0,255,136,0.3)'">
      <span style="font-size:0.8rem;letter-spacing:0.2em;">${label}</span>
      <span style="font-size:0.6rem;color:rgba(0,255,136,0.55);">${sub}</span>
    </button>`;
  }

  private setupMenuHandlers(): void {
    // Use event delegation on ui-layer since it gets replaced
    const uiLayer = document.getElementById('ui-layer')!;
    uiLayer.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;

      const id = btn.id;
      if      (id === 'btn-cold-dark')   this.enterMode(GameMode.COLD_AND_DARK);
      else if (id === 'btn-hover')        this.enterMode(GameMode.HOVER);
      else if (id === 'btn-pattern')      this.enterMode(GameMode.TRAFFIC_PATTERN);
      else if (id === 'btn-energy')       this.enterMode(GameMode.ENERGY_MANAGEMENT);
      else if (id === 'btn-preflight')    this.enterMode(GameMode.PREFLIGHT);
      else if (id === 'btn-leaderboard')  this.showLeaderboard();
    });

    // ESC to return to menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.showMenu();
      }
    });
  }

  private enterMode(mode: GameMode): void {
    const uiLayer = document.getElementById('ui-layer')!;
    this.activeMode = mode;
    this.state.mode = mode;

    switch (mode) {
      case GameMode.COLD_AND_DARK:
        uiLayer.innerHTML = '';
        this.modeCold.start();
        this.flightModel.reset();
        this.flightModel.coldAndDark();
        this.instructor.speak(
          "Alright, aircraft is cold and dark. Let's see your startup procedure. " +
          "Don't skip the BEFORE STARTING checklist. I'm watching every switch.", 'instruction'
        );
        break;

      case GameMode.HOVER:
        uiLayer.innerHTML = '';
        this.modeHover.start();
        this.flightModel.reset();
        this.flightModel.setEngineRunning(true);
        this.instructor.speak(
          "Today you're going to hold a three-foot hover over that pad. " +
          "No drift, no altitude change. Hover is the foundation of everything. " +
          "Your score is based on position deviation over sixty seconds.", 'instruction'
        );
        break;

      case GameMode.TRAFFIC_PATTERN:
        uiLayer.innerHTML = '';
        this.modePattern.start();
        this.flightModel.reset();
        this.flightModel.setEngineRunning(true);
        this.flightModel.setPosition(new THREE.Vector3(0, 1, 0)); // on pad
        this.instructor.speak(
          "Standard left-hand pattern. Depart upwind, crosswind at five hundred AGL, " +
          "turn downwind abeam, base, final. Touch and go. I'll grade your altitude control, " +
          "airspeed, and lineup. You're up.", 'instruction'
        );
        break;

      case GameMode.ENERGY_MANAGEMENT:
        uiLayer.innerHTML = '';
        this.modeEnergy.start();
        this.flightModel.reset();
        this.flightModel.setEngineRunning(true);
        this.instructor.speak(
          "Power management. You've got a load to move and a torque limit to respect. " +
          "Calculate your OGE hover ceiling before you commit. Exceed your torque limit " +
          "and I write you up. Fly smart.", 'instruction'
        );
        break;

      case GameMode.PREFLIGHT:
        this.preflight.start(uiLayer);
        this.instructor.speak(
          "Preflight inspection. I've introduced five discrepancies to this aircraft. " +
          "Find them all before we fly. Miss one in real life and it's a safety-of-flight issue.", 'instruction'
        );
        break;
    }
  }

  private showLeaderboard(): void {
    const uiLayer = document.getElementById('ui-layer')!;
    this.leaderboard.render(uiLayer);
  }
}
