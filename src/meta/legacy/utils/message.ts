import { plural, t } from "@lingui/core/macro";
import { DownState } from "./down";
import { FieldPosition } from "@common/utils";
import { Team } from "@common/models";
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

export function cn(...strings: (number | string | DownState)[]): string {
    return strings
        .filter((s) => s !== "")
        .map((s) => {
            switch (typeof s) {
                case "number":
                    return s.toString();
                case "string":
                    return s;
                default:
                    return stringifyDownState(s);
            }
        })
        .join(` ${DIV} `);
}
