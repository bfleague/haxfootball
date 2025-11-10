import { type FieldTeam } from "@common/models";
import type { GameState } from "@common/engine";
import { FieldPosition } from "@common/utils";
import {
    getBallPositionWithOffset,
    getPositionFromFieldPosition,
} from "@meta/legacy/utils/stadium";
import { $effect } from "@common/runtime";
import {
    $lockBall,
    $setBallMoveable,
    $setBallUnmoveable,
    $unlockBall,
} from "@meta/legacy/hooks/physics";

export function Prehike({
    offensiveTeam,
    fieldPos,
}: {
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
}) {
    const ballPosX = getBallPositionWithOffset(
        offensiveTeam,
        getPositionFromFieldPosition(fieldPos),
    );

    $setBallUnmoveable();
    $lockBall();

    $effect(($) => {
        $.setBall({ x: ballPosX, y: 0, xspeed: 0, yspeed: 0 });
    });

    // TODO: Set player positions

    // TODO: `chat` should be added to the StateApi and used here
    // for "hike" messages

    function run(state: GameState) {
        // TODO: Prehike logic
    }

    function dispose() {
        $setBallMoveable();
        $unlockBall();
    }

    return { run, dispose };
}
