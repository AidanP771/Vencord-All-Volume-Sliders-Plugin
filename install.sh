#!/bin/bash
# AllVolumeSliders one-line installer / updater for macOS.
#
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/AidanP771/Vencord-All-Volume-Sliders-Plugin/main/install.sh)"
#
# Dev/testing build (installs the plugin from the dev branch):
#
#   AVS_BRANCH=dev /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/AidanP771/Vencord-All-Volume-Sliders-Plugin/dev/install.sh)"
#
# Builds Vencord from source with this plugin included, then injects it into Discord.
# Run the same command again any time to update (Discord updates on macOS remove
# Vencord, and running this again puts it back).
#
# Written for the bash 3.2 that ships with macOS.

set -euo pipefail

PLUGIN_REPO="https://github.com/AidanP771/Vencord-All-Volume-Sliders-Plugin"
PLUGIN_BRANCH="${AVS_BRANCH:-main}"
VENCORD_REPO="https://github.com/Vendicated/Vencord"
VENCORD_DIR="${VENCORD_DIR:-$HOME/Vencord}"
NODE_DIR="$HOME/.avs-node"      # Only used if Node.js has to be downloaded
NODE_MAJOR=24                   # LTS line used for that download

step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(uname -s)" = "Darwin" ] || die "This installer is for macOS. On Windows use install.ps1 (see the README)."

# Absolute path without a trailing slash, so it matches what the injector writes
case "$VENCORD_DIR" in /*) ;; *) VENCORD_DIR="$PWD/$VENCORD_DIR" ;; esac
VENCORD_DIR="${VENCORD_DIR%/}"
PLUGIN_DIR="$VENCORD_DIR/src/userplugins/allVolumeSliders"

# Programs that ask questions (pnpm inject) need the keyboard, even when this
# script was piped in with `curl | bash`.
TTY_IN=/dev/stdin
if [ ! -t 0 ] && [ -r /dev/tty ]; then TTY_IN=/dev/tty; fi

# ---------------------------------------------------------------- tools

ensure_git() {
    # /usr/bin/git is only a stub until the Xcode Command Line Tools are installed
    if xcode-select -p >/dev/null 2>&1 && have git; then return; fi
    if have git && [ "$(command -v git)" != "/usr/bin/git" ]; then return; fi
    step "Installing the Xcode Command Line Tools (for git)"
    xcode-select --install >/dev/null 2>&1 || true
    die "A window should have opened asking to install the Command Line Tools. Finish that, then run this command again."
}

install_node_local() {
    local arch base file sums
    case "$(uname -m)" in
        arm64) arch=arm64 ;;
        x86_64) arch=x64 ;;
        *) die "Unsupported CPU: $(uname -m)" ;;
    esac
    base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
    sums="$(curl -fsSL "$base/SHASUMS256.txt")" || die "Couldn't reach nodejs.org"
    file="$(printf '%s\n' "$sums" | awk -v a="darwin-$arch.tar.gz" '$2 ~ a"$" { print $2; exit }')"
    [ -n "$file" ] || die "Couldn't find a Node.js download for darwin-$arch"

    step "Downloading Node.js ($file) to $NODE_DIR"
    local tmp
    tmp="$(mktemp -d)"
    curl -fL --progress-bar "$base/$file" -o "$tmp/$file" || die "Downloading Node.js failed"
    (cd "$tmp" && printf '%s\n' "$sums" | grep "  $file\$" | shasum -a 256 -c - >/dev/null) \
        || die "The Node.js download didn't match its checksum"
    rm -rf "$NODE_DIR"
    mkdir -p "$NODE_DIR"
    tar -xzf "$tmp/$file" -C "$NODE_DIR" --strip-components 1
    rm -rf "$tmp"
}

ensure_node() {
    # A copy downloaded by an earlier run
    if [ -x "$NODE_DIR/bin/node" ]; then export PATH="$NODE_DIR/bin:$PATH"; fi
    if have node; then return; fi
    if have brew; then
        step "Installing Node.js (Homebrew)"
        brew install node
    else
        install_node_local
        export PATH="$NODE_DIR/bin:$PATH"
    fi
    have node || die "Node.js was installed but can't be found. Open a new Terminal window and run this again."
}

ensure_pnpm() {
    if [ -x "$NODE_DIR/bin/pnpm" ]; then export PATH="$NODE_DIR/bin:$PATH"; fi
    if have pnpm; then return; fi
    step "Installing pnpm"
    # Homebrew's and our own Node can install globally; a Node from the official
    # .pkg installer can't without sudo, so fall back to our own folder.
    if ! npm install -g pnpm; then
        warn "Couldn't install pnpm globally, installing it to $NODE_DIR instead."
        npm install -g pnpm --prefix "$NODE_DIR" || die "Installing pnpm failed"
        export PATH="$NODE_DIR/bin:$PATH"
    fi
    hash -r
    have pnpm || die "pnpm was installed but can't be found. Open a new Terminal window and run this again."
}

# ---------------------------------------------------------------- git

sync_repo() { # url dir
    if [ -d "$2/.git" ]; then
        git -C "$2" pull --ff-only || die "git pull failed in $2"
    else
        git clone --depth 1 "$1" "$2" || die "git clone failed for $1"
    fi
}

sync_plugin() { # url dir branch
    local url="$1" dir="$2" branch="$3"
    # A symlinked plugin folder is a dev checkout; never touch it
    if [ -L "$dir" ]; then
        warn "Plugin folder is a symlink (dev setup), leaving it as-is."
        # esbuild follows the link to the real folder, which is outside Vencord, so Vencord's
        # import aliases (@webpack, @components, ...) don't apply there. A tsconfig.json next to
        # the plugin that extends Vencord's brings them back. It's git-ignored.
        local target
        target="$(cd "$dir" && pwd -P)"
        if [ -n "$target" ] && [ ! -e "$target/tsconfig.json" ]; then
            printf '{ "extends": "%s" }\n' "$VENCORD_DIR/tsconfig.json" > "$target/tsconfig.json"
            warn "Created $target/tsconfig.json so the linked plugin can use Vencord's imports."
        fi
        return
    fi
    if [ -d "$dir/.git" ]; then
        git -C "$dir" fetch --depth 1 origin "$branch" || die "Couldn't fetch branch '$branch' of the plugin"
        # Local edits would block the checkout. Stash them so they can be recovered
        # with `git stash pop` instead of being thrown away.
        if [ -n "$(git -C "$dir" status --porcelain)" ]; then
            warn "The plugin folder has local edits. Saving them with 'git stash' in $dir"
            git -C "$dir" stash push --include-untracked -m "AllVolumeSliders installer: local edits before update" \
                || die "Couldn't stash local edits in $dir"
        fi
        git -C "$dir" checkout -B "$branch" FETCH_HEAD || die "git checkout failed for the plugin (branch '$branch')"
    else
        git clone --depth 1 --branch "$branch" "$url" "$dir" || die "git clone failed for the plugin (branch '$branch')"
    fi
}

# ---------------------------------------------------------------- Discord

DISCORD_APPS="Discord|Discord PTB|Discord Canary"

discord_patched() {
    # True if any Discord install already loads this Vencord build. The injector replaces
    # app.asar with a tiny stub that require()s <VencordDir>/dist/patcher.js.
    local needle="$VENCORD_DIR/dist/patcher.js" root name asar size
    local IFS='|'
    for root in "/Applications" "$HOME/Applications"; do
        for name in $DISCORD_APPS; do
            asar="$root/$name.app/Contents/Resources/app.asar"
            [ -f "$asar" ] || continue
            size="$(stat -f %z "$asar" 2>/dev/null || echo 999999)"
            if [ "$size" -lt 4096 ] && grep -qF "$needle" "$asar"; then return 0; fi
        done
    done
    return 1
}

close_discord() {
    local name
    local IFS='|'
    for name in $DISCORD_APPS; do
        if pgrep -x "$name" >/dev/null 2>&1; then
            osascript -e "quit app \"$name\"" >/dev/null 2>&1 || true
        fi
    done
    # Give it a moment to quit, then force anything left
    local i=0
    while [ $i -lt 10 ]; do
        local running=0
        for name in $DISCORD_APPS; do pgrep -x "$name" >/dev/null 2>&1 && running=1; done
        [ $running -eq 0 ] && return
        sleep 0.5
        i=$((i + 1))
    done
    for name in $DISCORD_APPS; do pkill -9 -x "$name" >/dev/null 2>&1 || true; done
}

# ---------------------------------------------------------------- main

ensure_git
ensure_node
ensure_pnpm

step "Getting Vencord source in $VENCORD_DIR"
mkdir -p "$(dirname "$VENCORD_DIR")"
sync_repo "$VENCORD_REPO" "$VENCORD_DIR"

step "Getting AllVolumeSliders ($PLUGIN_BRANCH branch)"
mkdir -p "$(dirname "$PLUGIN_DIR")"
sync_plugin "$PLUGIN_REPO" "$PLUGIN_DIR" "$PLUGIN_BRANCH"

cd "$VENCORD_DIR"

step "Installing dependencies"
pnpm install --frozen-lockfile || die "pnpm install failed"

step "Building Vencord"
plugin_skipped=0
PARKED=""
restore_plugin() {
    if [ -n "$PARKED" ] && [ -e "$PARKED/allVolumeSliders" ]; then
        mv "$PARKED/allVolumeSliders" "$PLUGIN_DIR"
        rmdir "$PARKED" 2>/dev/null || true
    fi
    PARKED=""
}
if ! pnpm build; then
    # Usually a Vencord update changed an API the plugin uses. A failed build leaves the
    # previous (now outdated) Vencord in dist/, which can crash a freshly updated Discord.
    # So build Vencord without the plugin rather than stopping here.
    [ -e "$PLUGIN_DIR" ] || die "Build failed"
    warn ""
    warn "The build failed, most likely because of AllVolumeSliders. Building Vencord without it so Discord still works."
    PARKED="$(mktemp -d)"
    trap restore_plugin EXIT
    mv "$PLUGIN_DIR" "$PARKED/allVolumeSliders"
    pnpm build || die "Build failed even without AllVolumeSliders, so the problem is in Vencord itself"
    restore_plugin
    trap - EXIT
    plugin_skipped=1
fi

step "Closing Discord"
close_discord

if discord_patched; then
    step "Discord already loads Vencord from $VENCORD_DIR, skipping injection"
else
    step "Injecting into Discord (pick your Discord install when asked)"
    pnpm inject < "$TTY_IN" || true
    # The injector can fail and still exit 0, so check the result ourselves
    if ! discord_patched; then
        printf '\n'
        warn "Vencord doesn't seem to be injected into Discord."
        warn "The usual cause: macOS blocks Terminal from changing apps in /Applications."
        warn "Open System Settings > Privacy & Security > App Management (or Full Disk Access),"
        warn "turn it on for your terminal app (Terminal, iTerm, ...), then run this command again."
        warn "(If your Discord is somewhere other than /Applications or ~/Applications and the injector"
        warn "said it succeeded, this check just couldn't find it and you can ignore this.)"
        exit 1
    fi
fi

printf '\n'
if [ $plugin_skipped -eq 1 ]; then
    warn "Vencord is updated, but AllVolumeSliders is NOT included this time because it doesn't build with the latest Vencord."
    warn "Discord will work normally without the sliders. Run the same command again later, once the plugin has been updated."
else
    ok "Done! Start Discord, then go to Settings > Vencord > Plugins and enable AllVolumeSliders."
    ok "Run the same command again any time to update."
fi
