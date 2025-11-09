import { $effect } from "@common/hooks";
import type { FieldTeam } from "@common/models";
import { opposite, AVATARS, findCatchers } from "@common/utils";
import type { GameState } from "@common/engine";
import { t } from "@lingui/core/macro";

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

    function run(state: GameState) {
        const player = state.players.find((p) => p.id === playerId);

        if (!player) return;

        const catchers = findCatchers(
            player,
            state.players.filter((p) => p.team === opposite(receivingTeam)),
        );

        if (catchers.length > 0) {
            const catcherNames = catchers.map((p) => p.name).join(", ");

            $effect(($) => {
                $.send(t`${player.name} caught by ${catcherNames}!`);
                $.stat("KICKOFF_CAUGHT");
                $.stopGame();
            });
        }
    }

    function dispose() {
        $effect(($) => {
            $.setAvatar(playerId, null);
        });
    }

    return { run, dispose };
}
