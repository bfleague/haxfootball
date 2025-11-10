import { $effect, $next } from "@common/hooks";
import type { FieldTeam } from "@common/models";
import { opposite, AVATARS, findCatchers } from "@common/utils";
import type { GameState, GameStatePlayer } from "@common/engine";
import { t } from "@lingui/core/macro";
import { getFieldPosition } from "@meta/legacy/utils/stadium";

export function KickoffCaught({
    playerId,
    receivingTeam,
}: {
    playerId: number;
    receivingTeam: FieldTeam;
}) {
    $effect(($) => {
        $.setAvatar(playerId, AVATARS.BALL);
    });

    function leave(player: GameStatePlayer) {
        // TODO: Touchback position if in endzone
        if (player.id === playerId) {
            const fieldPos = getFieldPosition(player.x);

            $next({
                to: "PREHIKE",
                params: {
                    offensiveTeam: receivingTeam,
                    fieldPos,
                },
            });
        }
    }

    function run(state: GameState) {
        // TODO: Out of bounds check
        // TODO: Touchback
        // TODO: Safety

        const player = state.players.find((p) => p.id === playerId);
        if (!player) return;

        const catchers = findCatchers(
            player,
            state.players.filter((p) => p.team === opposite(receivingTeam)),
        );

        if (catchers.length > 0) {
            const catcherNames = catchers.map((p) => p.name).join(", ");
            const fieldPos = getFieldPosition(player.x);

            $effect(($) => {
                $.send(t`${player.name} caught by ${catcherNames}!`);
                $.stat("KICKOFF_TACKLED");
            });

            $next({
                to: "PREHIKE",
                params: {
                    offensiveTeam: receivingTeam,
                    fieldPos,
                },
            });
        }
    }

    function dispose() {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });
    }

    return { run, leave, dispose };
}
