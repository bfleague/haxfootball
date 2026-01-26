import { mask } from "@common/physics";
import { pairList, repeat } from "@common/general";
import { pos } from "@common/math";
import { defineStadium, type StadiumSchema } from "@stadium/stadium-generator";
import {
    anchorsFromPairs,
    getIndexByName,
    jointsFromPairs,
    line,
    pairedIndexes,
    vLine,
} from "@stadium/utils";

export const BALL_RADIUS = 7.75;
export const BALL_COLOR = "631515";

const YARD_LINE_BASE = {
    yStart: -266,
    yEnd: 266,
    vertex: { cMask: [] },
};

const YARD_LINE_WHITE = {
    extend: YARD_LINE_BASE,
    segment: { color: "FFFFFF", cMask: [] },
};

const YARD_LINE_RED = {
    extend: YARD_LINE_BASE,
    segment: { color: "d0312d", cMask: [] },
};

const YARD_LINE_YELLOW = {
    extend: YARD_LINE_BASE,
    segment: { color: "ffea00", cMask: [] },
};

const YARD_LINE_GREEN = {
    extend: YARD_LINE_BASE,
    segment: { color: "acde97", cMask: [] },
};

const HASH_MARK_BASE = {
    segment: { color: "d7e3cf", cMask: [] },
    vertex: { cMask: [] },
};

const HASH_MARK_TOP_BASE = { extend: HASH_MARK_BASE, yStart: 80, yEnd: 60 };

const HASH_MARK_BOTTOM_BASE = {
    extend: HASH_MARK_BASE,
    yStart: -60,
    yEnd: -80,
};

const TICK_MARK_BASE = {
    segment: { color: "FFFFFF", cMask: [] },
    vertex: { cMask: [] },
};

const TICK_MARK_TOP_BASE = {
    extend: TICK_MARK_BASE,
    yStart: 266,
    yEnd: 241,
};

const TICK_MARK_BOTTOM_BASE = {
    extend: TICK_MARK_BASE,
    yStart: -241,
    yEnd: -266,
};

const TICK_MARK_GREEN_SEGMENT = {
    segment: { color: "C7E6BD", cMask: [] },
};

const COLLISION_SIDELINE_BASE = {
    segment: {
        vis: false,
        color: "ffea00",
        bCoef: 0.1,
        cMask: mask("red", "blue"),
        cGroup: [],
    },
    vertex: { cMask: [] },
    yStart: -375,
    yEnd: 375,
};

const GOAL_POST_SEGMENT = { color: "ffea00", cMask: [] };
const GOAL_POST_VERTEX = { cMask: [] };
const GOAL_POST_VERTICAL_BASE = {
    segment: GOAL_POST_SEGMENT,
    vertex: GOAL_POST_VERTEX,
    yStart: -60,
    yEnd: 60,
};

const GOAL_POST_LINE_BASE = {
    segment: GOAL_POST_SEGMENT,
    from: { vertex: GOAL_POST_VERTEX },
    to: { vertex: GOAL_POST_VERTEX },
};

const BALL_BOUNDARY_BASE = {
    yStart: 360,
    yEnd: -360,
    segment: { vis: false, cMask: mask("ball") },
};

const BALL_BOUNDARY_LEFT_BASE = {
    extend: BALL_BOUNDARY_BASE,
    segment: { color: "FF" },
};

const BALL_BOUNDARY_RIGHT_BASE = {
    extend: BALL_BOUNDARY_BASE,
    segment: { color: "d0312d" },
};

const schema = {
    name: "HaxFootball (Legacy)",
    canBeStored: false,
    width: 1090,
    height: 395,
    bg: {
        type: "grass",
        width: 930,
        height: 266,
    },
    goals: [
        {
            p0: [-1065, 0],
            p1: [-1005, 0],
            team: "blue",
        },
        {
            p0: [1006.9833374023, 1.6000061035156],
            p1: [1063.9833374023, 1.6000061035156],
            team: "red",
        },
    ],
    playerPhysics: {
        bCoef: 0.5,
        invMass: 1e26,
        kickStrength: 7,
    },
    ballPhysics: {
        radius: BALL_RADIUS,
        bCoef: 0.5,
        cMask: ["red", "blue", "wall"],
        color: "631515",
        cGroup: ["ball", "kick", "score"],
    },
    cameraFollow: "player",
    spawnDistance: 980,
    traits: {},
    redSpawnPoints: [],
    blueSpawnPoints: [],
    rects: [
        {
            name: "fieldBounds",
            x: [-930, 930],
            y: [-266, 266],
            segment: { color: "FFFFFF", cMask: [] },
            vertex: { cMask: [] },
        },
    ],
    lines: [
        vLine({
            extend: COLLISION_SIDELINE_BASE,
            x: -775,
        }),
        vLine({
            extend: COLLISION_SIDELINE_BASE,
            x: 775,
        }),
        vLine({
            extend: YARD_LINE_YELLOW,
            x: -775,
            name: "leftGoalLine",
        }),
        vLine({
            extend: YARD_LINE_WHITE,
            x: -620,
        }),
        vLine({
            extend: YARD_LINE_RED,
            x: -465,
        }),
        vLine({
            extend: YARD_LINE_WHITE,
            x: -310,
        }),
        vLine({
            extend: YARD_LINE_WHITE,
            x: -155,
        }),
        vLine({
            extend: YARD_LINE_WHITE,
            x: 155,
        }),
        vLine({
            extend: YARD_LINE_WHITE,
            x: 310,
        }),
        vLine({
            extend: YARD_LINE_RED,
            x: 465,
        }),
        vLine({
            extend: YARD_LINE_WHITE,
            x: 620,
        }),
        vLine({
            extend: YARD_LINE_YELLOW,
            x: 775,
            name: "rightGoalLine",
        }),
        vLine({
            extend: YARD_LINE_GREEN,
            x: 0,
            name: "midfieldLine",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -744,
            name: "hashMarkTop0",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -744,
            name: "hashMarkBottom0",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -713,
            name: "hashMarkTop1",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -713,
            name: "hashMarkBottom1",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -682,
            name: "hashMarkTop2",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -682,
            name: "hashMarkBottom2",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -651,
            name: "hashMarkTop3",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -651,
            name: "hashMarkBottom3",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -589,
            name: "hashMarkTop4",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -589,
            name: "hashMarkBottom4",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -558,
            name: "hashMarkTop5",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -558,
            name: "hashMarkBottom5",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -527,
            name: "hashMarkTop6",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -527,
            name: "hashMarkBottom6",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -496,
            name: "hashMarkTop7",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -496,
            name: "hashMarkBottom7",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -434,
            name: "hashMarkTop8",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -434,
            name: "hashMarkBottom8",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -403,
            name: "hashMarkTop9",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -403,
            name: "hashMarkBottom9",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -372,
            name: "hashMarkTop10",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -372,
            name: "hashMarkBottom10",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -341,
            name: "hashMarkTop11",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -341,
            name: "hashMarkBottom11",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -279,
            name: "hashMarkTop12",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -279,
            name: "hashMarkBottom12",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -248,
            name: "hashMarkTop13",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -248,
            name: "hashMarkBottom13",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -217,
            name: "hashMarkTop14",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -217,
            name: "hashMarkBottom14",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -186,
            name: "hashMarkTop15",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -186,
            name: "hashMarkBottom15",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -124,
            name: "hashMarkTop16",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -124,
            name: "hashMarkBottom16",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -93,
            name: "hashMarkTop17",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -93,
            name: "hashMarkBottom17",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -62,
            name: "hashMarkTop18",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -62,
            name: "hashMarkBottom18",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: -31,
            name: "hashMarkTop19",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: -31,
            name: "hashMarkBottom19",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 31,
            name: "hashMarkTop20",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 31,
            name: "hashMarkBottom20",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 62,
            name: "hashMarkTop21",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 62,
            name: "hashMarkBottom21",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 93,
            name: "hashMarkTop22",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 93,
            name: "hashMarkBottom22",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 124,
            name: "hashMarkTop23",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 124,
            name: "hashMarkBottom23",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 186,
            name: "hashMarkTop24",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 186,
            name: "hashMarkBottom24",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 217,
            name: "hashMarkTop25",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 217,
            name: "hashMarkBottom25",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 248,
            name: "hashMarkTop26",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 248,
            name: "hashMarkBottom26",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 279,
            name: "hashMarkTop27",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 279,
            name: "hashMarkBottom27",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 341,
            name: "hashMarkTop28",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 341,
            name: "hashMarkBottom28",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 372,
            name: "hashMarkTop29",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 372,
            name: "hashMarkBottom29",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 403,
            name: "hashMarkTop30",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 403,
            name: "hashMarkBottom30",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 434,
            name: "hashMarkTop31",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 434,
            name: "hashMarkBottom31",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 496,
            name: "hashMarkTop32",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 496,
            name: "hashMarkBottom32",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 527,
            name: "hashMarkTop33",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 527,
            name: "hashMarkBottom33",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 558,
            name: "hashMarkTop34",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 558,
            name: "hashMarkBottom34",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 589,
            name: "hashMarkTop35",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 589,
            name: "hashMarkBottom35",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 651,
            name: "hashMarkTop36",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 651,
            name: "hashMarkBottom36",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 682,
            name: "hashMarkTop37",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 682,
            name: "hashMarkBottom37",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 713,
            name: "hashMarkTop38",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 713,
            name: "hashMarkBottom38",
        }),
        vLine({
            extend: HASH_MARK_TOP_BASE,
            x: 744,
            name: "hashMarkTop39",
        }),
        vLine({
            extend: HASH_MARK_BOTTOM_BASE,
            x: 744,
            name: "hashMarkBottom39",
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: -697.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: -697.5,
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: -542.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: -542.5,
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: -387.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: -387.5,
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: -232.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: -232.5,
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: -77.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: -77.5,
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: 77.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: 77.5,
        }),
        vLine({
            extend: [TICK_MARK_TOP_BASE, TICK_MARK_GREEN_SEGMENT],
            x: 232.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: 232.5,
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: 387.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: 387.5,
        }),
        vLine({
            extend: [TICK_MARK_TOP_BASE, TICK_MARK_GREEN_SEGMENT],
            x: 542.5,
        }),
        vLine({
            extend: TICK_MARK_BOTTOM_BASE,
            x: 542.5,
        }),
        vLine({
            extend: TICK_MARK_TOP_BASE,
            x: 697.5,
        }),
        vLine({
            extend: [TICK_MARK_BOTTOM_BASE, TICK_MARK_GREEN_SEGMENT],
            x: 697.5,
        }),
        vLine({
            extend: GOAL_POST_VERTICAL_BASE,
            x: -930,
        }),
        vLine({
            extend: GOAL_POST_VERTICAL_BASE,
            x: 930,
        }),
        line({
            extend: GOAL_POST_LINE_BASE,
            from: { x: -930, y: -60 },
            to: { x: -980, y: -130 },
        }),
        line({
            extend: GOAL_POST_LINE_BASE,
            from: { x: -930, y: 60 },
            to: { x: -990, y: -10 },
        }),
        line({
            extend: GOAL_POST_LINE_BASE,
            from: { x: 930, y: -60 },
            to: { x: 980, y: -130 },
        }),
        line({
            extend: GOAL_POST_LINE_BASE,
            from: { x: 930, y: 60 },
            to: { x: 990, y: -10 },
        }),
        vLine({
            extend: BALL_BOUNDARY_LEFT_BASE,
            x: -1005,
        }),
        vLine({
            extend: BALL_BOUNDARY_RIGHT_BASE,
            x: 1005,
        }),
    ],
    planes: [
        {
            rect: { x: [-1065, 1065], y: [-350, 350] },
            side: "outside",
            props: { cMask: ["ball"] },
        },
        {
            rect: { x: [-1090, 1090], y: [-375, 375] },
            side: "outside",
            props: { bCoef: 0.9 },
        },
        {
            line: "leftGoalLine",
            side: "right",
            props: { cMask: ["c0"] },
        },
        {
            line: "rightGoalLine",
            side: "left",
            props: { cMask: ["c1"] },
        },
        {
            normal: [-1, 0],
            dist: 0,
            cMask: ["c2"],
        },
        {
            normal: [1, 0],
            dist: 0,
            cMask: ["c3"],
        },
    ],
    discs: [
        {
            radius: 4,
            invMass: 0,
            pos: pos(930, -60),
            color: "FFFF00",
        },
        {
            radius: 4,
            invMass: 0,
            pos: pos(-930, -60),
            color: "FFFF00",
        },
        {
            radius: 4,
            invMass: 0,
            pos: pos(-930, 60),
            color: "FFFF00",
        },
        {
            radius: 4,
            invMass: 0,
            pos: pos(930, 60),
            color: "FFFF00",
        },
        ...repeat(28, {
            radius: 0,
            invMass: 1,
            pos: pos(0, 0),
            color: "transparent",
            cGroup: [],
        }),
        ...repeat(4, {
            radius: 1,
            invMass: 1,
            pos: pos(9999, 9999),
            color: "FF0000",
            cGroup: [],
        }),
        ...repeat(12, {
            radius: 0,
            invMass: 1,
            pos: pos(0, 0),
            color: "transparent",
            cGroup: [],
        }),
        ...repeat(2, {
            radius: 1,
            invMass: 1,
            pos: pos(9999, 9999),
            color: "f5f5f5",
            cGroup: [],
        }),
        ...repeat(2, {
            radius: 7.125,
            invMass: 0,
            pos: pos(2000, 2000),
            color: "FFAA00",
            cGroup: [],
            cMask: [],
        }),
        ...repeat(3, {
            radius: 1,
            invMass: 1,
            pos: pos(9999, 9999),
            color: "f5f5f5",
            cGroup: [],
        }),
        ...repeat(4, {
            radius: 0,
            invMass: 1,
            pos: pos(0, 0),
            color: "transparent",
            cGroup: [],
        }),
    ],
    anchors: [
        ...anchorsFromPairs({ prefix: "orange", pairs: pairList([5, 6]) }),
        ...anchorsFromPairs({ prefix: "blue", pairs: pairList([7, 8]) }),
        ...anchorsFromPairs({ prefix: "ball", pairs: pairList([50, 51]) }),
        ...anchorsFromPairs({
            prefix: "red",
            pairs: pairedIndexes({ start: 9, count: 12 }),
        }),
        ...anchorsFromPairs({
            prefix: "white",
            pairs: pairedIndexes({ start: 37, count: 6 }),
        }),
        ...anchorsFromPairs({
            prefix: "tail",
            pairs: pairList([56, 57], [58, 59]),
        }),
        { name: "outerCrowdingCorner0", index: 33 },
        { name: "outerCrowdingCorner1", index: 34 },
        { name: "outerCrowdingCorner2", index: 35 },
        { name: "outerCrowdingCorner3", index: 36 },
        { name: "innerCrowdingCorner0", index: 49 },
        { name: "innerCrowdingCorner1", index: 53 },
        { name: "innerCrowdingCorner2", index: 54 },
        { name: "innerCrowdingCorner3", index: 55 },
    ],
    joints: [
        ...jointsFromPairs({
            prefix: "orange",
            pairs: pairList([5, 6]),
            color: "ff9912",
        }),
        ...jointsFromPairs({
            prefix: "blue",
            pairs: pairList([7, 8]),
            color: "3e67cf",
        }),
        ...jointsFromPairs({
            prefix: "ball",
            pairs: pairList([50, 51]),
            color: "FFAA00",
        }),
        ...jointsFromPairs({
            prefix: "red",
            pairs: pairedIndexes({ start: 9, count: 12 }),
            color: "FF0000",
        }),
        ...jointsFromPairs({
            prefix: "white",
            pairs: pairedIndexes({ start: 37, count: 6 }),
            color: "f5f5f5",
        }),
        ...jointsFromPairs({
            prefix: "tail",
            pairs: pairList([56, 57], [58, 59]),
            color: "f5f5f5",
        }),
    ],
} satisfies StadiumSchema;

export const { stadium: legacyStadium, index: legacyStadiumIndex } =
    defineStadium(schema);

export const index = (name: string): number =>
    getIndexByName(legacyStadiumIndex, name);
