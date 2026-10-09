/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { showToast, Slider, TextInput, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { getAllSoundNames, previewSound, reapplyVolumes, resolveSoundVolume, stopAllSounds } from "../audio";
import { removeCustomRingtone, setCustomRingtone, setRingtoneStart, useCustomRingtone } from "../customRingtone";
import { settings } from "../settings";
import { CATEGORIES, Category, compareSounds, getBaseSound, getSoundInfo, SoundInfo } from "../sounds";

const cl = (name: string) => `vc-avs-${name}`;

/** Sets a sound's own volume. `undefined`, or the value it would inherit anyway, clears it. */
function setVolume(name: string, value: number | undefined) {
    const volumes = { ...settings.store.volumes };
    const base = getBaseSound(name);
    const inherited = base !== name ? volumes[base] ?? 100 : 100;
    if (value === undefined || Math.round(value) === inherited) delete volumes[name];
    else volumes[name] = Math.round(value);
    settings.store.volumes = volumes;
    reapplyVolumes();
}

interface NumberInputProps {
    value: number;
    min: number;
    max: number;
    /** Decimal places to keep (0 = whole numbers) */
    decimals?: number;
    suffix: string;
    ariaLabel: string;
    onCommit(v: number): void;
}

/** Number box for typing an exact value. Commits on Enter or when it loses focus; invalid input reverts. */
function NumberInput({ value, min, max, decimals = 0, suffix, ariaLabel, onCommit }: NumberInputProps) {
    const format = (v: number) => String(Number(v.toFixed(decimals)));
    const [text, setText] = useState(format(value));
    useEffect(() => setText(format(value)), [value]);

    const commit = () => {
        const trimmed = text.trim().replace(/(%|s)$/i, "");
        const n = Number(trimmed);
        if (!trimmed || !Number.isFinite(n)) {
            setText(format(value));
            return;
        }
        const v = Number(Math.min(Math.max(n, min), max).toFixed(decimals));
        setText(format(v));
        if (v !== value) onCommit(v);
    };

    return (
        <label className={cl("input-wrap")}>
            <input
                className={cl("input")}
                type="number"
                min={min}
                max={max}
                step={decimals ? 1 / 10 ** decimals : 1}
                value={text}
                aria-label={ariaLabel}
                onChange={e => setText(e.currentTarget.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <span className={cl("input-suffix")}>{suffix}</span>
        </label>
    );
}

function VolumeInput({ value, label, onCommit }: { value: number; label: string; onCommit(v: number): void; }) {
    return <NumberInput value={value} min={0} max={100} suffix="%" ariaLabel={`${label} volume (0-100)`} onCommit={onCommit} />;
}

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

function previewSoundWithFeedback(name: string, label: string) {
    const result = previewSound(name);
    if (result === "silent")
        showToast(`${label} is at 0%. Check the master, ringtone and this sound's volume.`, "failure");
    else if (result === "unavailable")
        showToast(`Couldn't preview ${label}. Open the console (Ctrl+Shift+I) for details.`, "failure");
}

async function stopAllWithFeedback() {
    const stopped = await stopAllSounds();
    showToast(stopped ? `Stopped ${stopped} sound${stopped === 1 ? "" : "s"}` : "Nothing is playing", stopped ? "success" : "message");
}

interface SoundRowProps {
    sound: SoundInfo;
    /** Effective per-sound volume (own value, or inherited from the base sound) */
    volume: number;
    /** Whether this sound has its own value instead of the default/inherited one */
    hasOverride: boolean;
    /** For themed variants: the base sound's label and current volume */
    baseLabel?: string;
    baseVolume?: number;
    sliderKey: number;
    onReset(): void;
}

function SoundRow({ sound, volume, hasOverride, baseLabel, baseVolume, sliderKey, onReset }: SoundRowProps) {
    // Sliders are uncontrolled, so remount after a typed value to move the handle
    const [typedNonce, setTypedNonce] = useState(0);
    const muted = volume === 0;

    return (
        <div className={cl("row")}>
            <div className={cl("label")}>
                <span className={cl("name")}>{sound.label}</span>
                <code className={cl("id")}>
                    {sound.name}{baseLabel && !hasOverride && ` · follows "${baseLabel}"`}
                </code>
            </div>
            <Slider
                // baseVolume in the key: moving the base sound's slider moves its variants too
                key={`${sliderKey}-${typedNonce}-${baseVolume ?? ""}`}
                className={cl("slider")}
                initialValue={volume}
                minValue={0}
                maxValue={100}
                markers={[0, 25, 50, 75, 100]}
                stickToMarkers={false}
                onValueChange={v => setVolume(sound.name, v)}
                onValueRender={v => `${Math.round(v)}%`}
            />
            <VolumeInput
                value={volume}
                label={sound.label}
                onCommit={v => { setVolume(sound.name, v); setTypedNonce(n => n + 1); }}
            />
            <div className={cl("buttons")}>
                <Button
                    size="small"
                    variant="secondary"
                    title="Preview at its current volume"
                    onClick={() => previewSoundWithFeedback(sound.name, sound.label)}
                >
                    ▶
                </Button>
                <Button
                    size="small"
                    variant={muted ? "dangerPrimary" : "secondary"}
                    title={muted ? "Unmute" : "Mute"}
                    onClick={() => { setVolume(sound.name, muted ? 100 : 0); onReset(); }}
                >
                    {muted ? "Muted" : "Mute"}
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    title={baseLabel ? `Follow "${baseLabel}" again` : "Reset to 100%"}
                    disabled={!hasOverride}
                    onClick={() => { setVolume(sound.name, undefined); onReset(); }}
                >
                    Reset
                </Button>
            </div>
        </div>
    );
}

function GlobalSlider({ label, description, value, onChange }: { label: string; description: string; value: number; onChange(v: number): void; }) {
    const [typedNonce, setTypedNonce] = useState(0);
    const set = (v: number) => { onChange(Math.round(v)); reapplyVolumes(); };

    return (
        <div className={cl("row")}>
            <div className={cl("label")}>
                <span className={cl("name")}>{label}</span>
                <span className={cl("id")}>{description}</span>
            </div>
            <Slider
                key={typedNonce}
                className={cl("slider")}
                initialValue={value}
                minValue={0}
                maxValue={100}
                markers={[0, 25, 50, 75, 100]}
                stickToMarkers={false}
                onValueChange={set}
                onValueRender={v => `${Math.round(v)}%`}
            />
            <VolumeInput
                value={value}
                label={label}
                onCommit={v => { set(v); setTypedNonce(n => n + 1); }}
            />
            {/* keeps the grid aligned with sound rows */}
            <div />
        </div>
    );
}

/** Master + Ringtone sliders (custom instead of Vencord's built-in sliders so they also get a number box) */
function GlobalSliders() {
    const { masterVolume, ringtoneVolume } = settings.use(["masterVolume", "ringtoneVolume"]);

    return (
        <section className={cl("category")}>
            <GlobalSlider
                label="Master volume"
                description="Scales every sound below"
                value={masterVolume}
                onChange={v => settings.store.masterVolume = v}
            />
            <GlobalSlider
                label="Ringtone volume"
                description="Incoming call ringtone + all variants"
                value={ringtoneVolume}
                onChange={v => settings.store.ringtoneVolume = v}
            />
            <CustomRingtoneSection />
        </section>
    );
}

function CustomRingtoneSection() {
    const { customRingtoneIncoming, customRingtoneDialing, customRingtoneStart } =
        settings.use(["customRingtoneIncoming", "customRingtoneDialing", "customRingtoneStart"]);
    const { name: fileName, duration, trimming } = useCustomRingtone();
    // Slider is uncontrolled, so remount it when the start point is typed or a new file resets it
    const [startNonce, setStartNonce] = useState(0);
    const maxStart = Math.max((duration ?? 0) - 0.5, 0);

    const changeStart = async (seconds: number) => {
        const error = await setRingtoneStart(seconds);
        if (error) showToast(error, "failure");
    };
    // The slider may report every step while dragging; only trim once it settles
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const changeStartDebounced = (seconds: number) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => changeStart(seconds), 300);
    };
    useEffect(() => () => clearTimeout(debounceRef.current), []);
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    // Preview whichever sound the custom file currently replaces (both go through the patched Sound class)
    const previewTarget = customRingtoneIncoming ? "call_ringing" : customRingtoneDialing ? "call_calling" : undefined;

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        try {
            const error = await setCustomRingtone(file);
            showToast(error ?? `Custom ringtone set: ${file.name}`, error ? "failure" : "success");
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div className={cl("custom-ringtone")}>
            <div className={cl("row")}>
                <div className={cl("label")}>
                    <span className={cl("name")}>Custom ringtone</span>
                    <span className={cl("id")}>{fileName ?? "None (Discord's own ringtone)"}</span>
                </div>
                <div className={cl("buttons")}>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="audio/*"
                        hidden
                        onChange={e => onFile(e.currentTarget.files?.[0])}
                    />
                    <Button size="small" variant="primary" disabled={busy || trimming} onClick={() => inputRef.current?.click()}>
                        {busy ? "Checking..." : fileName ? "Change file..." : "Choose file..."}
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        disabled={!fileName || !previewTarget || trimming}
                        title={previewTarget ? "Preview at the current ringtone volume" : "Turn on one of the switches below to preview"}
                        onClick={() => previewTarget && previewSoundWithFeedback(previewTarget, "Custom ringtone")}
                    >
                        ▶
                    </Button>
                    <Button
                        size="small"
                        variant="dangerSecondary"
                        disabled={!fileName}
                        onClick={async () => {
                            await removeCustomRingtone();
                            showToast("Custom ringtone removed. Discord's ringtone is back.", "message");
                        }}
                    >
                        Remove
                    </Button>
                </div>
            </div>
            {fileName && maxStart > 0 && (
                <div className={cl("row")}>
                    <div className={cl("label")}>
                        <span className={cl("name")}>Start at</span>
                        <span className={cl("id")}>
                            {trimming ? "Applying..." : `Plays (and loops) from ${formatTime(customRingtoneStart)} of ${formatTime(duration!)}`}
                        </span>
                    </div>
                    <Slider
                        key={`${fileName}-${startNonce}`}
                        className={cl("slider")}
                        initialValue={Math.min(customRingtoneStart, maxStart)}
                        minValue={0}
                        maxValue={maxStart}
                        markers={[0, maxStart]}
                        stickToMarkers={false}
                        onMarkerRender={formatTime}
                        onValueRender={formatTime}
                        onValueChange={changeStartDebounced}
                    />
                    <NumberInput
                        value={customRingtoneStart}
                        min={0}
                        max={Number(maxStart.toFixed(1))}
                        decimals={1}
                        suffix="s"
                        ariaLabel="Custom ringtone start point in seconds"
                        onCommit={v => { changeStart(v); setStartNonce(n => n + 1); }}
                    />
                    <div />
                </div>
            )}
            <FormSwitch
                title="Use for incoming calls"
                description="Replaces every incoming ringtone, including seasonal ones"
                value={customRingtoneIncoming}
                onChange={v => settings.store.customRingtoneIncoming = v}
            />
            <FormSwitch
                title="Use for outgoing calls"
                description="Replaces the dialing sound you hear while calling someone"
                value={customRingtoneDialing}
                onChange={v => settings.store.customRingtoneDialing = v}
                hideBorder
            />
        </div>
    );
}

export function VolumeSettings() {
    const { volumes } = settings.use(["volumes"]);
    const [query, setQuery] = useState("");
    const [collapsed, setCollapsed] = useState<Set<Category>>(() => new Set(["Other"]));
    // Sliders are uncontrolled (initialValue), so bump a key to remount them after a reset/mute
    const [resetNonce, setResetNonce] = useState(0);
    const bump = () => setResetNonce(n => n + 1);

    const grouped = useMemo(() => {
        const map = new Map<Category, SoundInfo[]>();
        for (const name of getAllSoundNames()) {
            const info = getSoundInfo(name);
            if (!map.has(info.category)) map.set(info.category, []);
            map.get(info.category)!.push(info);
        }
        for (const list of map.values()) list.sort(compareSounds);
        return map;
    }, []);

    const q = query.trim().toLowerCase();
    const matches = (s: SoundInfo) => !q || s.name.toLowerCase().includes(q) || s.label.toLowerCase().includes(q);

    const toggle = (cat: Category) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        return next;
    });

    return (
        <div className={cl("root")}>
            <GlobalSliders />
            <HeadingTertiary>Individual sounds</HeadingTertiary>
            <Paragraph className={cl("hint")}>
                Drag a slider or type a value (0-100). Each sound multiplies with the master volume (and the ringtone volume for ringtones). Sounds Discord adds
                later are listed under "Other" once they're found.
            </Paragraph>

            <div className={cl("toolbar")}>
                <TextInput value={query} onChange={setQuery} placeholder="Search sounds..." />
                <Button
                    size="small"
                    variant="secondary"
                    title="Stop all previews and any Discord sound that's playing right now (e.g. a ringtone)"
                    onClick={stopAllWithFeedback}
                >
                    ■ Stop all sounds
                </Button>
                <Button
                    size="small"
                    variant="dangerSecondary"
                    disabled={Object.keys(volumes).length === 0}
                    onClick={() => { settings.store.volumes = {}; reapplyVolumes(); bump(); }}
                >
                    Reset all
                </Button>
            </div>

            {CATEGORIES.map(cat => {
                const sounds = (grouped.get(cat) ?? []).filter(matches);
                if (!sounds.length) return null;

                const isOpen = !!q || !collapsed.has(cat);
                return (
                    <section key={cat} className={cl("category")}>
                        <button className={cl("category-header")} onClick={() => toggle(cat)}>
                            <span>{isOpen ? "▾" : "▸"} {cat}</span>
                            <span className={cl("count")}>{sounds.length}</span>
                        </button>
                        {isOpen && sounds.map(s => (
                            <SoundRow
                                key={s.name}
                                sound={s}
                                volume={resolveSoundVolume(volumes, s.name)}
                                hasOverride={volumes[s.name] !== undefined}
                                baseLabel={s.base && getSoundInfo(s.base).label}
                                baseVolume={s.base ? volumes[s.base] ?? 100 : undefined}
                                sliderKey={resetNonce}
                                onReset={bump}
                            />
                        ))}
                    </section>
                );
            })}
        </div>
    );
}
