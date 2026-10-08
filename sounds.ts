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
}

/**
 * Sounds we know about ahead of time. Anything else Discord ships (found by
 * enumerating its sound files or seen while playing) is added under "Other".
 */
const KNOWN: SoundInfo[] = [
    // Ringtone (incoming call). Every call_ringing_* variant is matched by isRingtone().
    { name: "call_ringing", label: "Incoming call ringtone (default)", category: "Ringtone" },
    { name: "call_ringing_beat", label: "Ringtone variant: Beat", category: "Ringtone" },
    { name: "call_ringing_halloween", label: "Ringtone variant: Halloween", category: "Ringtone" },
    { name: "call_ringing_snow_halation", label: "Ringtone variant: Snow Halation", category: "Ringtone" },

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

    // Voice
    { name: "mute", label: "Mute", category: "Voice" },
    { name: "unmute", label: "Unmute", category: "Voice" },
    { name: "deafen", label: "Deafen", category: "Voice" },
    { name: "undeafen", label: "Undeafen", category: "Voice" },
    { name: "ptt_start", label: "Push-to-talk start", category: "Voice" },
    { name: "ptt_stop", label: "Push-to-talk stop", category: "Voice" },
    { name: "invited_to_speak", label: "Invited to speak (stage)", category: "Voice" },

    // Streams
    { name: "stream_started", label: "Stream started", category: "Streams" },
    { name: "stream_ended", label: "Stream ended", category: "Streams" },
    { name: "stream_user_joined", label: "Viewer joined stream", category: "Streams" },
    { name: "stream_user_left", label: "Viewer left stream", category: "Streams" },

    // Activities
    { name: "activity_start", label: "Activity started", category: "Activities" },
    { name: "activity_end", label: "Activity ended", category: "Activities" },
    { name: "activity_user_join", label: "User joined activity", category: "Activities" },
    { name: "activity_user_left", label: "User left activity", category: "Activities" },
];

const KNOWN_BY_NAME = new Map(KNOWN.map(s => [s.name, s]));

export function isRingtone(name: string) {
    return name === "call_ringing" || name.startsWith("call_ringing_");
}

function prettify(name: string) {
    return name.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Best-guess info for a sound name we have no hardcoded entry for */
export function getSoundInfo(name: string): SoundInfo {
    const known = KNOWN_BY_NAME.get(name);
    if (known) return known;

    if (isRingtone(name))
        return { name, label: `Ringtone variant: ${prettify(name.slice("call_ringing_".length))}`, category: "Ringtone" };
    if (name.startsWith("call_")) return { name, label: prettify(name), category: "Calls" };
    if (name.startsWith("stream_")) return { name, label: prettify(name), category: "Streams" };
    if (name.startsWith("activity_")) return { name, label: prettify(name), category: "Activities" };
    if (/^message\d*$/.test(name)) return { name, label: prettify(name), category: "Messages" };

    return { name, label: prettify(name), category: "Other" };
}

export const KNOWN_SOUND_NAMES = KNOWN.map(s => s.name);
