/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import definePlugin from "@utils/types";

import { getMultiplier, reapplyVolumes, seenSounds } from "./audio";
import { openVolumeModal, VolumeSlidersPanelButton } from "./components/QuickAccess";
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
            replacement: {
                match: /(?=Math\.min\(\i\.\i\.getOutputVolume\(\)\/100)/g,
                replace: "$self.getMultiplier(this)*"
            }
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
    /** For debugging in the console: names of every sound played this session */
    seenSounds,

    start() {
        reapplyVolumes();
    },
});
