import { $effect } from "@common/hooks";
import { Team } from "@common/models";

export function $blockTeam(team: Team) {
    $effect(($) => {
        const cf = $.CollisionFlags;
        const players = $.room.getPlayerList();

        const target =
            team === Team.RED
                ? players.filter((p) => p.team === Team.RED)
                : players.filter((p) => p.team === Team.BLUE);

        target.forEach((p) => {
            const disc = $.room.getPlayerDiscProperties(p.id);

            if (!disc) return;

            const current = typeof disc.cGroup === "number" ? disc.cGroup : 0;
            const bit = team === Team.RED ? cf.c0 : cf.c1;

            $.setPlayerDisc(p.id, { cGroup: current | bit });
        });
    });
}

export function $unblockTeams() {
    $effect(($) => {
        const cf = $.CollisionFlags;
        $.room
            .getPlayerList()
            .map((p) => ({
                id: p.id,
                base:
                    p.team === Team.RED
                        ? cf.red
                        : p.team === Team.BLUE
                          ? cf.blue
                          : 0,
            }))
            .filter((x) => x.base !== 0)
            .forEach(({ id, base }) => {
                $.setPlayerDisc(id, { cGroup: base });
            });
    });
}

export const $freeTeams = $unblockTeams;

export function $blockMiddleLineForTeam(team: Team) {
    $effect(($) => {
        const cf = $.CollisionFlags;
        const bit = team === Team.RED ? cf.c2 : cf.c3;

        $.room
            .getPlayerList()
            .filter((p) => p.team === team)
            .forEach((p) => {
                const disc = $.room.getPlayerDiscProperties(p.id);

                if (!disc) return;

                const current =
                    typeof disc.cGroup === "number" ? disc.cGroup : 0;

                $.setPlayerDisc(p.id, { cGroup: current | bit });
            });
    });
}

export function $lockBall() {
    $effect(($) => {
        $.setBall({ invMass: 0.000001 });
    });
}

export function $unlockBall() {
    $effect(($) => {
        $.setBall({ invMass: 1 });
    });
}
