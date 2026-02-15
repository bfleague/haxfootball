export const PALETTE = {
    TOMATO: 0xff6347,
    ORANGE: 0xffa500,
    LIME_GREEN: 0x32cd32,
    YELLOW: 0xffff00,
    PINK: 0xffc0cb,
    LIGHT_GREEN: 0x90ee90,
    MEDIUM_SEA_GREEN: 0x3cb371,
    DEEP_SKY_BLUE: 0x00bfff,
    HOT_PINK: 0xff69b4,
    RED: 0xff0000,
    SEA_GREEN: 0x2e8b57,
    GOLD: 0xffd700,
    LIGHT_PINK: 0xffb6c1,
    CYAN: 0x00ffff,
    HIKED: 0x4efca2,
    TURQUOISE: 0x3bbdc4,
    STATS_GOLD: 0xf2cc00,
} as const;

export const COLOR = {
    ERROR: PALETTE.TOMATO,
    WARNING: PALETTE.ORANGE,
    SUCCESS: PALETTE.LIME_GREEN,
    ALERT: PALETTE.YELLOW,
    SYSTEM: PALETTE.PINK,
    READY: PALETTE.LIGHT_GREEN,
    ACTION: PALETTE.DEEP_SKY_BLUE,
    MOMENTUM: PALETTE.MEDIUM_SEA_GREEN,
    ADMIN: PALETTE.HOT_PINK,
    CRITICAL: PALETTE.RED,
    STEADY: PALETTE.SEA_GREEN,
    HIGHLIGHT: PALETTE.GOLD,
    RECORDING: PALETTE.LIGHT_PINK,
    SPECIAL: PALETTE.CYAN,
    IN_PLAY: PALETTE.HIKED,
    METRIC: PALETTE.TURQUOISE,
    MILESTONE: PALETTE.STATS_GOLD,
} as const;

export function hexColorToNumber(hex: string): number {
    const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
    return Number(normalized);
}
