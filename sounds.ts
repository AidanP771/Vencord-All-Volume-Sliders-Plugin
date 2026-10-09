/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Category =
    | "Messages"
    | "Join / Leave"
    | "Calls"
    | "Ringtone"
    | "Voice"
    | "Streams"
    | "Activities"
    | "Other";

/** Display order of the groups in the settings UI */
export const CATEGORIES: Category[] = [
    "Ringtone",
    "Calls",
    "Join / Leave",
    "Messages",
    "Voice",
    "Streams",
    "Activities",
    "Other",
];

export interface SoundInfo {
    name: string;
    label: string;
    category: Category;
    /** For themed/sound-pack variants (e.g. winter_mute): the sound whose slider it follows */
    base?: string;
}

/**
 * Base sounds Discord ships (names from its sound bundle). Themed variants such as
 * winter_mute or halloween_call_ringing are derived from these by getSoundInfo().
 */
const KNOWN: SoundInfo[] = [
    // Ringtone (incoming call). Every ringtone, themed or not, is matched by isRingtone().
    { name: "call_ringing", label: "Incoming call ringtone", category: "Ringtone" },
    { name: "call_ringing_beat", label: "Ringtone: Beat", category: "Ringtone" },
    { name: "call_ringing_snow_halation", label: "Ringtone: Snow Halation", category: "Ringtone" },
    { name: "call_ringing_snowsgiving", label: "Ringtone: Snowsgiving", category: "Ringtone" },

    // Calls
    { name: "call_calling", label: "Outgoing call (dialing)", category: "Calls" },

    // Join / Leave
    { name: "user_join", label: "User joined your channel", category: "Join / Leave" },
    { name: "user_leave", label: "User left your channel", category: "Join / Leave" },
    { name: "user_moved", label: "User moved / you were moved", category: "Join / Leave" },
    { name: "disconnect", label: "Disconnected", category: "Join / Leave" },
    { name: "reconnect", label: "Reconnected", category: "Join / Leave" },

    // Messages
    { name: "message1", label: "Message notification", category: "Messages" },
    { name: "message2", label: "Message notification (alt 2)", category: "Messages" },
    { name: "message3", label: "Message notification (alt 3)", category: "Messages" },
    { name: "mention1", label: "Mention", category: "Messages" },
    { name: "mention2", label: "Mention (alt 2)", category: "Messages" },
    { name: "mention3", label: "Mention (alt 3)", category: "Messages" },

    // Voice
    { name: "mute", label: "Mute", category: "Voice" },
    { name: "unmute", label: "Unmute", category: "Voice" },
    { name: "deafen", label: "Deafen", category: "Voice" },
    { name: "undeafen", label: "Undeafen", category: "Voice" },
    { name: "ptt_start", label: "Push-to-talk start", category: "Voice" },
    { name: "ptt_stop", label: "Push-to-talk stop", category: "Voice" },
    { name: "camera_on", label: "Camera on", category: "Voice" },
    { name: "camera_off", label: "Camera off", category: "Voice" },
    { name: "stage_waiting", label: "Stage waiting", category: "Voice" },

    // Streams
    { name: "stream_started", label: "Stream started", category: "Streams" },
    { name: "stream_ended", label: "Stream ended", category: "Streams" },
    { name: "stream_user_joined", label: "Viewer joined stream", category: "Streams" },
    { name: "stream_user_left", label: "Viewer left stream", category: "Streams" },

    // Activities
    { name: "activity_launch", label: "Activity launched", category: "Activities" },
    { name: "activity_end", label: "Activity ended", category: "Activities" },
    { name: "activity_user_join", label: "User joined activity", category: "Activities" },
    { name: "activity_user_left", label: "User left activity", category: "Activities" },

    // Other
    { name: "clip_save", label: "Clip saved", category: "Other" },
    { name: "clip_error", label: "Clip failed", category: "Other" },
];

const KNOWN_BY_NAME = new Map(KNOWN.map(s => [s.name, s]));

export const KNOWN_SOUND_NAMES = KNOWN.map(s => s.name);

/** Seasonal themes and message sound packs Discord prefixes onto a base sound name (e.g. winter_mute, lofi_message1) */
const VARIANT_PREFIXES: Record<string, string> = {
    halloween: "Halloween",
    winter: "Winter",
    asmr: "ASMR",
    bit: "Bit",
    bop: "Bop",
    ducky: "Ducky",
    lofi: "Lo-fi",
};

/** Misspelled file names Discord actually ships (halloween_defean.mp3) */
const TYPO_ALIASES: Record<string, string> = {
    defean: "deafen",
    undefean: "undeafen",
};

/** For a themed/sound-pack variant, its theme and the base sound it's a version of */
export function parseVariant(name: string): { theme: string; base: string; } | undefined {
    const match = /^([a-z]+)_(.+)$/.exec(name);
    if (!match || !Object.hasOwn(VARIANT_PREFIXES, match[1])) return undefined;

    const rest = match[2];
    return { theme: VARIANT_PREFIXES[match[1]], base: TYPO_ALIASES[rest] ?? rest };
}

/** The sound whose slider this one follows: itself, or the base of a themed variant */
export function getBaseSound(name: string) {
    return parseVariant(name)?.base ?? name;
}

/** Any incoming-call ringtone: call_ringing, call_ringing_beat, halloween_call_ringing, winter_call_ringing, ... */
export function isRingtone(name: string) {
    const base = getBaseSound(name);
    return base === "call_ringing" || base.startsWith("call_ringing_");
}

function prettify(name: string) {
    return name.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Label and group for any sound name, including ones we have no hardcoded entry for */
export function getSoundInfo(name: string): SoundInfo {
    const known = KNOWN_BY_NAME.get(name);
    if (known) return known;

    const variant = parseVariant(name);
    if (variant) {
        const baseInfo = getSoundInfo(variant.base);
        return { name, label: `${variant.theme}: ${baseInfo.label}`, category: baseInfo.category, base: variant.base };
    }

    if (isRingtone(name))
        return { name, label: `Ringtone: ${prettify(name.slice("call_ringing_".length))}`, category: "Ringtone" };
    if (name.startsWith("call_")) return { name, label: prettify(name), category: "Calls" };
    if (name.startsWith("stream_")) return { name, label: prettify(name), category: "Streams" };
    if (name.startsWith("activity_")) return { name, label: prettify(name), category: "Activities" };
    if (/^(message|mention)\d*$/.test(name)) return { name, label: prettify(name), category: "Messages" };

    return { name, label: prettify(name), category: "Other" };
}

/** Sort key so each base sound comes first, followed by its themed variants */
export function compareSounds(a: SoundInfo, b: SoundInfo) {
    const key = (info: SoundInfo) => {
        const base = info.base ?? info.name;
        const index = KNOWN_SOUND_NAMES.indexOf(base);
        return [index === -1 ? Infinity : index, base, info.base ? 1 : 0, info.name] as const;
    };
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
    }
    return 0;
}
