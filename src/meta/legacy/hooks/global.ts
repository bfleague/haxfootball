import { $effect } from "@common/runtime";
import { getGlobalState, GlobalState, GlobalStore } from "@meta/legacy/global";

export function $global(fn: (state: GlobalStore) => void): void;
export function $global(): GlobalState;
export function $global(fn?: (state: GlobalStore) => void): GlobalState | void {
    const globalState = getGlobalState();

    if (fn) {
        $effect(() => {
            fn(globalState);
        });

        return;
    }

    return globalState;
}
