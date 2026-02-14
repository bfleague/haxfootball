import { i18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import { DownState } from "./down";
import { FieldPosition } from "@common/game/game";
import { Team } from "@runtime/models";
import { RED_ZONE_FOUL_LIMIT } from "./penalty";

export const DIV = t`•`;

export function stringifyFieldPosition(fieldPos: FieldPosition): string {
    const teamName = fieldPos.side === Team.RED ? t`Red` : t`Blue`;

    return t`${teamName} ${fieldPos.yards}`;
}

export function stringifyRedZoneFouls(redZoneFouls: number): string {
    return t`${redZoneFouls}/${RED_ZONE_FOUL_LIMIT} ${plural(redZoneFouls, {
        one: "foul",
        other: "fouls",
    })} for automatic touchdown`;
}

type ObjectWithName = { name: string };

type ListFormatCtor = new (
    locales?: string | string[],
    options?: {
        localeMatcher?: "lookup" | "best fit";
        type?: "conjunction" | "disjunction" | "unit";
        style?: "long" | "short" | "narrow";
    },
) => { format: (list: string[]) => string };

export function formatNames(players: ObjectWithName[]): string {
    const names = players.map((player) => player.name).filter((name) => name);

    if (names.length === 0) return "";

    const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor })
        .ListFormat;

    if (ListFormat) {
        try {
            return new ListFormat(i18n.locale, {
                style: "long",
                type: "conjunction",
            }).format(names);
        } catch {
            // Fall back to a simple English list below.
        }
    }

    if (names.length === 1) return names[0] ?? "";
    if (names.length === 2) return t`${names[0]!} and ${names[1]!}`;

    return t`${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]!}`;
}

export function stringifyDownState(downState: DownState): string {
    const downText = t`${plural(downState.downAndDistance.down, {
        one: "1st",
        two: "2nd",
        few: "3rd",
        other: `${downState.downAndDistance.down}th`,
    })} & ${downState.downAndDistance.distance} @ ${stringifyFieldPosition(
        downState.fieldPos,
    )}`;

    return downState.redZoneFouls > 0
        ? cn(downText, stringifyRedZoneFouls(downState.redZoneFouls))
        : downText;
}

function hasAscii(text: string): boolean {
    return /[\x00-\x7F]/.test(text);
}

export function cn(...strings: (number | string | DownState)[]): string {
    const parts = strings
        .filter((s) => s !== "")
        .map((s) => {
            switch (typeof s) {
                case "number":
                    return {
                        text: s.toString(),
                        isDownState: false,
                    };
                case "string":
                    return {
                        text: s,
                        isDownState: false,
                    };
                default:
                    return {
                        text: stringifyDownState(s),
                        isDownState: true,
                    };
            }
        });

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0]?.text ?? "";

    return parts.reduce((message, currentPart, index) => {
        if (index === 0) return currentPart.text;

        const previousPart = parts[index - 1];
        const previousHasAscii = hasAscii(previousPart?.text ?? "");
        const separator =
            currentPart.isDownState && !previousHasAscii ? " " : ` ${DIV} `;

        return `${message}${separator}${currentPart.text}`;
    }, "");
}
