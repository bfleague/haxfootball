import { repeat } from "@common/general";
import { pos } from "@common/math";
import { mask } from "@common/physics";
import { buildStadium } from "@stadium-builder/stadium-builder";
import type { Pair } from "@common/types";
import type { CollisionFlag } from "@haxball/stadium";
import { getDynamicLine, getIndexByName } from "@stadium/utils";

export const BALL_RADIUS = 7.75;
export const BALL_COLOR = "631515";

export const PLANE_MASK_BY_NAME = {
    redEndZoneTrap: "c0",
    blueEndZoneTrap: "c1",
    midfieldPlaneRed: "c2",
    midfieldPlaneBlue: "c3",
} satisfies Record<string, CollisionFlag>;

export type PlaneMaskName = keyof typeof PLANE_MASK_BY_NAME;

export const {
    stadium: legacyStadium,
    index: legacyStadiumIndex,
    mapMeasures: legacyMapMeasures,
} = buildStadium({
    measures: {
        name: "Legacy",
        size: { width: 1090, height: 395 },
        field: { width: 1860, height: 532 },
        endZones: { depth: 155 },
        goal: { width: 120 },
        yard: {
            length: 15.5,
            lines: {
                intervalYards: 10,
                redZoneYards: 20,
            },
        },
        hashMarks: {
            bandTopY: -80,
            bandBottomY: 80,
            markHeight: 20,
            subdivisionYards: 2,
        },
        ticks: {
            height: 25,
            offsetYards: 5,
            greenTopYards: [65, 85],
            greenBottomYards: [95],
        },
    },
    colors: {
        yard: {
            default: "FFFFFF",
            goal: "FFEA00",
            redZone: "D0312D",
            midfield: "ACDE97",
        },
        hash: "D7E3CF",
        tick: "FFFFFF",
        tickGreen: "C7E6BD",
    },
    features: {
        collisionSidelines: {
            leftX: -775,
            rightX: 775,
            topY: -375,
            bottomY: 375,
            segment: {
                vis: false,
                color: "FFEA00",
                bCoef: 0.1,
                cMask: mask("red", "blue"),
                cGroup: [],
            },
            vertex: { cMask: [] },
        },
        goalPosts: {
            leftX: -930,
            rightX: 930,
            topY: -60,
            bottomY: 60,
            segment: { color: "FFEA00", cMask: [] },
            vertex: { cMask: [] },
            diagonals: [
                { from: [-930, -60], to: [-980, -130] },
                { from: [-930, 60], to: [-990, -10] },
                { from: [930, -60], to: [980, -130] },
                { from: [930, 60], to: [990, -10] },
            ],
            disc: {
                radius: 4,
                invMass: 0,
                color: "FFFF00",
            },
        },
        ballBoundaries: {
            leftX: -1005,
            rightX: 1005,
            topY: 360,
            bottomY: -360,
            leftSegment: { vis: false, color: "0000FF", cMask: mask("ball") },
            rightSegment: {
                vis: false,
                color: "D0312D",
                cMask: mask("ball"),
            },
        },
        planes: [
            {
                rect: { x: [-1065, 1065], y: [-350, 350] },
                side: "outside",
                props: { cMask: ["ball"] },
                name: "ballOutOfBounds",
            },
            {
                rect: { x: [-1090, 1090], y: [-375, 375] },
                side: "outside",
                props: { bCoef: 0.9 },
                name: "fieldWall",
            },
            {
                line: "leftGoalLine",
                side: "right",
                props: { cMask: [PLANE_MASK_BY_NAME.redEndZoneTrap] },
                name: "redEndZoneTrap",
            },
            {
                line: "rightGoalLine",
                side: "left",
                props: { cMask: [PLANE_MASK_BY_NAME.blueEndZoneTrap] },
                name: "blueEndZoneTrap",
            },
            {
                normal: [-1, 0],
                dist: 0,
                cMask: [PLANE_MASK_BY_NAME.midfieldPlaneRed],
                name: "midfieldPlaneRed",
            },
            {
                normal: [1, 0],
                dist: 0,
                cMask: [PLANE_MASK_BY_NAME.midfieldPlaneBlue],
                name: "midfieldPlaneBlue",
            },
        ],
    },
    schema: {
        canBeStored: false,
        playerPhysics: {
            bCoef: 0.5,
            invMass: 1e26,
            kickStrength: 7,
        },
        ballPhysics: {
            radius: BALL_RADIUS,
            bCoef: 0.5,
            cMask: ["red", "blue", "wall"],
            color: BALL_COLOR,
            cGroup: ["ball", "kick", "score"],
        },
        spawnDistance: 980,
        traits: {},
        redSpawnPoints: [],
        blueSpawnPoints: [],
        dynamicLines: [
            {
                name: "orange0",
                joint: { color: "FF9912" },
            },
            {
                name: "blue0",
                joint: { color: "3E67CF" },
            },
            {
                name: "ball0",
                disc: {
                    radius: 7.125,
                    invMass: 0,
                    pos: pos(2000, 2000),
                    color: "FFAA00",
                    cGroup: [],
                    cMask: [],
                },
                joint: { color: "FFAA00" },
            },
            ...repeat(12, (index) => ({
                name: `red${index}`,
                joint: { color: "FF0000" },
            })),
            ...repeat(6, (index) => ({
                name: `white${index}`,
                joint: { color: "F5F5F5" },
            })),
            ...repeat(2, (index) => ({
                name: `tail${index}`,
                joint: { color: "F5F5F5" },
            })),
        ],
        anchors: [
            {
                name: "outerCrowdingCorner0",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "FF0000",
                    cGroup: [],
                },
            },
            {
                name: "outerCrowdingCorner1",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "FF0000",
                    cGroup: [],
                },
            },
            {
                name: "outerCrowdingCorner2",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "FF0000",
                    cGroup: [],
                },
            },
            {
                name: "outerCrowdingCorner3",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "FF0000",
                    cGroup: [],
                },
            },
            {
                name: "innerCrowdingCorner0",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "F5F5F5",
                    cGroup: [],
                },
            },
            {
                name: "innerCrowdingCorner1",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "F5F5F5",
                    cGroup: [],
                },
            },
            {
                name: "innerCrowdingCorner2",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "F5F5F5",
                    cGroup: [],
                },
            },
            {
                name: "innerCrowdingCorner3",
                disc: {
                    radius: 1,
                    invMass: 1,
                    pos: pos(9999, 9999),
                    color: "F5F5F5",
                    cGroup: [],
                },
            },
        ],
    },
});

const STADIUM_DISC_INDEX_OFFSET = 1;

export const index = (name: string): number =>
    getIndexByName(legacyStadiumIndex, name) + STADIUM_DISC_INDEX_OFFSET;

export const lineIndex = (name: string): Pair<number> => {
    const [d0, d1] = getDynamicLine(legacyStadiumIndex, name);

    return [d0 + STADIUM_DISC_INDEX_OFFSET, d1 + STADIUM_DISC_INDEX_OFFSET];
};
