import { FieldTeam, Team } from "@runtime/models";
import { defineGlobalSchema } from "@runtime/global";

const initialState = {
    scores: {
        [Team.RED]: 0,
        [Team.BLUE]: 0,
    },
};

export const legacyGlobalSchema = defineGlobalSchema({
    state: initialState,
    actions: {
        incrementScore: (state, team: FieldTeam, points: number) => ({
            ...state,
            scores: {
                ...state.scores,
                [team]: state.scores[team] + points,
            },
        }),
    },
});
