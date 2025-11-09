export enum Team {
    SPECTATORS = 0,
    RED = 1,
    BLUE = 2,
}

export interface Player {
    id: number;
    name: string;
    team: Team;
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
    dispose?: () => void;
}
