import { $effect, $next } from "@common/hooks";
import { Team } from "@common/models";
import { opposite } from "@common/utils";
import {
    $blockMiddleLineForTeam,
    $blockTeam,
    $freeTeams,
    $lockBall,
    $unlockBall,
} from "@meta/legacy/hooks/physics";
import type { GameState } from "@common/engine";

export function Kickoff({ forTeam = Team.RED }: { forTeam?: Team }) {
    $blockMiddleLineForTeam(forTeam);
    $blockTeam(opposite(forTeam));
    $lockBall();

    function run(state: GameState) {
        const kicker = state.players.find((p) => p.isKickingBall);

        if (kicker) {
            $effect(($) => {
                $.send("Kickoff taken!");
                $.stat("KICKOFF_MADE");
            });

            $next({
                to: "KICKOFF_CATCH",
                params: { kickingTeam: forTeam },
            });
        }
    }

    function dispose() {
        $freeTeams();
        $unlockBall();
    }

    return { run, dispose };
}
