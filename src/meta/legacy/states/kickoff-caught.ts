import { $effect } from "@common/hooks";
import type { FieldTeam } from "@common/models";
import { opposite, AVATARS, findCatchers } from "@common/utils";
import type { GameState } from "@common/engine";

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
            $effect(($) => {
                $.send(
                    `${player.name} caught by ${catchers.map((p) => p.name).join(", ")}!`,
                );
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
