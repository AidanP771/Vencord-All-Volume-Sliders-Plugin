/*
 * AllVolumeSliders, a Vencord userplugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { RenderModalProps } from "@vencord/discord-types";
import { findComponentByCodeLazy } from "@webpack";
import { Modal, openModal } from "@webpack/common";

import { settings } from "../settings";
import { VolumeSettings } from "./VolumeSettings";

// Same button Discord uses for mute/deafen in the account panel (also used by Vencord's GameActivityToggle)
const PanelButton = findComponentByCodeLazy(".GREEN,positionKeyStemOverride:");

function SlidersIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a1 1 0 0 0-1.7-.7L6.6 6H4a2 2 0 0 0-2 2v8c0 1.1.9 2 2 2h2.6l3.7 3.7A1 1 0 0 0 12 21V3Z" />
            <rect x="14" y="5" width="2" height="14" rx="1" />
            <rect x="18" y="8" width="2" height="8" rx="1" />
            <circle cx="15" cy="14" r="2.2" />
            <circle cx="19" cy="10" r="2.2" />
        </svg>
    );
}

function VolumeModal({ modalProps }: { modalProps: RenderModalProps; }) {
    return (
        <Modal
            {...modalProps}
            size="lg"
            title="Sound Volumes"
            subtitle="Per-sound volume for every Discord sound"
            actions={[{ text: "Done", variant: "primary", onClick: modalProps.onClose }]}
        >
            <VolumeSettings showGlobal />
        </Modal>
    );
}

export function openVolumeModal() {
    openModal(modalProps => (
        <ErrorBoundary>
            <VolumeModal modalProps={modalProps} />
        </ErrorBoundary>
    ));
}

function VolumeSlidersButton(props: { nameplate?: any; }) {
    const { showPanelButton } = settings.use(["showPanelButton"]);
    if (!showPanelButton) return null;

    return (
        <PanelButton
            tooltipText="Sound Volumes"
            icon={SlidersIcon}
            plated={props?.nameplate != null}
            onClick={openVolumeModal}
        />
    );
}

export const VolumeSlidersPanelButton = ErrorBoundary.wrap(VolumeSlidersButton, { noop: true });
