/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import definePlugin from "@utils/types";

import { getMultiplier, previewSound, reapplyVolumes, resolveOutputChannel, seenSounds } from "./audio";
import { openVolumeModal, VolumeSlidersPanelButton } from "./components/QuickAccess";
import { startPrank, stopPrank } from "./prank";
import { settings } from "./settings";

export default definePlugin({
    name: "AllVolumeSliders",
    description: "Individual volume sliders for every Discord sound: ringtone, call sounds, join/leave, messages, mute/deafen, streams and more",
    tags: ["Voice", "Notifications", "Customisation"],
    authors: [{ name: "Aidan", id: 0n }],
    settings,

    patches: [
        {
            // Discord's Sound class. Every "new Audio" volume it sets goes through
            // Math.min(<MediaEngineStore>.getOutputVolume()/100*this._volume, 1)
            find: "ensureAudio(){",
            replacement: [
                {
                    match: /(?=Math\.min\(\i\.\i\.getOutputVolume\(\)\/100)/g,
                    replace: "$self.getMultiplier(this)*"
                },
                {
                    // `sound.volume = x` sets the audio element directly, so scale that too
                    match: /(set volume\((\i)\)\{.{0,80}?\.then\(\i=>\i\.volume=)\2(?=\))/,
                    replace: "$1$self.getMultiplier(this)*$2"
                },
                {
                    // setSinkId(outputChannel===DEFAULT ? normalDevice : otherDevice): lets previews ask for the normal device
                    match: /this\.outputChannel===(\i\.\i\.DEFAULT)/,
                    replace: "$self.resolveOutputChannel(this.outputChannel,$1)===$1"
                }
            ]
        },
        {
            // Account panel (mute/deafen/settings buttons). Same spot GameActivityToggle uses.
            // Userplugins are patched after built-in plugins, so the lookahead skips over buttons
            // they've already inserted (by then "$self" is expanded to Vencord.Plugins.plugins["Name"])
            find: "#{intl::USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL}",
            replacement: {
                match: /children:\[(?=(?:Vencord\.Plugins\.plugins\["[^"]+"\]\.\w+\(arguments\[0\]\),)*.{0,25}?accountContainerRef)/,
                replace: "$&$self.VolumeSlidersPanelButton(arguments[0]),"
            }
        }
    ],

    toolboxActions: {
        "Open Sound Volumes": openVolumeModal,
    },

    VolumeSlidersPanelButton,
    getMultiplier,
    resolveOutputChannel,
    /** For debugging in the console: names of every sound played this session */
    seenSounds,
    /** For debugging in the console: previewSound("message1") logs which playback path was used */
    previewSound,

    start() {
        reapplyVolumes();
        if (settings.store.prankMode) startPrank();
    },

    stop() {
        stopPrank();
    },
});
