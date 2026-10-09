/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useState } from "@webpack/common";

import { logger } from "./audio";
import { settings } from "./settings";
import { getBaseSound, isRingtone } from "./sounds";
import { encodeWav, PcmSource } from "./wav";

/** Stored in IndexedDB (not plugin settings): audio files are too big for the settings JSON / cloud sync */
const STORE_KEY = "AllVolumeSliders_customRingtone";
const MAX_SIZE_MB = 15;
const VALIDATE_TIMEOUT_MS = 5000;
/** Trimmed copies are capped at this length (calls stop ringing long before), keeping the WAV around 20 MB at most */
const MAX_TRIMMED_SECONDS = 120;

interface StoredRingtone {
    name: string;
    type: string;
    data: ArrayBuffer;
}

let stored: StoredRingtone | undefined;
/** The file as uploaded */
let originalUrl: string | undefined;
/** The file trimmed to the start point (only when the start point is > 0) */
let trimmedUrl: string | undefined;
/** Length of the original file in seconds (undefined until known) */
let duration: number | undefined;
/** Bumped on every change so a slow trim can't overwrite a newer one */
let generation = 0;
let trimming = false;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

const revoke = (url: string | undefined) => url && URL.revokeObjectURL(url);

/** URL Discord should play: the trimmed copy when there's a start point, otherwise the original */
const activeUrl = () => trimmedUrl ?? originalUrl;

function setCurrent(next: StoredRingtone | undefined, nextDuration?: number) {
    generation++;
    revoke(originalUrl);
    revoke(trimmedUrl);
    stored = next;
    originalUrl = next ? URL.createObjectURL(new Blob([next.data], { type: next.type })) : undefined;
    trimmedUrl = undefined;
    duration = nextDuration;
    trimming = false;
    notify();
}

/** Resolves with the duration if the browser can play the file, so a broken file never makes a real call silent */
function probe(url: string) {
    return new Promise<number>((resolve, reject) => {
        const audio = new Audio();
        const timeout = setTimeout(() => done(new Error("it took too long to load")), VALIDATE_TIMEOUT_MS);
        const done = (err?: Error) => {
            clearTimeout(timeout);
            const { duration: d } = audio;
            audio.onloadedmetadata = audio.onerror = null;
            audio.src = "";
            err ? reject(err) : resolve(Number.isFinite(d) ? d : 0);
        };
        audio.onloadedmetadata = () => done();
        audio.onerror = () => done(new Error("it isn't an audio format Discord can play"));
        audio.src = url;
    });
}

async function decode(data: ArrayBuffer): Promise<PcmSource> {
    // decodeAudioData detaches the buffer it's given, so pass a copy
    const ctx = new OfflineAudioContext(1, 1, 44100);
    return ctx.decodeAudioData(data.slice(0));
}

/**
 * Re-creates the trimmed copy for the current start point (settings.store.customRingtoneStart).
 * Returns an error message if trimming failed; the untrimmed file keeps playing in that case.
 */
export async function applyStartPoint(): Promise<string | undefined> {
    const gen = ++generation;
    const start = settings.store.customRingtoneStart ?? 0;

    if (!stored || start <= 0) {
        revoke(trimmedUrl);
        trimmedUrl = undefined;
        trimming = false;
        notify();
        return undefined;
    }

    trimming = true;
    notify();
    try {
        // Not cached: decoded audio for a long song can be hundreds of MB
        const decoded = await decode(stored.data);
        if (gen !== generation) return undefined;

        const url = URL.createObjectURL(encodeWav(decoded, start, MAX_TRIMMED_SECONDS));
        revoke(trimmedUrl);
        trimmedUrl = url;
        logger.info(`Custom ringtone now starts at ${start.toFixed(1)}s`);
        return undefined;
    } catch (e) {
        logger.error("Failed to trim custom ringtone", e);
        if (gen === generation) {
            // Drop any older trimmed copy too, so it really does play from the beginning (and the UI agrees)
            revoke(trimmedUrl);
            trimmedUrl = undefined;
            settings.store.customRingtoneStart = 0;
        }
        return "Couldn't apply the start point, so the ringtone plays from the beginning.";
    } finally {
        if (gen === generation) {
            trimming = false;
            notify();
        }
    }
}

/** Sets the start point in seconds (clamped to the file length) and applies it */
export function setRingtoneStart(seconds: number) {
    const max = Math.max((duration ?? 0) - 0.5, 0);
    settings.store.customRingtoneStart = Math.round(Math.min(Math.max(seconds, 0), max) * 10) / 10;
    return applyStartPoint();
}

export async function loadCustomRingtone() {
    try {
        const saved = await DataStore.get<StoredRingtone>(STORE_KEY);
        if (!saved?.data) return;

        setCurrent(saved);
        logger.info(`Custom ringtone loaded: ${saved.name}`);
        probe(originalUrl!).then(d => { duration = d; notify(); }).catch(() => { });
        await applyStartPoint();
    } catch (e) {
        logger.error("Failed to load custom ringtone", e);
    }
}

export function unloadCustomRingtone() {
    setCurrent(undefined);
}

/** Saves a new custom ringtone (start point resets to 0). Returns an error message if the file was rejected. */
export async function setCustomRingtone(file: File): Promise<string | undefined> {
    if (file.size > MAX_SIZE_MB * 1024 * 1024)
        return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_SIZE_MB} MB.`;

    const data = await file.arrayBuffer();
    const type = file.type || "audio/mpeg";

    const testUrl = URL.createObjectURL(new Blob([data], { type }));
    let fileDuration: number;
    try {
        fileDuration = await probe(testUrl);
    } catch (e) {
        return `Couldn't use ${file.name}: ${(e as Error).message}.`;
    } finally {
        URL.revokeObjectURL(testUrl);
    }

    const next: StoredRingtone = { name: file.name, type, data };
    try {
        await DataStore.set(STORE_KEY, next);
    } catch (e) {
        logger.error("Failed to save custom ringtone", e);
        return "Couldn't save the file. Check the console (Ctrl+Shift+I) for details.";
    }

    settings.store.customRingtoneStart = 0;
    setCurrent(next, fileDuration);
    logger.info(`Custom ringtone set: ${file.name}`);
    return undefined;
}

export async function removeCustomRingtone() {
    await DataStore.del(STORE_KEY);
    settings.store.customRingtoneStart = 0;
    setCurrent(undefined);
    logger.info("Custom ringtone removed");
}

/** Whether the custom file should replace this sound, based on the two toggles */
export function usesCustomRingtone(name: string) {
    if (!activeUrl()) return false;
    if (settings.store.customRingtoneIncoming && isRingtone(name)) return true;
    if (settings.store.customRingtoneDialing && getBaseSound(name) === "call_calling") return true;
    return false;
}

/** Called from the patched Sound class with the file Discord would have used */
export function resolveSoundSrc(sound: { name?: unknown; } | undefined, original: string) {
    try {
        const name = sound?.name;
        if (typeof name === "string" && usesCustomRingtone(name)) return activeUrl()!;
    } catch (e) {
        logger.error("Failed to resolve custom ringtone", e);
    }
    return original;
}

export interface CustomRingtoneState {
    /** File name, or undefined if there's no custom ringtone */
    name?: string;
    /** Length of the file in seconds, once known */
    duration?: number;
    /** A new start point is being applied */
    trimming: boolean;
}

const snapshot = (): CustomRingtoneState => ({ name: stored?.name, duration, trimming });

/** Current custom ringtone state, re-rendering when it changes */
export function useCustomRingtone() {
    const [state, setState] = useState(snapshot);
    useEffect(() => {
        const listener = () => setState(snapshot());
        listeners.add(listener);
        listener();
        return () => void listeners.delete(listener);
    }, []);
    return state;
}
