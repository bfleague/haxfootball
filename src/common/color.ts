export function hexColorToNumber(hex: string): number {
    const normalized = hex.startsWith("0x") ? hex : `0x${hex}`;
    return Number(normalized);
}
