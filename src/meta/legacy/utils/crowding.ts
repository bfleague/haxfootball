export type CrowdingEntry = {
    playerId: number;
    startedAt: number;
    endedAt?: number;
};

export type CrowdingData = {
    outer: CrowdingEntry[];
    inner: CrowdingEntry[];
    startedAt?: number;
};
