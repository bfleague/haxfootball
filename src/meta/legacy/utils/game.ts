import { FieldTeam } from "@common/models";
import { FieldPosition, opposite, PointLike } from "@common/utils";
import {
    calculateDirectionalGain,
    calculateYardsGained,
    getPositionFromFieldPosition,
    isOutOfBounds,
    intersectsEndZone,
} from "./stadium";

export type DownAndDistance = {
    down: number;
    distance: number;
};

export type DownState = {
    downAndDistance: DownAndDistance;
    offensiveTeam: FieldTeam;
    fieldPos: FieldPosition;
};

export type DownEvent =
    | { type: "FIRST_DOWN"; yardsGained: number }
    | { type: "NEXT_DOWN"; yardsGained: number }
    | { type: "TURNOVER_ON_DOWNS" };

export type NextDownState = {
    downState: DownState;
    event: DownEvent;
};

export type DownEventIncrement =
    | { type: "NEXT_DOWN" }
    | { type: "TURNOVER_ON_DOWNS" };

export type NextDownStateIncrement = {
    downState: DownState;
    event: DownEventIncrement;
};

export const SCORES = {
    SAFETY: 2,
    TOUCHDOWN: 6,
    FIELD_GOAL: 3,
};

export const DISTANCE_TO_FIRST_DOWN = 20;
export const MAX_DOWNS = 4;
export const FIRST_DOWN = 1;

export const INITIAL_DOWN_AND_DISTANCE: DownAndDistance = {
    down: FIRST_DOWN,
    distance: DISTANCE_TO_FIRST_DOWN,
};

export function getInitialDownState(
    offensiveTeam: FieldTeam,
    fieldPos: FieldPosition,
): DownState {
    return {
        offensiveTeam,
        downAndDistance: INITIAL_DOWN_AND_DISTANCE,
        fieldPos,
    };
}

export function incrementDownState(current: DownState): NextDownStateIncrement {
    const newDown = current.downAndDistance.down + 1;

    if (newDown > MAX_DOWNS) {
        return {
            downState: {
                offensiveTeam: opposite(current.offensiveTeam),
                fieldPos: current.fieldPos,
                downAndDistance: INITIAL_DOWN_AND_DISTANCE,
            },
            event: { type: "TURNOVER_ON_DOWNS" },
        };
    }

    return {
        downState: {
            offensiveTeam: current.offensiveTeam,
            fieldPos: current.fieldPos,
            downAndDistance: {
                down: newDown,
                distance: current.downAndDistance.distance,
            },
        },
        event: { type: "NEXT_DOWN" },
    };
}

export function advanceDownState(
    current: DownState,
    newFieldPos?: FieldPosition,
): NextDownState {
    const actualFieldPos = newFieldPos ?? current.fieldPos;
    const yardsGained = calculateYardsGained(
        current.offensiveTeam,
        current.fieldPos,
        actualFieldPos,
    );

    const newDistance = current.downAndDistance.distance - yardsGained;

    if (newDistance <= 0) {
        return {
            downState: {
                offensiveTeam: current.offensiveTeam,
                fieldPos: actualFieldPos,
                downAndDistance: {
                    down: FIRST_DOWN,
                    distance: DISTANCE_TO_FIRST_DOWN,
                },
            },
            event: { type: "FIRST_DOWN", yardsGained },
        };
    }

    const newDown = current.downAndDistance.down + 1;

    if (newDown > MAX_DOWNS) {
        return {
            downState: {
                offensiveTeam: opposite(current.offensiveTeam),
                fieldPos: actualFieldPos,
                downAndDistance: INITIAL_DOWN_AND_DISTANCE,
            },
            event: { type: "TURNOVER_ON_DOWNS" },
        };
    }

    return {
        downState: {
            offensiveTeam: current.offensiveTeam,
            fieldPos: actualFieldPos,
            downAndDistance: {
                down: newDown,
                distance: newDistance,
            },
        },
        event: { type: "NEXT_DOWN", yardsGained },
    };
}

export function isTouchdown({
    player,
    offensiveTeam,
}: {
    player: PointLike;
    offensiveTeam: FieldTeam;
}) {
    const scoringSide = opposite(offensiveTeam);
    const goalLineX = getPositionFromFieldPosition({
        side: scoringSide,
        yards: 0,
    });

    const radius = Math.max(0, player.radius ?? 0);
    const brokePlane =
        calculateDirectionalGain(offensiveTeam, player.x - goalLineX) +
            radius >=
        0;

    const isTouchdown =
        !isOutOfBounds(player) &&
        brokePlane &&
        intersectsEndZone(player, scoringSide);

    return isTouchdown;
}

export function processDownEvent({
    event,
    onFirstDown,
    onNextDown,
    onTurnoverOnDowns,
}: {
    event: DownEvent;
    onFirstDown: () => void;
    onNextDown: {
        onYardsGained: (yardsGained: number) => void;
        onNoGain: () => void;
        onLoss: (yardsLost: number) => void;
    };
    onTurnoverOnDowns: () => void;
}) {
    switch (event.type) {
        case "FIRST_DOWN":
            onFirstDown();
            break;
        case "NEXT_DOWN":
            if (event.yardsGained === 0) {
                onNextDown.onNoGain();
            } else if (event.yardsGained > 0) {
                onNextDown.onYardsGained(event.yardsGained);
            } else {
                onNextDown.onLoss(-event.yardsGained);
            }
            break;
        case "TURNOVER_ON_DOWNS":
            onTurnoverOnDowns();
            break;
        default:
            break;
    }
}

export function processDownEventIncrement({
    event,
    onNextDown,
    onTurnoverOnDowns,
}: {
    event: DownEventIncrement;
    onNextDown: () => void;
    onTurnoverOnDowns: () => void;
}) {
    switch (event.type) {
        case "NEXT_DOWN":
            onNextDown();
            break;
        case "TURNOVER_ON_DOWNS":
            onTurnoverOnDowns();
            break;
        default:
            break;
    }
}
