import { Team } from "@common/models";
import {
    calculateFieldPosition,
    calculatePositionFromFieldPosition,
    FieldPosition,
    PointLike,
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

export const BALL_RADIUS = 7.125;
export const BALL_OFFSET_YARDS = 2;

export const SPECIAL_HIDDEN_POSITION = {
    x: 2000,
    y: 2000,
};

export const TOUCHBACK_YARD_LINE = 25;

const SPECIAL_DISC_IDS = {
    LOS: [7, 8],
} as const;

export function getFieldPosition(
    x: number,
    startX = MapMeasures.RED_END_ZONE_START_POSITION_X,
    endX = MapMeasures.BLUE_END_ZONE_START_POSITION_X,
    yardLength = MapMeasures.YARD,
): FieldPosition {
    return calculateFieldPosition(x, startX, endX, yardLength);
}

export function isInMainField(position: Position): boolean {
    return (
        position.x >= MapMeasures.INNER_FIELD.topLeft.x &&
        position.x <= MapMeasures.INNER_FIELD.bottomRight.x
    );
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

export function calculateSnapBallPosition(
    forTeam: Team,
    fieldPos: FieldPosition,
    offsetYards = 0,
    yardLength = MapMeasures.YARD,
): Position {
    return {
        x:
            getPositionFromFieldPosition(fieldPos) +
            yardLength * offsetYards * (forTeam === Team.RED ? -1 : 1),
        y: 0,
    };
}

export function ballWithRadius(
    position: Position,
    radius = BALL_RADIUS,
): PointLike {
    return {
        x: position.x,
        y: position.y,
        radius,
    };
}

export function isOutOfBounds(position: Position): boolean {
    return (
        position.x < MapMeasures.OUTER_FIELD.topLeft.x ||
        position.x > MapMeasures.OUTER_FIELD.bottomRight.x ||
        position.y < MapMeasures.OUTER_FIELD.topLeft.y ||
        position.y > MapMeasures.OUTER_FIELD.bottomRight.y
    );
}

export function getLineOfScrimmage(): { id: number }[];
export function getLineOfScrimmage(
    fieldPos: FieldPosition,
): { id: number; position: Position }[];
export function getLineOfScrimmage(
    fieldPos?: FieldPosition,
): { id: number; position?: Position }[] {
    if (fieldPos === undefined) {
        return [
            { id: SPECIAL_DISC_IDS.LOS[0] },
            { id: SPECIAL_DISC_IDS.LOS[1] },
        ];
    }

    const x = getPositionFromFieldPosition(fieldPos);
    const offset = 2;
    const upperHashY = MapMeasures.INNER_FIELD.topLeft.y + offset;
    const lowerHashY = MapMeasures.INNER_FIELD.bottomRight.y - offset;

    return [
        { id: SPECIAL_DISC_IDS.LOS[0], position: { x, y: upperHashY } },
        { id: SPECIAL_DISC_IDS.LOS[1], position: { x, y: lowerHashY } },
    ];
}

export function xDistanceToYards(xDistance: number): number {
    return Math.round(xDistance / MapMeasures.YARD);
}

export function calculateDirectionalGain(
    offensiveTeam: Team,
    xGained: number,
): number {
    return offensiveTeam === Team.RED ? xGained : -xGained;
}

export function calculateYardsGained(
    offensiveTeam: Team,
    fromFieldPos: FieldPosition,
    toFieldPos: FieldPosition,
): number {
    const fromX = getPositionFromFieldPosition(fromFieldPos);
    const toX = getPositionFromFieldPosition(toFieldPos);
    const xGained = toX - fromX;

    return xDistanceToYards(calculateDirectionalGain(offensiveTeam, xGained));
}
