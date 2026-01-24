export enum Team {
    SPECTATORS = 0,
    RED = 1,
    BLUE = 2,
}

export type FieldTeam = Team.RED | Team.BLUE;

export function isFieldTeam(team: Team | number): team is FieldTeam {
    return team === Team.RED || team === Team.BLUE;
}

export interface Player {
    id: number;
    name: string;
    team: FieldTeam;
    x: number;
    y: number;
    radius: number;
    isKickingBall: boolean;
}

export interface Ball {
    x: number;
    y: number;
}

export interface State {
    run: (state: any) => void;
}
