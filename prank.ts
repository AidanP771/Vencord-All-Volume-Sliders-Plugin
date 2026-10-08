/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getShippedSoundNames, logger, previewSound, seenSounds } from "./audio";
import { KNOWN_SOUND_NAMES } from "./sounds";

/** Random delay between prank sounds */
const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 120_000;

let timer: ReturnType<typeof setTimeout> | undefined;

const randomDelay = () => MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);

function pickRandomSound() {
    // Prefer sounds that definitely exist: Discord's shipped files, then ones it has played this session
    const shipped = getShippedSoundNames();
    const pool = shipped.length ? shipped : seenSounds.size ? [...seenSounds] : KNOWN_SOUND_NAMES;
    return pool[Math.floor(Math.random() * pool.length)];
}

function scheduleNext() {
    const delay = randomDelay();
    timer = setTimeout(() => {
        const name = pickRandomSound();
        logger.info(`Prank mode: playing ${name}`);
        previewSound(name);
        scheduleNext();
    }, delay);
}

export function startPrank() {
    if (timer) return;
    logger.info("Prank mode on: a random sound plays every 5s - 2min. Turn it off in the plugin settings.");
    scheduleNext();
}

export function stopPrank() {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
    logger.info("Prank mode off");
}
