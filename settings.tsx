/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { reapplyVolumes } from "./audio";
import { VolumeSettings } from "./components/VolumeSettings";

export const settings = definePluginSettings({
    masterVolume: {
        type: OptionType.SLIDER,
        description: "Master volume for all Discord sounds (multiplies every slider below)",
        markers: [0, 25, 50, 75, 100],
        default: 100,
        stickToMarkers: false,
        onChange: () => reapplyVolumes(),
    },
    ringtoneVolume: {
        type: OptionType.SLIDER,
        description: "Ringtone volume: applies to the incoming call ringtone and every ringtone variant (Beat, Halloween, seasonal, ...)",
        markers: [0, 25, 50, 75, 100],
        default: 100,
        stickToMarkers: false,
        onChange: () => reapplyVolumes(),
    },
    showPanelButton: {
        type: OptionType.BOOLEAN,
        description: "Show a quick-access button next to Mute/Deafen that opens these sliders",
        default: true,
    },
    /** Per-sound volume in percent (0-100). Missing entries mean 100. */
    volumes: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, number>,
    },
    soundList: {
        type: OptionType.COMPONENT,
        component: () => <VolumeSettings />,
    },
});
