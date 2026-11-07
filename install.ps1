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
        # esbuild follows the link to the real folder, which is outside Vencord, so Vencord's
        # import aliases (@webpack, @components, ...) don't apply there. A tsconfig.json next to
        # the plugin that extends Vencord's brings them back. It's git-ignored.
        $target = @((Get-Item $dir -Force).Target)[0]
        $tsconfig = Join-Path $target "tsconfig.json"
        if ($target -and -not (Test-Path $tsconfig)) {
            $base = (Join-Path $VencordDir "tsconfig.json").Replace("\", "/")
            Set-Content -Path $tsconfig -Encoding ascii -Value "{ `"extends`": `"$base`" }"
            Write-Host "Created $tsconfig so the linked plugin can use Vencord's imports." -ForegroundColor Yellow
        }
        return
    }
    if (Test-Path (Join-Path $dir ".git")) {
        git -C $dir fetch --depth 1 origin $branch
        if ($LASTEXITCODE -ne 0) { throw "Couldn't fetch branch '$branch' of the plugin" }
        # Local edits would block the checkout. Stash them so they can be recovered
        # with `git stash pop` instead of being thrown away.
        if (git -C $dir status --porcelain) {
            Write-Host "The plugin folder has local edits. Saving them with 'git stash' in $dir" -ForegroundColor Yellow
            git -C $dir stash push --include-untracked -m "AllVolumeSliders installer: local edits before update"
            if ($LASTEXITCODE -ne 0) { throw "Couldn't stash local edits in $dir" }
        }
        git -C $dir checkout -B $branch FETCH_HEAD
    } else {
        git clone --depth 1 --branch $branch $url $dir
    }
    if ($LASTEXITCODE -ne 0) { throw "git failed for the plugin (branch '$branch')" }
}

function Test-DiscordPatched($vencordDir) {
    # True if the newest app-* folder of any Discord install already loads this Vencord build.
    # The injector writes a tiny app.asar stub that require()s <VencordDir>\dist\patcher.js.
    $needle = (Join-Path $vencordDir "dist\patcher.js").Replace("\", "\\")
    foreach ($name in "Discord", "DiscordPTB", "DiscordCanary") {
        # Strict match: skips half-installed folders like ".app-1.0.9267.installing"
        $app = Get-ChildItem (Join-Path $env:LOCALAPPDATA $name) -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^app-\d+(\.\d+){1,3}$' } |
            Sort-Object { [version]($_.Name -replace '^app-', '') } -Descending | Select-Object -First 1
        if (-not $app) { continue }
        $asar = Join-Path $app.FullName "resources\app.asar"
        if ((Test-Path $asar) -and (Get-Item $asar).Length -lt 4096) {
            $text = [IO.File]::ReadAllText($asar)
            if ($text.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
        }
    }
    return $false
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
    $pluginSkipped = $false
    if ($LASTEXITCODE -ne 0) {
        # Usually a Vencord update changed an API the plugin uses. A failed build leaves the
        # previous (now outdated) Vencord in dist\, which can crash a freshly updated Discord.
        # So build Vencord without the plugin rather than stopping here.
        if (-not (Test-Path $PluginDir)) { throw "Build failed" }
        Write-Host "`nThe build failed, most likely because of AllVolumeSliders. Building Vencord without it so Discord still works." -ForegroundColor Yellow
        $parked = Join-Path $env:TEMP ("allVolumeSliders-" + [guid]::NewGuid().ToString("N"))
        Move-Item $PluginDir $parked
        try {
            pnpm build
            if ($LASTEXITCODE -ne 0) { throw "Build failed even without AllVolumeSliders, so the problem is in Vencord itself" }
        } finally {
            Move-Item $parked $PluginDir
        }
        $pluginSkipped = $true
    }

    Step "Closing Discord"
    Get-Process Discord, DiscordPTB, DiscordCanary -ErrorAction SilentlyContinue | Stop-Process -Force

    if (Test-DiscordPatched $VencordDir) {
        Step "Discord already loads Vencord from $VencordDir, skipping injection"
    } else {
        Step "Injecting into Discord (pick your Discord install when asked)"
        pnpm inject
        if ($LASTEXITCODE -ne 0) { throw "Injecting into Discord failed" }
    }
} finally {
    Pop-Location
}

if ($pluginSkipped) {
    Write-Host "`nVencord is updated, but AllVolumeSliders is NOT included this time because it doesn't build with the latest Vencord." -ForegroundColor Yellow
    Write-Host "Discord will work normally without the sliders. Run the same command again later, once the plugin has been updated." -ForegroundColor Yellow
} else {
    Write-Host "`nDone! Start Discord, then go to Settings > Vencord > Plugins and enable AllVolumeSliders." -ForegroundColor Green
    Write-Host "Run the same command again any time to update." -ForegroundColor Green
}
