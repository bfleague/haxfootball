import { type FieldTeam } from "@common/models";
import type { GameState } from "@common/engine";
import { FieldPosition } from "@common/utils";
import { $setBallMoveable, $unlockBall } from "@meta/legacy/hooks/physics";

export function Snap({
    offensiveTeam,
    fieldPos,
    quarterbackId,
}: {
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
    quarterbackId: number;
}) {
    $setBallMoveable();
    $unlockBall();

    function run(state: GameState) {
        // TODO: Snap logic
    }

    function dispose() {
        // TODO: Cleanup logic
    }

    return { run, dispose };
}
