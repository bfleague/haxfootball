import { $effect } from "@common/runtime";
import { FieldPosition } from "@common/utils";
import { Team } from "@common/models";
import {
    getLineOfScrimmage,
    getFirstDownLine,
    SPECIAL_HIDDEN_POSITION,
    BALL_DISC_ID,
    BALL_ACTIVE_COLOR,
    BALL_INACTIVE_COLOR,
} from "@meta/legacy/utils/stadium";

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

export function $unsetLineOfScrimmage() {
    $effect(($) => {
        const lineOfScrimmage = getLineOfScrimmage();

        lineOfScrimmage.forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_POSITION);
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
            $.setDiscProperties(id, SPECIAL_HIDDEN_POSITION);
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
