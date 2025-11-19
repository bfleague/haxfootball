import { FieldTeam } from "@common/models";
import { FieldPosition, opposite } from "@common/utils";
import { calculateYardsGained } from "./stadium";

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
