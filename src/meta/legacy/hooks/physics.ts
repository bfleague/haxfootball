import { $effect } from "@common/hooks";
import { Team } from "@common/models";

export function $trapTeamInEndZone(team: Team) {
    $effect(($) => {
        const cf = $.CollisionFlags;
        const players = $.getPlayerList();

        const target =
            team === Team.RED
                ? players.filter((p) => p.team === Team.RED)
                : players.filter((p) => p.team === Team.BLUE);

        target.forEach((p) => {
            const disc = $.getPlayerDiscProperties(p.id);

            if (!disc) return;

            const current = typeof disc.cGroup === "number" ? disc.cGroup : 0;
            const bit = team === Team.RED ? cf.c0 : cf.c1;

            $.setPlayerDisc(p.id, { cGroup: current | bit });
        });
    });
}

export function $untrapAllTeams() {
    $effect(($) => {
        const cf = $.CollisionFlags;
        $.getPlayerList()
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

export function $trapTeamInMidField(team: Team) {
    $effect(($) => {
        const cf = $.CollisionFlags;
        const bit = team === Team.RED ? cf.c2 : cf.c3;

        $.getPlayerList()
            .filter((p) => p.team === team)
            .forEach((p) => {
                const disc = $.getPlayerDiscProperties(p.id);

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

export function $haltBall() {
    $effect(($) => {
        $.setBall({ xspeed: 0, yspeed: 0 });
    });
}

export function $setBallKickForce(force: "fast" | "strong" | "normal") {
    const getInvMass = (f: string) => {
        switch (f) {
            case "fast":
                return 1.5;
            case "strong":
                return 1.2;
            case "normal":
            default:
                return 1;
        }
    };

    $effect(($) => {
        $.setBall({ invMass: getInvMass(force) });
    });
}

export function $setBallMoveable() {
    $effect(($) => {
        $.getPlayerList().forEach((p) => {
            $.setPlayerDisc(p.id, { invMass: 0.5 });
        });
    });
}

export function $setBallUnmoveable() {
    $effect(($) => {
        $.getPlayerList().forEach((p) => {
            $.setPlayerDisc(p.id, { invMass: 1e26 });
        });
    });
}
