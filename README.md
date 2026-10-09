# AllVolumeSliders (Vencord userplugin)

Individual volume sliders for every sound Discord plays:

- **Ringtone**: one slider for the incoming-call ringtone *and* every variant (Beat, Halloween, seasonal…), plus per-variant overrides. It also works while a call is ringing.
- **Custom ringtone**: pick your own audio file (up to 15 MB) under the Ringtone slider. Two switches choose whether it replaces incoming ringtones (all of them, seasonal ones included), the outgoing dialing sound, or both. The file is stored on this PC only and isn't synced to other devices.
- **Call sounds**: outgoing "dialing" sound and other call sounds.
- **Join / Leave**: users joining, leaving or being moved, plus disconnect and reconnect.
- **Seasonal and themed sounds** (Halloween, Winter, and the ASMR/Bit/Bop/Ducky/Lo-fi message packs) follow the slider of the sound they replace. For example, Winter: Mute uses the Mute slider. Each one can still have its own value.
- **Messages, mute/deafen, push-to-talk, streams, activities** and anything else Discord ships. Unknown sounds are found automatically and listed under "Other".
- A **master volume** that scales everything, plus preview, mute, reset and search for each sound.
- **Stop all sounds**: one button stops every preview, plus any Discord sound that's playing right now (for example a ringtone). Voice chat isn't affected.
- **Type an exact value**: every slider has a number box next to it. Type 0–100 and press Enter.

- A **quick-access button** next to Mute/Deafen (bottom left). It opens all the sliders in a pop-up, so you don't have to dig through the plugin settings. You can hide it with the "Show a quick-access button" setting. If you use Vencord's Toolbox plugin, the sliders are also under **Open Sound Volumes** there.

Volumes go from 0 to 100% of Discord's normal level. Voice chat audio and the soundboard aren't affected, since Discord already has its own sliders for those.

## Install (one line, Windows)

Open **PowerShell** and paste:

```powershell
irm https://raw.githubusercontent.com/AidanP771/Vencord-All-Volume-Sliders-Plugin/main/install.ps1 | iex
```

The command installs Git, Node.js and pnpm if they're missing (via winget). It then builds Vencord from source into `%USERPROFILE%\Vencord` with this plugin included, closes Discord, and injects Vencord. When it asks which Discord to patch, pick yours. After that, start Discord, go to **Settings → Vencord → Plugins** and enable **AllVolumeSliders**.

**To update**, run the same command again. To use a different folder, set `$env:VENCORD_DIR = "D:\somewhere\Vencord"` first.

> Already using the normal Vencord installer? This replaces it with a from-source build. Your Vencord settings and plugins are kept.

### Testing the dev version

To try unreleased changes from the `dev` branch:

```powershell
$env:AVS_BRANCH="dev"; irm https://raw.githubusercontent.com/AidanP771/Vencord-All-Volume-Sliders-Plugin/dev/install.ps1 | iex
```

To switch back to the stable version, open a **new** PowerShell window and run the normal one-liner above.

## Manual install

Userplugins need Vencord **built from source**; the normal Vencord installer can't load them.

1. Install [Node.js](https://nodejs.org) (LTS), [git](https://git-scm.com), and pnpm (`npm i -g pnpm`).
2. Build Vencord from source:
   ```sh
   git clone https://github.com/Vendicated/Vencord
   cd Vencord
   pnpm i
   ```
3. Add this plugin:
   ```sh
   cd src/userplugins        # create the folder if it doesn't exist
   git clone <this-repo-url> allVolumeSliders
   cd ../..
   ```
4. Build and inject it into Discord:
   ```sh
   pnpm build
   pnpm inject
   ```
   Pick your Discord install when asked, then fully restart Discord.
5. In Discord, go to **Settings → Vencord → Plugins → AllVolumeSliders**, enable it, and restart Discord when it asks. Click the cog to open the sliders.

**Update:** run `git pull` inside `src/userplugins/allVolumeSliders` (and in `Vencord` itself), then `pnpm build` and restart Discord.

### Developing (symlink instead of clone)

From an admin Command Prompt:
```bat
mklink /D C:\path\to\Vencord\src\userplugins\allVolumeSliders D:\Code\Vencord-All-Volume-Sliders-Plugin
```
Leave `pnpm build --watch` running, then press **Ctrl+R** in Discord to reload after each change.

## Testing checklist

A second account (on your phone or in a browser) helps a lot here.

- [ ] Set a slider to 0% or 20% and press ▶: the preview should be silent or quieter. (Preview needs Discord to have played any sound once since startup; if it doesn't work, toggle mute once first.)
- [ ] **Join/leave**: the second account joins and leaves your voice channel.
- [ ] **Dialing**: you call the second account (`call_calling`).
- [ ] **Ringtone**: the second account calls you. Drag the Ringtone slider while it rings; the volume should change straight away.
- [ ] **Messages**: the second account DMs you.
- [ ] **Mute/deafen**: toggle them in a voice channel.
- [ ] **Quick access**: the sliders button appears next to Mute/Deafen and opens the pop-up. Changes made there show up in the plugin settings too, and turning the setting off hides the button.
- [ ] The master slider scales everything, and your settings survive a full Discord restart.

## Troubleshooting

Open DevTools with **Ctrl+Shift+I**.

- The console shows `Patch by AllVolumeSliders had no effect`: a Discord update changed the sound code, so the patch in `index.ts` needs updating.
- To list every sound that has played this session, run `Vencord.Plugins.plugins.AllVolumeSliders.seenSounds` in the console.
- If Vencord's built-in **NotificationVolume** plugin is also on, the two volumes stack (they multiply together). Turn one off if sounds seem too quiet.

## How it works

Every sound in Discord goes through one internal `Sound` class, which sets `audio.volume = Math.min(outputVolume/100 * volume, 1)`. The plugin patches that expression to multiply by `master × ringtone (for ringtones) × per-sound`. This is the same hook point Vencord's built-in NotificationVolume plugin uses. Sounds that are already playing (like a ringing call) are tracked, so slider changes apply to them immediately.
