import { FieldTeam, Team } from "@runtime/models";
import { createStore } from "zustand/vanilla";

export type GlobalState = {
    scores: {
        [Team.RED]: number;
        [Team.BLUE]: number;
    };
};

export type GlobalStateActions = {
    incrementScore: (team: FieldTeam, points: number) => void;
};

export type GlobalStore = GlobalState & GlobalStateActions;

function createGlobalStore() {
    return createStore<GlobalStore>((set) => ({
        scores: {
            [Team.RED]: 0,
            [Team.BLUE]: 0,
        },
        incrementScore: (team: FieldTeam, points: number) =>
            set((state) => ({
                scores: {
                    ...state.scores,
                    [team]: state.scores[team] + points,
                },
            })),
    }));
}

let globalState: ReturnType<typeof createGlobalStore> | null = null;

export function initializeGlobalState() {
    globalState = createGlobalStore();
}

export function getGlobalState() {
    if (!globalState) {
        throw new Error("Global state used before initialization");
    }

    return globalState.getState();
}
