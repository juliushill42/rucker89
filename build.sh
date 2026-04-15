#!/usr/bin/env bash
# ============================================================
# Rucker '89: The Pattern — Full Recursive Build Script
# Fort Rucker Helicopter Simulator
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
BUILD_DIR="$PROJECT_ROOT/dist"
SERVER_DIR="$PROJECT_ROOT/server"
LOG_DIR="$PROJECT_ROOT/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOG_DIR/build_$TIMESTAMP.log"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[BUILD]${RESET} $1" | tee -a "$LOG_FILE"; }
ok()   { echo -e "${GREEN}[  OK ]${RESET} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[ WARN]${RESET} $1" | tee -a "$LOG_FILE"; }
fail() { echo -e "${RED}[FAIL ]${RESET} $1" | tee -a "$LOG_FILE"; exit 1; }

PHASE=0
phase() { PHASE=$((PHASE+1)); echo -e "\n${BOLD}═══ Phase $PHASE: $1 ═══${RESET}" | tee -a "$LOG_FILE"; }

banner() {
cat << 'EOF'

  ██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗██████╗     █████╗  █████╗ 
  ██╔══██╗██║   ██║██╔════╝██║ ██╔╝██╔════╝██╔══██╗   ██╔══██╗██╔══██╗
  ██████╔╝██║   ██║██║     █████╔╝ █████╗  ██████╔╝   ╚█████╔╝╚██████║
  ██╔══██╗██║   ██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗   ██╔══██╗ ╚═══██║
  ██║  ██║╚██████╔╝╚██████╗██║  ██╗███████╗██║  ██║   ╚█████╔╝ █████╔╝
  ╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝    ╚════╝  ╚════╝ 
                    T H E   P A T T E R N  |  Fort Rucker 1989

EOF
}

usage() {
  echo "Usage: $0 [OPTIONS]"
  echo "  --dev        Development mode (no minification)"
  echo "  --prod       Production build (default)"
  echo "  --server     Also build & start Node server"
  echo "  --clean      Remove dist/ before building"
  echo "  --check      Type-check only, no emit"
  echo "  --watch      Watch mode (dev only)"
  echo "  --install    Install dependencies first"
  echo "  --all        Full pipeline: install + build + server"
  exit 0
}

# ── Defaults ──────────────────────────────────────────────
MODE="prod"
RUN_SERVER=false
CLEAN=false
CHECK_ONLY=false
WATCH=false
DO_INSTALL=false

for arg in "$@"; do
  case $arg in
    --dev)     MODE="dev" ;;
    --prod)    MODE="prod" ;;
    --server)  RUN_SERVER=true ;;
    --clean)   CLEAN=true ;;
    --check)   CHECK_ONLY=true ;;
    --watch)   WATCH=true; MODE="dev" ;;
    --install) DO_INSTALL=true ;;
    --all)     DO_INSTALL=true; RUN_SERVER=true ;;
    --help|-h) usage ;;
    *) warn "Unknown argument: $arg" ;;
  esac
done

# ── Setup ─────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
banner
log "Build started at $(date)"
log "Mode: $MODE | Server: $RUN_SERVER | Clean: $CLEAN"

# ── Phase 1: Environment Check ────────────────────────────
phase "Environment Check"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found: $(command -v "$1")"
  else
    fail "$1 not found. Please install $1."
  fi
}

check_cmd node
check_cmd npm

NODE_VER=$(node -e "process.stdout.write(process.version)")
NPM_VER=$(npm --version)
log "Node: $NODE_VER | npm: $NPM_VER"

# Node >= 18 required
NODE_MAJOR=$(node -e "process.stdout.write(String(parseInt(process.version.slice(1))))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 18+ required. Found: $NODE_VER"
fi
ok "Node version OK"

# Check for TypeScript
if ! command -v tsc &>/dev/null && [ ! -f "$PROJECT_ROOT/node_modules/.bin/tsc" ]; then
  warn "TypeScript not found globally — will use local after install"
fi

# ── Phase 2: Install Dependencies ─────────────────────────
phase "Dependencies"

if [ "$DO_INSTALL" = true ] || [ ! -d "$PROJECT_ROOT/node_modules" ]; then
  log "Installing npm dependencies..."
  cd "$PROJECT_ROOT"
  npm install 2>&1 | tee -a "$LOG_FILE"
  ok "Dependencies installed"
else
  ok "node_modules present — skipping install (use --install to force)"
fi

TSC="$PROJECT_ROOT/node_modules/.bin/tsc"
VITE="$PROJECT_ROOT/node_modules/.bin/vite"

[ -f "$TSC" ]  || fail "tsc not found in node_modules/.bin"
[ -f "$VITE" ] || fail "vite not found in node_modules/.bin"

# ── Phase 3: Type Check ───────────────────────────────────
phase "Type Check"

cd "$PROJECT_ROOT"
log "Running TypeScript type checker..."
if "$TSC" --noEmit 2>&1 | tee -a "$LOG_FILE"; then
  ok "Type check passed"
else
  if [ "$MODE" = "prod" ]; then
    fail "Type errors found — aborting production build"
  else
    warn "Type errors found — continuing dev build"
  fi
fi

if [ "$CHECK_ONLY" = true ]; then
  ok "Check-only mode — exiting after type check"
  exit 0
fi

# ── Phase 4: Clean ────────────────────────────────────────
phase "Clean"

if [ "$CLEAN" = true ] && [ -d "$BUILD_DIR" ]; then
  log "Removing $BUILD_DIR..."
  rm -rf "$BUILD_DIR"
  ok "Cleaned dist/"
elif [ -d "$BUILD_DIR" ]; then
  log "dist/ exists — skipping clean (use --clean to force)"
fi

# ── Phase 5: Asset Scan ───────────────────────────────────
phase "Asset Scan"

# Recursively scan src for all .ts files and report
TS_FILES=$(find "$PROJECT_ROOT/src" -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
log "Found $TS_FILES TypeScript source files"
find "$PROJECT_ROOT/src" -name "*.ts" | sort | while read -r f; do
  LINES=$(wc -l < "$f")
  echo "  → $(realpath --relative-to="$PROJECT_ROOT" "$f") ($LINES lines)" >> "$LOG_FILE"
done
ok "Asset scan complete"

# ── Phase 6: Build ────────────────────────────────────────
phase "Vite Build"

cd "$PROJECT_ROOT"

if [ "$WATCH" = true ]; then
  log "Starting Vite in watch/dev mode (Ctrl+C to stop)..."
  "$VITE" --mode development
  exit 0
fi

if [ "$MODE" = "dev" ]; then
  log "Running development build (sourcemaps, no minification)..."
  "$VITE" build --mode development 2>&1 | tee -a "$LOG_FILE"
else
  log "Running production build (minified, tree-shaken)..."
  "$VITE" build --mode production 2>&1 | tee -a "$LOG_FILE"
fi

ok "Vite build complete"

# ── Phase 7: Server Build (optional) ─────────────────────
if [ "$RUN_SERVER" = true ]; then
  phase "Server Build"

  SERVER_DIST="$PROJECT_ROOT/server/dist"
  mkdir -p "$SERVER_DIST"

  log "Compiling server TypeScript..."
  "$TSC" --project "$SERVER_DIR/tsconfig.server.json" 2>&1 | tee -a "$LOG_FILE"
  ok "Server compiled"
fi

# ── Phase 8: Output Report ────────────────────────────────
phase "Build Report"

if [ -d "$BUILD_DIR" ]; then
  TOTAL_SIZE=$(du -sh "$BUILD_DIR" 2>/dev/null | cut -f1)
  FILE_COUNT=$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')
  log "Output: $BUILD_DIR"
  log "Total size: $TOTAL_SIZE | Files: $FILE_COUNT"

  # List JS chunks
  find "$BUILD_DIR" -name "*.js" | sort | while read -r f; do
    SIZE=$(du -sh "$f" | cut -f1)
    echo "  → $(basename "$f") [$SIZE]" | tee -a "$LOG_FILE"
  done
  ok "Build artifacts ready"
fi

echo -e "\n${GREEN}${BOLD}✓ Rucker '89 build complete — $(date)${RESET}"
echo -e "${CYAN}  Log: $LOG_FILE${RESET}\n"

# ── Phase 9: Launch Server (optional) ────────────────────
if [ "$RUN_SERVER" = true ]; then
  phase "Launch Server"
  log "Starting leaderboard server on port 3001..."
  cd "$SERVER_DIR"
  node dist/index.js &
  SERVER_PID=$!
  log "Server PID: $SERVER_PID"

  log "Launching Vite preview on port 4173..."
  cd "$PROJECT_ROOT"
  "$VITE" preview --port 4173 --host 0.0.0.0
fi
