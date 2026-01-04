import type { GameState } from "@common/engine";
import type { DownState } from "@meta/legacy/utils/game";

export function Blitz({
    downState,
    quarterbackId,
}: {
    downState: DownState;
    quarterbackId: number;
}) {
    function run(state: GameState) {
        // TODO: Implement blitz state behavior.
    }

    return { run };
}
