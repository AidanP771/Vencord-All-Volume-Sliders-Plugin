/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { cache } from "@webpack";
import { MediaEngineStore } from "@webpack/common";

import { settings } from "./settings";
import { isRingtone, KNOWN_SOUND_NAMES } from "./sounds";

export const logger = new Logger("AllVolumeSliders");

/**
 * Shape of Discord's internal Sound class instances (minified, so only the
 * fields we rely on). `_audio` is a Promise<HTMLAudioElement> once created.
 */
interface DiscordSound {
    name: string;
    _type?: unknown;
    _volume?: number;
    _audio?: Promise<HTMLAudioElement> | HTMLAudioElement | null;
    play?(): void;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** Sound names seen being played/created this session */
export const seenSounds = new Set<string>();

/** Sound instances we've scaled, so slider changes can be applied while they play (e.g. a ringing call) */
const liveSounds = new Set<WeakRef<DiscordSound>>();
const trackedSounds = new WeakSet<DiscordSound>();

export function getSoundVolume(name: string) {
    return settings.store.volumes[name] ?? 100;
}

/** Combined 0..1 multiplier for a sound: master × (ringtone group) × per-sound */
export function computeMultiplier(name?: string) {
    let mult = settings.store.masterVolume / 100;
    if (name) {
        if (isRingtone(name)) mult *= settings.store.ringtoneVolume / 100;
        mult *= getSoundVolume(name) / 100;
    }
    return clamp01(mult);
}

/** Called from the patched Sound class with `this` */
export function getMultiplier(sound: DiscordSound | undefined) {
    try {
        const name = typeof sound?.name === "string" ? sound.name : undefined;
        if (name) {
            seenSounds.add(name);
            if (!trackedSounds.has(sound!)) {
                trackedSounds.add(sound!);
                liveSounds.add(new WeakRef(sound!));
            }
        }
        return computeMultiplier(name);
    } catch (e) {
        logger.error("Failed to compute multiplier", e);
        return 1;
    }
}

/** Re-apply current settings to every sound that has already created its audio element */
export function reapplyVolumes() {
    for (const ref of liveSounds) {
        const sound = ref.deref();
        if (!sound) {
            liveSounds.delete(ref);
            continue;
        }
        if (!sound._audio || typeof sound._volume !== "number") continue;

        Promise.resolve(sound._audio).then(audio => {
            if (!(audio instanceof HTMLAudioElement)) return;
            audio.volume = clamp01(MediaEngineStore.getOutputVolume() / 100 * sound._volume! * computeMultiplier(sound.name));
        }).catch(() => { });
    }
}

// ---------- Sound discovery ----------

type SoundContext = ((id: string) => any) & { keys(): string[]; };
let soundContext: SoundContext | undefined;

/** Finds Discord's webpack require.context that maps "./<name>.mp3" to sound files */
function getSoundContext() {
    if (soundContext) return soundContext;

    for (const id in cache) {
        try {
            const exp = cache[id]?.exports;
            if (typeof exp !== "function" || typeof exp.keys !== "function") continue;

            const keys = exp.keys();
            if (Array.isArray(keys) && keys.some(k => typeof k === "string" && /(^|\/)(message1|call_ringing)\.mp3$/.test(k))) {
                soundContext = exp as SoundContext;
                return soundContext;
            }
        } catch { }
    }

    return undefined;
}

function contextKeyToName(key: string) {
    const match = /^\.\/([^/]+)\.mp3$/.exec(key);
    return match?.[1];
}

/** Every sound name we know of: hardcoded, shipped by Discord, seen this session, or with a saved volume */
export function getAllSoundNames() {
    const names = new Set<string>(KNOWN_SOUND_NAMES);

    const ctx = getSoundContext();
    if (ctx) {
        try {
            for (const key of ctx.keys()) {
                const name = contextKeyToName(key);
                if (name) names.add(name);
            }
        } catch (e) {
            logger.error("Failed to enumerate sound files", e);
        }
    }

    for (const name of seenSounds) names.add(name);
    for (const name of Object.keys(settings.store.volumes)) names.add(name);

    return [...names];
}

// ---------- Preview ----------

type SoundClass = new (name: string, type: unknown, volume: number) => DiscordSound;
let soundClass: SoundClass | undefined;

const isSoundClass = (v: any): v is SoundClass =>
    typeof v === "function" && v.prototype != null && "play" in v.prototype &&
    ("_ensureAudio" in v.prototype || "ensureAudio" in v.prototype);

/** Discord's Sound class: taken from a sound we've seen, or found in webpack so preview works before any sound has played */
function getSoundClass() {
    if (soundClass) return soundClass;

    for (const ref of liveSounds) {
        const ctor = ref.deref()?.constructor;
        if (isSoundClass(ctor)) return soundClass = ctor;
    }

    for (const id in cache) {
        try {
            const exp = cache[id]?.exports;
            if (exp == null || (typeof exp !== "object" && typeof exp !== "function")) continue;
            if (isSoundClass(exp)) return soundClass = exp;
            for (const key in exp) {
                const val = exp[key];
                if (isSoundClass(val)) return soundClass = val;
            }
        } catch { }
    }

    return undefined;
}

/** The "type" arg Discord passes to its Sound constructor, copied from a real sound if we've seen one */
function getSampleType() {
    for (const ref of liveSounds) {
        const sample = ref.deref();
        if (sample && "_type" in sample) return sample._type;
    }
    return undefined;
}

let previewAudio: HTMLAudioElement | undefined;

/** Fallback: play the file directly. Note this uses the Windows default output device, not Discord's. */
function previewWithAudioElement(name: string) {
    const ctx = getSoundContext();
    if (!ctx) return false;

    const mod = ctx(`./${name}.mp3`);
    const url: unknown = typeof mod === "string" ? mod : mod?.default;
    if (typeof url !== "string") return false;

    previewAudio?.pause();
    previewAudio = new Audio(url);
    previewAudio.volume = clamp01(MediaEngineStore.getOutputVolume() / 100 * computeMultiplier(name));
    previewAudio.play().catch(e => logger.error(`Preview of ${name} failed (audio element)`, e));
    return true;
}

export type PreviewResult = "played" | "silent" | "unavailable";

/** Plays a sound once at the volume it would actually play at */
export function previewSound(name: string): PreviewResult {
    const mult = computeMultiplier(name);
    if (mult === 0) {
        logger.info(`Preview of ${name}: volume is 0% (master ${settings.store.masterVolume}%, ringtone ${settings.store.ringtoneVolume}%, sound ${getSoundVolume(name)}%)`);
        return "silent";
    }

    // Preferred: Discord's own Sound class, so it uses Discord's output device and goes through the patched volume
    const Sound = getSoundClass();
    if (Sound) {
        try {
            const sound = new Sound(name, getSampleType(), 1);
            if (sound.name === name && typeof sound._volume === "number" && typeof sound.play === "function") {
                sound.play();
                logger.info(`Preview of ${name}: played via Discord's Sound class at ${Math.round(mult * 100)}%`);
                return "played";
            }
            logger.warn(`Preview of ${name}: Sound class has an unexpected shape`, sound);
        } catch (e) {
            logger.error(`Preview of ${name}: Sound class failed`, e);
        }
    } else {
        logger.warn("Preview: couldn't find Discord's Sound class");
    }

    try {
        if (previewWithAudioElement(name)) {
            logger.info(`Preview of ${name}: played via audio element fallback (Windows default output device)`);
            return "played";
        }
    } catch (e) {
        logger.error(`Preview of ${name}: audio element fallback failed`, e);
    }

    logger.error(`Preview of ${name}: no way to play it was found`);
    return "unavailable";
}
