/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { useEffect, useState } from "@webpack/common";

import { logger } from "./audio";
import { settings } from "./settings";
import { getBaseSound, isRingtone } from "./sounds";

/** Stored in IndexedDB (not plugin settings): audio files are too big for the settings JSON / cloud sync */
const STORE_KEY = "AllVolumeSliders_customRingtone";
const MAX_SIZE_MB = 15;
const VALIDATE_TIMEOUT_MS = 5000;

interface StoredRingtone {
    name: string;
    type: string;
    data: ArrayBuffer;
}

let objectUrl: string | undefined;
let fileName: string | undefined;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

function setCurrent(stored: StoredRingtone | undefined) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = stored ? URL.createObjectURL(new Blob([stored.data], { type: stored.type })) : undefined;
    fileName = stored?.name;
    notify();
}

export async function loadCustomRingtone() {
    try {
        const stored = await DataStore.get<StoredRingtone>(STORE_KEY);
        if (stored?.data) {
            setCurrent(stored);
            logger.info(`Custom ringtone loaded: ${stored.name}`);
        }
    } catch (e) {
        logger.error("Failed to load custom ringtone", e);
    }
}

export function unloadCustomRingtone() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = fileName = undefined;
}

/** Resolves if the browser can play the file, so a broken file never makes a real call silent */
function checkPlayable(url: string) {
    return new Promise<void>((resolve, reject) => {
        const audio = new Audio();
        const timeout = setTimeout(() => done(new Error("it took too long to load")), VALIDATE_TIMEOUT_MS);
        const done = (err?: Error) => {
            clearTimeout(timeout);
            audio.onloadedmetadata = audio.onerror = null;
            audio.src = "";
            err ? reject(err) : resolve();
        };
        audio.onloadedmetadata = () => done();
        audio.onerror = () => done(new Error("it isn't an audio format Discord can play"));
        audio.src = url;
    });
}

/** Saves a new custom ringtone. Returns an error message if the file was rejected. */
export async function setCustomRingtone(file: File): Promise<string | undefined> {
    if (file.size > MAX_SIZE_MB * 1024 * 1024)
        return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_SIZE_MB} MB.`;

    const data = await file.arrayBuffer();
    const type = file.type || "audio/mpeg";

    const testUrl = URL.createObjectURL(new Blob([data], { type }));
    try {
        await checkPlayable(testUrl);
    } catch (e) {
        return `Couldn't use ${file.name}: ${(e as Error).message}.`;
    } finally {
        URL.revokeObjectURL(testUrl);
    }

    const stored: StoredRingtone = { name: file.name, type, data };
    try {
        await DataStore.set(STORE_KEY, stored);
    } catch (e) {
        logger.error("Failed to save custom ringtone", e);
        return "Couldn't save the file. Check the console (Ctrl+Shift+I) for details.";
    }

    setCurrent(stored);
    logger.info(`Custom ringtone set: ${file.name}`);
    return undefined;
}

export async function removeCustomRingtone() {
    await DataStore.del(STORE_KEY);
    setCurrent(undefined);
    logger.info("Custom ringtone removed");
}

/** Whether the custom file should replace this sound, based on the two toggles */
export function usesCustomRingtone(name: string) {
    if (!objectUrl) return false;
    if (settings.store.customRingtoneIncoming && isRingtone(name)) return true;
    if (settings.store.customRingtoneDialing && getBaseSound(name) === "call_calling") return true;
    return false;
}

/** Called from the patched Sound class with the file Discord would have used */
export function resolveSoundSrc(sound: { name?: unknown; } | undefined, original: string) {
    try {
        const name = sound?.name;
        if (typeof name === "string" && usesCustomRingtone(name)) return objectUrl!;
    } catch (e) {
        logger.error("Failed to resolve custom ringtone", e);
    }
    return original;
}

/** Current custom ringtone file name (undefined if none), re-rendering when it changes */
export function useCustomRingtoneName() {
    const [name, setName] = useState(fileName);
    useEffect(() => {
        const listener = () => setName(fileName);
        listeners.add(listener);
        listener();
        return () => void listeners.delete(listener);
    }, []);
    return name;
}
