#Requires -Version 5.1
<#
.SYNOPSIS
    Rucker '89: The Pattern — Full Recursive Build Script (Windows/PowerShell)
.DESCRIPTION
    Complete build pipeline for Fort Rucker Helicopter Simulator.
    Runs type checks, installs deps, compiles TypeScript, builds via Vite.
.PARAMETER Mode
    Build mode: 'dev' or 'prod' (default: prod)
.PARAMETER Server
    Also build and start the Node.js leaderboard server
.PARAMETER Clean
    Remove dist/ before building
.PARAMETER CheckOnly
    Run type-check only, no emit
.PARAMETER Watch
    Start in watch/dev mode (implies -Mode dev)
.PARAMETER Install
    Install npm dependencies before building
.PARAMETER All
    Full pipeline: Install + Build + Server
.EXAMPLE
    .\build.ps1 -All
.EXAMPLE
    .\build.ps1 -Mode dev -Watch
#>

[CmdletBinding()]
param(
    [ValidateSet('dev','prod')]
    [string]$Mode = 'prod',
    [switch]$Server,
    [switch]$Clean,
    [switch]$CheckOnly,
    [switch]$Watch,
    [switch]$Install,
    [switch]$All
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Paths ─────────────────────────────────────────────────
$ProjectRoot  = $PSScriptRoot
$BuildDir     = Join-Path $ProjectRoot 'dist'
$ServerDir    = Join-Path $ProjectRoot 'server'
$LogDir       = Join-Path $ProjectRoot 'logs'
$Timestamp    = (Get-Date -Format 'yyyyMMdd_HHmmss')
$LogFile      = Join-Path $LogDir "build_$Timestamp.log"
$NodeModBin   = Join-Path $ProjectRoot 'node_modules' '.bin'
$TscCmd       = Join-Path $NodeModBin 'tsc.cmd'
$ViteCmd      = Join-Path $NodeModBin 'vite.cmd'

if ($All) { $Install = $true; $Server = $true }
if ($Watch) { $Mode = 'dev' }

# ── Logging ───────────────────────────────────────────────
$null = New-Item -ItemType Directory -Force -Path $LogDir

function Write-Log {
    param([string]$Msg, [string]$Level = 'INFO')
    $ts   = (Get-Date -Format 'HH:mm:ss')
    $line = "[$ts][$Level] $Msg"
    switch ($Level) {
        'OK'   { Write-Host $line -ForegroundColor Green }
        'WARN' { Write-Host $line -ForegroundColor Yellow }
        'FAIL' { Write-Host $line -ForegroundColor Red }
        'PHASE'{ Write-Host "`n$line" -ForegroundColor Cyan }
        default{ Write-Host $line -ForegroundColor White }
    }
    Add-Content -Path $LogFile -Value $line
}

function Invoke-Phase {
    param([string]$Name)
    $script:PhaseNum = ($script:PhaseNum ?? 0) + 1
    Write-Log "══════════════ Phase $($script:PhaseNum): $Name ══════════════" -Level PHASE
}

function Exit-Fail {
    param([string]$Msg)
    Write-Log $Msg -Level FAIL
    exit 1
}

function Test-Command {
    param([string]$Name)
    if (Get-Command $Name -ErrorAction SilentlyContinue) {
        Write-Log "$Name found: $((Get-Command $Name).Source)" -Level OK
        return $true
    }
    return $false
}

# ── Banner ────────────────────────────────────────────────
Write-Host @"

  ██████╗ ██╗   ██╗ ██████╗██╗  ██╗███████╗██████╗     █████╗  █████╗ 
  ██╔══██╗██║   ██║██╔════╝██║ ██╔╝██╔════╝██╔══██╗   ██╔══██╗██╔══██╗
  ██████╔╝██║   ██║██║     █████╔╝ █████╗  ██████╔╝   ╚█████╔╝╚██████║
  ██╔══██╗██║   ██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗   ██╔══██╗ ╚═══██║
  ██║  ██║╚██████╔╝╚██████╗██║  ██╗███████╗██║  ██║   ╚█████╔╝ █████╔╝
  ╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝    ╚════╝  ╚════╝ 
                  T H E   P A T T E R N  |  Fort Rucker 1989
"@ -ForegroundColor Cyan

Write-Log "Build started: $(Get-Date) | Mode=$Mode | Server=$Server | Clean=$Clean"

# ── Phase 1: Environment ──────────────────────────────────
Invoke-Phase 'Environment Check'

if (-not (Test-Command 'node')) { Exit-Fail 'Node.js not found. Install from https://nodejs.org' }
if (-not (Test-Command 'npm'))  { Exit-Fail 'npm not found.' }

$nodeVer  = (node -e "process.stdout.write(process.version)")
$npmVer   = (npm --version)
$nodeMajor = [int]($nodeVer.TrimStart('v').Split('.')[0])
Write-Log "Node $nodeVer | npm $npmVer"

if ($nodeMajor -lt 18) { Exit-Fail "Node 18+ required. Found: $nodeVer" }
Write-Log 'Node version OK' -Level OK

# ── Phase 2: Dependencies ─────────────────────────────────
Invoke-Phase 'Dependencies'

$NeedInstall = $Install -or (-not (Test-Path (Join-Path $ProjectRoot 'node_modules')))
if ($NeedInstall) {
    Write-Log 'Installing npm dependencies...'
    Push-Location $ProjectRoot
    try {
        $result = & npm install 2>&1
        $result | ForEach-Object { Write-Log $_ }
        if ($LASTEXITCODE -ne 0) { Exit-Fail 'npm install failed' }
        Write-Log 'Dependencies installed' -Level OK
    } finally { Pop-Location }
} else {
    Write-Log 'node_modules present — skipping install (use -Install to force)' -Level OK
}

if (-not (Test-Path $TscCmd))  { Exit-Fail "tsc not found at: $TscCmd" }
if (-not (Test-Path $ViteCmd)) { Exit-Fail "vite not found at: $ViteCmd" }
Write-Log "tsc: $TscCmd" -Level OK
Write-Log "vite: $ViteCmd" -Level OK

# ── Phase 3: Type Check ───────────────────────────────────
Invoke-Phase 'TypeScript Type Check'

Push-Location $ProjectRoot
try {
    Write-Log 'Running tsc --noEmit...'
    $tscOut = & $TscCmd --noEmit 2>&1
    $tscOut | ForEach-Object { Add-Content $LogFile $_ }
    if ($LASTEXITCODE -ne 0) {
        $tscOut | ForEach-Object { Write-Log $_ -Level WARN }
        if ($Mode -eq 'prod') {
            Exit-Fail 'Type errors found — aborting production build'
        } else {
            Write-Log 'Type errors found — continuing dev build' -Level WARN
        }
    } else {
        Write-Log 'Type check passed' -Level OK
    }
} finally { Pop-Location }

if ($CheckOnly) {
    Write-Log 'CheckOnly mode — done' -Level OK
    exit 0
}

# ── Phase 4: Clean ────────────────────────────────────────
Invoke-Phase 'Clean'

if ($Clean -and (Test-Path $BuildDir)) {
    Write-Log "Removing $BuildDir..."
    Remove-Item -Recurse -Force $BuildDir
    Write-Log 'Cleaned dist/' -Level OK
} elseif (Test-Path $BuildDir) {
    Write-Log 'dist/ exists — skipping clean (use -Clean to force)'
}

# ── Phase 5: Asset Scan ───────────────────────────────────
Invoke-Phase 'Asset Scan'

$tsFiles = Get-ChildItem -Recurse -Path (Join-Path $ProjectRoot 'src') -Filter '*.ts' -ErrorAction SilentlyContinue
Write-Log "Found $($tsFiles.Count) TypeScript source files"
foreach ($f in ($tsFiles | Sort-Object FullName)) {
    $relPath = $f.FullName.Replace("$ProjectRoot\", '')
    $lines   = (Get-Content $f.FullName | Measure-Object -Line).Lines
    "  → $relPath ($lines lines)" | Tee-Object -Append -FilePath $LogFile | Out-Null
    Write-Host "  → $relPath ($lines lines)" -ForegroundColor DarkGray
}
Write-Log 'Asset scan complete' -Level OK

# ── Phase 6: Vite Build ───────────────────────────────────
Invoke-Phase 'Vite Build'

Push-Location $ProjectRoot
try {
    if ($Watch) {
        Write-Log 'Starting Vite dev server (Ctrl+C to stop)...'
        & $ViteCmd --mode development
        exit 0
    }

    $viteMode = if ($Mode -eq 'dev') { 'development' } else { 'production' }
    Write-Log "Building with Vite in $viteMode mode..."
    $viteOut = & $ViteCmd build --mode $viteMode 2>&1
    $viteOut | ForEach-Object {
        Add-Content $LogFile $_
        Write-Host $_ -ForegroundColor DarkGray
    }
    if ($LASTEXITCODE -ne 0) { Exit-Fail 'Vite build failed' }
    Write-Log 'Vite build complete' -Level OK
} finally { Pop-Location }

# ── Phase 7: Server Build ─────────────────────────────────
if ($Server) {
    Invoke-Phase 'Server Build'
    $ServerTsConfig = Join-Path $ServerDir 'tsconfig.server.json'
    if (-not (Test-Path $ServerTsConfig)) {
        Exit-Fail "Server tsconfig not found: $ServerTsConfig"
    }
    Write-Log 'Compiling server TypeScript...'
    $sOut = & $TscCmd --project $ServerTsConfig 2>&1
    $sOut | ForEach-Object { Add-Content $LogFile $_ }
    if ($LASTEXITCODE -ne 0) { Exit-Fail 'Server compile failed' }
    Write-Log 'Server compiled' -Level OK
}

# ── Phase 8: Build Report ─────────────────────────────────
Invoke-Phase 'Build Report'

if (Test-Path $BuildDir) {
    $allFiles  = Get-ChildItem -Recurse -File $BuildDir
    $totalSize = ($allFiles | Measure-Object -Property Length -Sum).Sum / 1KB
    Write-Log "Output: $BuildDir"
    Write-Log "Total: $([math]::Round($totalSize, 1)) KB | Files: $($allFiles.Count)"
    $allFiles | Where-Object { $_.Extension -eq '.js' } | Sort-Object Name | ForEach-Object {
        $kb = [math]::Round($_.Length / 1KB, 1)
        Write-Host "  → $($_.Name) [$kb KB]" -ForegroundColor DarkCyan
    }
    Write-Log 'Build artifacts ready' -Level OK
}

Write-Host "`n✓ Rucker '89 build complete — $(Get-Date)" -ForegroundColor Green
Write-Host "  Log: $LogFile`n" -ForegroundColor Cyan

# ── Phase 9: Launch ───────────────────────────────────────
if ($Server) {
    Invoke-Phase 'Launch Server'
    $serverEntry = Join-Path $ServerDir 'dist' 'index.js'
    if (Test-Path $serverEntry) {
        Write-Log 'Starting leaderboard server on port 3001...'
        Start-Process -NoNewWindow -FilePath 'node' -ArgumentList $serverEntry
    }
    Write-Log 'Launching Vite preview on port 4173...'
    Push-Location $ProjectRoot
    & $ViteCmd preview --port 4173 --host 0.0.0.0
    Pop-Location
}
