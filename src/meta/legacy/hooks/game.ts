import { $effect } from "@runtime/runtime";
import { Line } from "@common/math/geometry";
import { FieldPosition } from "@common/game/game";
import { Team, type FieldTeam } from "@runtime/models";
import {
    arrangeCrowdingBoxes,
    getLineOfScrimmage,
    getLineOfScrimmageBlockers,
    getFirstDownLine,
    getInterceptionPath,
    hideCrowdingBoxes,
    BALL_DISC_ID,
    BALL_ACTIVE_COLOR,
    BALL_INACTIVE_COLOR,
    isInMainField,
} from "@meta/legacy/shared/stadium";
import { SPECIAL_HIDDEN_DISC_POSITION } from "@common/stadium-builder/consts";
import { computeBlockingPlan } from "@meta/legacy/shared/los-blocking";

const LOS_BLOCKING_VERTICAL_EXTENSION = 2000;
const LOS_BLOCKING_ON_LINE_DISTANCE_X = 25;

const LOS_BLOCKING_MIN_SLOT_RADIUS = 2;
const LOS_BLOCKING_LOW_SLOT_RADIUS = 3;
const LOS_BLOCKING_MEDIUM_SLOT_RADIUS = 4;
const LOS_BLOCKING_MAX_SLOT_RADIUS = 5;

// TODO: Move this logic to a more appropriate place.
function getLineOfScrimmageBlockingSlotRadius(
    players: ReadonlyArray<{ position: { x: number } }>,
    lineX: number,
): number {
    const playersOnLineCount = players.filter(
        (player) =>
            Math.abs(player.position.x - lineX) <=
            LOS_BLOCKING_ON_LINE_DISTANCE_X,
    ).length;

    if (playersOnLineCount <= 1) return LOS_BLOCKING_MIN_SLOT_RADIUS;
    if (playersOnLineCount <= 3) return LOS_BLOCKING_LOW_SLOT_RADIUS;
    if (playersOnLineCount <= 8) return LOS_BLOCKING_MEDIUM_SLOT_RADIUS;

    return LOS_BLOCKING_MAX_SLOT_RADIUS;
}

export function $setLineOfScrimmage(fieldPos: FieldPosition) {
    $effect(($) => {
        const lineOfScrimmage = getLineOfScrimmage(fieldPos);

        lineOfScrimmage.forEach(({ id, position }) => {
            $.setDiscProperties(id, {
                x: position.x,
                y: position.y,
            });
        });
    });
}

export function $syncLineOfScrimmageBlocking({
    enabled = true,
}: {
    enabled?: boolean;
} = {}) {
    $effect(($) => {
        const line = getLineOfScrimmage();
        if (line.length < 2 || !line[0] || !line[1]) return;

        const topDisc = $.getDiscProperties(line[0].id);
        const bottomDisc = $.getDiscProperties(line[1].id);

        if (!topDisc || !bottomDisc) return;
        if (typeof topDisc.x !== "number" || typeof topDisc.y !== "number") {
            return;
        }
        if (
            typeof bottomDisc.x !== "number" ||
            typeof bottomDisc.y !== "number"
        ) {
            return;
        }

        const lineIsHidden =
            (topDisc.x === SPECIAL_HIDDEN_DISC_POSITION.x &&
                topDisc.y === SPECIAL_HIDDEN_DISC_POSITION.y) ||
            (bottomDisc.x === SPECIAL_HIDDEN_DISC_POSITION.x &&
                bottomDisc.y === SPECIAL_HIDDEN_DISC_POSITION.y);

        const blockerIds = getLineOfScrimmageBlockers().map(({ id }) => id);

        if (!enabled || lineIsHidden) {
            blockerIds.forEach((blockerId) => {
                $.setDiscProperties(blockerId, SPECIAL_HIDDEN_DISC_POSITION);
            });

            return;
        }

        const blockers = blockerIds
            .map((id) => {
                const disc = $.getDiscProperties(id);
                if (!disc) return null;
                if (typeof disc.x !== "number" || typeof disc.y !== "number") {
                    return null;
                }

                return {
                    id,
                    position: { x: disc.x, y: disc.y },
                };
            })
            .filter((blocker) => blocker !== null);

        const players = $.getPlayerList()
            .filter(
                (player) =>
                    player.team === Team.RED || player.team === Team.BLUE,
            )
            .map((player) => {
                const disc = $.getPlayerDiscProperties(player.id);
                if (!disc) return null;
                if (typeof disc.x !== "number" || typeof disc.y !== "number") {
                    return null;
                }

                return {
                    id: player.id,
                    position: { x: disc.x, y: disc.y },
                };
            })
            .filter((player) => player !== null);

        const plan = computeBlockingPlan({
            line: {
                a: {
                    x: topDisc.x,
                    y: topDisc.y - LOS_BLOCKING_VERTICAL_EXTENSION,
                },
                b: {
                    x: bottomDisc.x,
                    y: bottomDisc.y + LOS_BLOCKING_VERTICAL_EXTENSION,
                },
            },
            players,
            blockers,
            blockerRadius: getLineOfScrimmageBlockingSlotRadius(
                players,
                topDisc.x,
            ),
        });

        plan.moves.forEach((move) => {
            $.setDiscProperties(move.blockerId, move.target);
        });
    });
}

export function $unsetLineOfScrimmage() {
    $effect(($) => {
        const lineOfScrimmage = getLineOfScrimmage();

        lineOfScrimmage.forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
        });
    });
}

export function $setFirstDownLine(
    offensiveTeam: Team,
    fieldPos: FieldPosition,
    distance: number,
) {
    $effect(($) => {
        const firstDownLine = getFirstDownLine(
            offensiveTeam,
            fieldPos,
            distance,
        );

        const shouldHide =
            firstDownLine.length === 0 ||
            !firstDownLine[0] ||
            !isInMainField(firstDownLine[0].position);

        if (shouldHide) {
            getFirstDownLine().forEach(({ id }) => {
                $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
            });

            return;
        }

        firstDownLine.forEach(({ id, position }) => {
            $.setDiscProperties(id, {
                x: position.x,
                y: position.y,
            });
        });
    });
}

export function $unsetFirstDownLine() {
    $effect(($) => {
        const firstDownLine = getFirstDownLine();

        firstDownLine.forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
        });
    });
}

export function $showInterceptionPath(line: Line) {
    $effect(($) => {
        getInterceptionPath(line).forEach(({ id, position }) => {
            $.setDiscProperties(id, {
                x: position.x,
                y: position.y,
            });
        });
    });
}

export function $hideInterceptionPath() {
    $effect(($) => {
        getInterceptionPath().forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_DISC_POSITION);
        });
    });
}

export function $showCrowdingBoxes(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
) {
    $effect(($) => {
        arrangeCrowdingBoxes(offensiveTeam, fieldPos).forEach(([id, x, y]) => {
            $.setDiscProperties(id, { x, y });
        });
    });
}

export function $hideCrowdingBoxes() {
    $effect(($) => {
        hideCrowdingBoxes().forEach(([id, x, y]) => {
            $.setDiscProperties(id, { x, y });
        });
    });
}

export function $setBallInactive() {
    $effect(($) => {
        $.setDiscProperties(BALL_DISC_ID, {
            color: BALL_INACTIVE_COLOR,
        });
    });
}

export function $setBallActive() {
    $effect(($) => {
        $.setDiscProperties(BALL_DISC_ID, {
            color: BALL_ACTIVE_COLOR,
        });
    });
}
