# AllVolumeSliders one-line installer / updater for Windows.
#
#   irm https://raw.githubusercontent.com/AidanP771/Vencord-All-Volume-Sliders-Plugin/main/install.ps1 | iex
#
# Dev/testing build (installs the plugin from the dev branch):
#
#   $env:AVS_BRANCH="dev"; irm https://raw.githubusercontent.com/AidanP771/Vencord-All-Volume-Sliders-Plugin/dev/install.ps1 | iex
#
# Builds Vencord from source with this plugin included, then injects it into Discord.
# Run the same command again any time to update. To go back to the stable version,
# run the main command in a new PowerShell window.

$ErrorActionPreference = "Stop"

$PluginRepo = "https://github.com/AidanP771/Vencord-All-Volume-Sliders-Plugin"
$PluginBranch = if ($env:AVS_BRANCH) { $env:AVS_BRANCH } else { "main" }
$VencordRepo = "https://github.com/Vendicated/Vencord"
$VencordDir = if ($env:VENCORD_DIR) { $env:VENCORD_DIR } else { Join-Path $env:USERPROFILE "Vencord" }
$PluginDir = Join-Path $VencordDir "src\userplugins\allVolumeSliders"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
}

function Ensure-Tool($cmd, $wingetId, $name) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) { return }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "$name is not installed and winget isn't available. Install $name manually, then re-run."
    }
    Step "Installing $name"
    winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements
    Refresh-Path
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$name was installed but isn't on PATH yet. Open a new PowerShell window and re-run."
    }
}

function Sync-Repo($url, $dir) {
    if (Test-Path (Join-Path $dir ".git")) {
        git -C $dir pull --ff-only
    } else {
        git clone --depth 1 $url $dir
    }
    if ($LASTEXITCODE -ne 0) { throw "git failed for $url" }
}

function Sync-Plugin($url, $dir, $branch) {
    # A symlinked plugin folder is a dev checkout; never touch it
    if ((Test-Path $dir) -and ((Get-Item $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        Write-Host "Plugin folder is a symlink (dev setup), leaving it as-is." -ForegroundColor Yellow
        return
    }
    if (Test-Path (Join-Path $dir ".git")) {
        git -C $dir fetch --depth 1 origin $branch
        if ($LASTEXITCODE -ne 0) { throw "Couldn't fetch branch '$branch' of the plugin" }
        # Fails safely (instead of discarding anything) if the folder has local edits
        git -C $dir checkout -B $branch FETCH_HEAD
    } else {
        git clone --depth 1 --branch $branch $url $dir
    }
    if ($LASTEXITCODE -ne 0) { throw "git failed for the plugin (branch '$branch')" }
}

Ensure-Tool git "Git.Git" "Git"
Ensure-Tool node "OpenJS.NodeJS.LTS" "Node.js"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Step "Installing pnpm"
    npm install -g pnpm
    Refresh-Path
}

Step "Getting Vencord source in $VencordDir"
Sync-Repo $VencordRepo $VencordDir

Step "Getting AllVolumeSliders ($PluginBranch branch)"
New-Item -ItemType Directory -Force (Split-Path $PluginDir) | Out-Null
Sync-Plugin $PluginRepo $PluginDir $PluginBranch

Push-Location $VencordDir
try {
    Step "Installing dependencies"
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

    Step "Building Vencord"
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }

    Step "Closing Discord"
    Get-Process Discord, DiscordPTB, DiscordCanary -ErrorAction SilentlyContinue | Stop-Process -Force

    Step "Injecting into Discord (pick your Discord install when asked)"
    pnpm inject
} finally {
    Pop-Location
}

Write-Host "`nDone! Start Discord, then go to Settings > Vencord > Plugins and enable AllVolumeSliders." -ForegroundColor Green
Write-Host "Run the same command again any time to update." -ForegroundColor Green
