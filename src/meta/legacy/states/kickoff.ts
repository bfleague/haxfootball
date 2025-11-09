import { $effect, $next } from "@common/hooks";
import { Team, type FieldTeam } from "@common/models";
import { opposite } from "@common/utils";
import {
    $trapTeamInMidField,
    $trapTeamInEndZone,
    $untrapAllTeams,
    $setBallKickForce,
    $setBallMoveable,
    $setBallUnmoveable,
} from "@meta/legacy/hooks/physics";
import type { GameState } from "@common/engine";
import { t } from "@lingui/core/macro";

export function Kickoff({ forTeam = Team.RED }: { forTeam?: FieldTeam }) {
    $trapTeamInMidField(forTeam);
    $trapTeamInEndZone(opposite(forTeam));
    $setBallKickForce("strong");
    $setBallUnmoveable();

    function run(state: GameState) {
        const kicker = state.players.find((p) => p.isKickingBall);

        if (kicker) {
            $effect(($) => {
                $.send(t`Kickoff kicked!`);
                $.stat("KICKOFF_MADE");
            });

            $next({
                to: "KICKOFF_CATCH",
                params: { kickingTeam: forTeam },
            });
        }
    }

    function dispose() {
        $untrapAllTeams();
        $setBallMoveable();
    }

    return { run, dispose };
}
