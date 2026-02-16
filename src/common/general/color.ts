export const PALETTE = {
    CORAL: 0xff6347,
    ORANGE: 0xffa500,
    EMERALD: 0x50e860,
    YELLOW: 0xffff00,
    PINK: 0xffc0cb,
    MINT: 0x90ee90,
    CHARTREUSE: 0xc8ff00,
    SKY_BLUE: 0x00bfff,
    HOT_PINK: 0xff69b4,
    SCARLET: 0xff4c4c,
    LAVENDER: 0xc4a5ff,
    GOLD: 0xffd700,
    PEACH: 0xffb088,
    CYAN: 0x00ffff,
    NEON_GREEN: 0x4efca2,
    ICE_BLUE: 0x88ddff,
    AMBER: 0xf2cc00,
} as const;

export const COLOR = {
    ERROR: PALETTE.CORAL,
    WARNING: PALETTE.ORANGE,
    SUCCESS: PALETTE.EMERALD,
    ALERT: PALETTE.YELLOW,
    SYSTEM: PALETTE.PINK,
    READY: PALETTE.MINT,
    ACTION: PALETTE.SKY_BLUE,
    MOMENTUM: PALETTE.CHARTREUSE,
    ADMIN: PALETTE.HOT_PINK,
    CRITICAL: PALETTE.SCARLET,
    STEADY: PALETTE.LAVENDER,
    HIGHLIGHT: PALETTE.GOLD,
    RECORDING: PALETTE.PEACH,
    SPECIAL: PALETTE.CYAN,
    IN_PLAY: PALETTE.NEON_GREEN,
    METRIC: PALETTE.ICE_BLUE,
    MILESTONE: PALETTE.AMBER,
} as const;

export function hexColorToNumber(hex: string): number {
    const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
    return Number(normalized);
}
