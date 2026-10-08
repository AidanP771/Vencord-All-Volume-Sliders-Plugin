/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { reapplyVolumes } from "./audio";
import { VolumeSettings } from "./components/VolumeSettings";
import { startPrank, stopPrank } from "./prank";

export const settings = definePluginSettings({
    masterVolume: {
        type: OptionType.SLIDER,
        description: "Master volume for all Discord sounds (multiplies every slider below)",
        markers: [0, 25, 50, 75, 100],
        default: 100,
        stickToMarkers: false,
        // Rendered by VolumeSettings (with a number box) instead of Vencord's default slider
        hidden: true,
        onChange: () => reapplyVolumes(),
    },
    ringtoneVolume: {
        type: OptionType.SLIDER,
        description: "Ringtone volume: applies to the incoming call ringtone and every ringtone variant (Beat, Halloween, seasonal, ...)",
        markers: [0, 25, 50, 75, 100],
        default: 100,
        stickToMarkers: false,
        // Rendered by VolumeSettings (with a number box) instead of Vencord's default slider
        hidden: true,
        onChange: () => reapplyVolumes(),
    },
    prankMode: {
        type: OptionType.BOOLEAN,
        description: "Prank mode: plays a random Discord sound every 5 seconds to 2 minutes. Turn this off to make it stop.",
        default: true,
        onChange: (enabled: boolean) => enabled ? startPrank() : stopPrank(),
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
