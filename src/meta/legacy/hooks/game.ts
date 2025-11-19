import { $effect } from "@common/runtime";
import { FieldPosition } from "@common/utils";
import {
    getLineOfScrimmage,
    SPECIAL_HIDDEN_POSITION,
} from "@meta/legacy/utils/stadium";

export function $setLineOfScrimmage(fieldPos: FieldPosition) {
    $effect(($) => {
        const lineOfScrimmage = getLineOfScrimmage(fieldPos);

        lineOfScrimmage.forEach(({ id, position }) => {
            $.setDiscProperties(id, {
                x: position.x,
                y: position.y,
            });
        });
    });
}

export function $unsetLineOfScrimmage() {
    $effect(($) => {
        const lineOfScrimmage = getLineOfScrimmage();

        lineOfScrimmage.forEach(({ id }) => {
            $.setDiscProperties(id, SPECIAL_HIDDEN_POSITION);
        });
    });
}
