import { GameState } from "@common/engine";
import { FieldTeam } from "@common/models";
import { $effect } from "@common/runtime";
import { AVATARS, Line } from "@common/utils";
import { $setBallActive, $setBallInactive } from "@meta/legacy/hooks/game";

export function Interception({
    playerId,
    ballPath,
    offensiveTeam,
}: {
    playerId: number;
    ballPath: Line;
    offensiveTeam: FieldTeam;
}) {
    $setBallInactive();

    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    // TODO: Show visual line of interception

    function run(state: GameState) {
        // TODO
    }

    function dispose() {
        $setBallActive();
    }

    return { run, dispose };
}
