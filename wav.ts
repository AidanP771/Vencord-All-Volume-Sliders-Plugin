/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** The parts of a Web Audio AudioBuffer we need (kept minimal so it's easy to test) */
export interface PcmSource {
    numberOfChannels: number;
    sampleRate: number;
    length: number;
    getChannelData(channel: number): Float32Array;
}

/**
 * Encodes `source` from `startSeconds` (for at most `maxSeconds`) as a 16-bit PCM WAV.
 * Used to trim a custom ringtone so looping restarts at the chosen start point.
 */
export function encodeWav(source: PcmSource, startSeconds = 0, maxSeconds = Infinity): Blob {
    const { numberOfChannels: channels, sampleRate } = source;
    const startFrame = Math.min(Math.max(Math.round(startSeconds * sampleRate), 0), source.length);
    const endFrame = Math.min(source.length, startFrame + Math.round(maxSeconds * sampleRate));
    const frames = endFrame - startFrame;
    const bytesPerFrame = channels * 2;
    const dataSize = frames * bytesPerFrame;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerFrame, true); // byte rate
    view.setUint16(32, bytesPerFrame, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = Array.from({ length: channels }, (_, c) => source.getChannelData(c));
    let offset = 44;
    for (let frame = startFrame; frame < endFrame; frame++) {
        for (let c = 0; c < channels; c++) {
            const sample = Math.max(-1, Math.min(1, channelData[c][frame]));
            view.setInt16(offset, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7FFF), true);
            offset += 2;
        }
    }

    return new Blob([buffer], { type: "audio/wav" });
}
