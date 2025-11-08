export enum Team {
    SPECTATORS = 0,
    RED = 1,
    BLUE = 2,
}

export interface Player {
    id: number;
    team: Team;
    x: number;
    y: number;
    isKickingBall: boolean;
}

export interface Ball {
    x: number;
    y: number;
}

export interface State {
    run: (state: any) => void;
    dispose?: () => void;
}
