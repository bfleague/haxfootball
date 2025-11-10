import { Team } from "@common/models";
import {
    calculateFieldPosition,
    calculatePositionFromFieldPosition,
    FieldPosition,
} from "@common/utils";

const MapMeasures = {
    END_ZONE_RED: {
        topLeft: { x: -930, y: -266 },
        bottomRight: { x: -775, y: 266 },
    },
    END_ZONE_BLUE: {
        topLeft: { x: 930, y: -266 },
        bottomRight: { x: 775, y: 266 },
    },
    RED_ZONE_RED: {
        topLeft: { x: -775, y: -266 },
        bottomRight: { x: -462, y: 266 },
    },
    RED_ZONE_BLUE: {
        topLeft: { x: 775, y: 266 },
        bottomRight: { x: 462, y: -266 },
    },
    INNER_FIELD: {
        topLeft: { x: -775, y: -266 },
        bottomRight: { x: 775, y: 266 },
    },
    OUTER_FIELD: {
        topLeft: { x: -930, y: -266 },
        bottomRight: { x: 930, y: 266 },
    },
    RED_GOAL_LINE: {
        start: { x: -930, y: -60 },
        end: { x: -930, y: 60 },
    },
    BLUE_GOAL_LINE: {
        start: { x: 930, y: -60 },
        end: { x: 930, y: 60 },
    },
    GOAL_POST_RADIUS: 4,
    HASHES_HEIGHT: {
        upperY: -80,
        lowerY: 80,
    },
    SINGLE_HASH_HEIGHT: 20,
    RED_END_ZONE_START_POSITION_X: -775,
    BLUE_END_ZONE_START_POSITION_X: 775,
    RED_END_ZONE_LINE_CENTER: { x: -775, y: 0 },
    BLUE_END_ZONE_LINE_CENTER: { x: 775, y: 0 },
    YARD: 15.5,
    HASH_SUBDIVISION: 31,
    YARDS_BETWEEN_0_MARK_AND_GOAL_LINE: 10,
};

export const BALL_OFFSET_YARDS = 2;

export function getFieldPosition(
    x: number,
    startX = MapMeasures.RED_END_ZONE_START_POSITION_X,
    endX = MapMeasures.BLUE_END_ZONE_START_POSITION_X,
    yardLength = MapMeasures.YARD,
): FieldPosition {
    return calculateFieldPosition(x, startX, endX, yardLength);
}

export function getPositionFromFieldPosition(
    fieldPos: FieldPosition,
    startX = MapMeasures.RED_END_ZONE_LINE_CENTER.x,
    endX = MapMeasures.BLUE_END_ZONE_LINE_CENTER.x,
    yardLength = MapMeasures.YARD,
): number {
    return calculatePositionFromFieldPosition(
        fieldPos,
        startX,
        endX,
        yardLength,
    );
}

export function getBallPositionWithOffset(
    forTeam: Team,
    ballPos: number,
    offsetYards = BALL_OFFSET_YARDS,
    yardLength = MapMeasures.YARD,
): number {
    return ballPos + yardLength * offsetYards * (forTeam === Team.RED ? -1 : 1);
}
