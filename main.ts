// ============================================================
// Rucker '89: The Pattern — Main Entry Point
// Fort Rucker Helicopter Simulator
// ============================================================

import * as THREE from 'three';
import { SimulatorApp } from './App';

let app: SimulatorApp | null = null;

// ── Loading progress ──────────────────────────────────────
const loadingBar    = document.getElementById('loading-bar') as HTMLDivElement;
const loadingStatus = document.getElementById('loading-status') as HTMLDivElement;
const loadingEl     = document.getElementById('loading') as HTMLDivElement;

function setProgress(pct: number, msg: string) {
  loadingBar.style.width = `${Math.min(100, pct)}%`;
  loadingStatus.textContent = msg;
}

// ── Boot Sequence ─────────────────────────────────────────
async function boot() {
  try {
    setProgress(5, 'LOADING TERRAIN DATA...');
    await delay(80);

    setProgress(15, 'INITIALIZING FLIGHT PHYSICS...');
    const { SimulatorApp } = await import('./App');
    await delay(60);

    setProgress(30, 'LOADING AIRCRAFT SYSTEMS...');
    await delay(60);

    setProgress(45, 'BUILDING FORT RUCKER MAP...');
    await delay(60);

    setProgress(60, 'CALIBRATING ROTOR SYSTEMS...');
    await delay(60);

    setProgress(75, 'INITIALIZING INSTRUCTOR AI...');
    await delay(60);

    setProgress(88, 'MOUNTING RENDERER...');
    const container = document.getElementById('canvas-container') as HTMLDivElement;
    app = new SimulatorApp(container);
    await delay(60);

    setProgress(95, 'FINAL CHECKS...');
    await delay(100);

    setProgress(100, 'READY — CLEAR TO HOVER');
    await delay(400);

    // Fade out loading screen
    loadingEl.classList.add('fade-out');
    await delay(800);
    loadingEl.style.display = 'none';

    // Start the sim
    app.start();

  } catch (err) {
    loadingStatus.textContent = `FAULT: ${(err as Error).message}`;
    loadingStatus.style.color = '#ff3b30';
    console.error('[Rucker89] Boot failed:', err);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Global error handler ──────────────────────────────────
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Rucker89] Unhandled promise rejection:', e.reason);
});

window.addEventListener('error', (e) => {
  console.error('[Rucker89] Global error:', e.message);
});

// ── Resize handler ────────────────────────────────────────
window.addEventListener('resize', () => {
  app?.onResize(window.innerWidth, window.innerHeight);
});

// ── Visibility change (pause when tabbed away) ────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    app?.pause();
  } else {
    app?.resume();
  }
});

// ── Boot ──────────────────────────────────────────────────
boot();
