/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Slider, TextInput, useEffect, useMemo, useState } from "@webpack/common";

import { getAllSoundNames, previewSound, reapplyVolumes } from "../audio";
import { settings } from "../settings";
import { CATEGORIES, Category, getSoundInfo, SoundInfo } from "../sounds";

const cl = (name: string) => `vc-avs-${name}`;

function setVolume(name: string, value: number | undefined) {
    const volumes = { ...settings.store.volumes };
    if (value === undefined || value === 100) delete volumes[name];
    else volumes[name] = Math.round(value);
    settings.store.volumes = volumes;
    reapplyVolumes();
}

/** Number box for typing an exact volume. Commits on Enter or when it loses focus; invalid input reverts. */
function VolumeInput({ value, label, onCommit }: { value: number; label: string; onCommit(v: number): void; }) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);

    const commit = () => {
        const trimmed = text.trim().replace(/%$/, "");
        const n = Number(trimmed);
        if (!trimmed || !Number.isFinite(n)) {
            setText(String(value));
            return;
        }
        const v = Math.round(Math.min(Math.max(n, 0), 100));
        setText(String(v));
        if (v !== value) onCommit(v);
    };

    return (
        <label className={cl("input-wrap")}>
            <input
                className={cl("input")}
                type="number"
                min={0}
                max={100}
                step={1}
                value={text}
                aria-label={`${label} volume (0-100)`}
                onChange={e => setText(e.currentTarget.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <span className={cl("input-suffix")}>%</span>
        </label>
    );
}

function SoundRow({ sound, volume, sliderKey, onReset }: { sound: SoundInfo; volume: number; sliderKey: number; onReset(): void; }) {
    const [previewFailed, setPreviewFailed] = useState(false);
    // Sliders are uncontrolled, so remount after a typed value to move the handle
    const [typedNonce, setTypedNonce] = useState(0);
    const muted = volume === 0;

    return (
        <div className={cl("row")}>
            <div className={cl("label")}>
                <span className={cl("name")}>{sound.label}</span>
                <code className={cl("id")}>{sound.name}</code>
            </div>
            <Slider
                key={`${sliderKey}-${typedNonce}`}
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
                    title={previewFailed ? "Preview unavailable until Discord has played any sound once" : "Preview"}
                    onClick={() => setPreviewFailed(!previewSound(sound.name))}
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
                    title="Reset to 100%"
                    disabled={volume === 100}
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
        </section>
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
                                volume={volumes[s.name] ?? 100}
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
