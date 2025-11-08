import { StadiumObject } from "@haxball/stadium";

export class Room {
    constructor(private room: RoomObject) {}

    public send({
        message,
        color = null,
        to,
        style = "normal",
        sound = "normal",
    }: {
        message: string;
        to?: number | null;
        color?: number | null;
        style?: ChatStyle;
        sound?: ChatSoundString;
    }): void {
        this.room.sendAnnouncement(
            message,
            to,
            color,
            style,
            toChatSound(sound),
        );
    }

    public chat(message: string, to?: number | null): void {
        this.room.sendChat(message, to);
    }

    public setAdmin(player: PlayerObject, admin: boolean): void;
    public setAdmin(playerId: number, admin: boolean): void;
    public setAdmin(player: number | PlayerObject, admin: boolean): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerAdmin(playerId, admin);
    }

    public setTeam(player: PlayerObject, team: TeamID): void;
    public setTeam(playerId: number, team: TeamID): void;
    public setTeam(player: number | PlayerObject, team: TeamID): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerTeam(playerId, team);
    }

    public kick(player: PlayerObject, reason?: string): void;
    public kick(player: number, reason?: string): void;
    public kick(player: number | PlayerObject, reason = ""): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.kickPlayer(playerId, reason, false);
    }

    public ban(player: PlayerObject, reason?: string): void;
    public ban(player: number, reason?: string): void;
    public ban(player: number | PlayerObject, reason = ""): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.kickPlayer(playerId, reason, true);
    }

    public clearBan(playerId: number): void {
        this.room.clearBan(playerId);
    }

    public clearBans(): void {
        this.room.clearBans();
    }

    public getPlayer(playerId: number): PlayerObject | null {
        return this.room.getPlayer(playerId);
    }

    public getPlayerList(): PlayerObject[] {
        return this.room.getPlayerList();
    }

    public reorderPlayers(
        playerIds: number[],
        moveToTop: boolean = true,
    ): void {
        this.room.reorderPlayers(playerIds, moveToTop);
    }

    public setAvatar(player: PlayerObject, avatar: string | null): void;
    public setAvatar(playerId: number, avatar: string | null): void;
    public setAvatar(
        player: number | PlayerObject,
        avatar: string | null,
    ): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerAvatar(playerId, avatar);
    }

    public startGame(): void {
        this.room.startGame();
    }

    public stopGame(): void {
        this.room.stopGame();
    }

    public pauseGame(paused: boolean = true): void {
        this.room.pauseGame(paused);
    }

    public unpauseGame(): void {
        this.room.pauseGame(false);
    }

    public getScores(): ScoresObject | null {
        return this.room.getScores();
    }

    public setScoreLimit(limit: number): void {
        this.room.setScoreLimit(limit);
    }

    public setTimeLimit(limitInMinutes: number): void {
        this.room.setTimeLimit(limitInMinutes);
    }

    public setStadium(stadiumFileContents: StadiumObject): void {
        this.room.setCustomStadium(JSON.stringify(stadiumFileContents));
    }

    public setTeamsLock(locked: boolean): void {
        this.room.setTeamsLock(locked);
    }

    public lockTeams(): void {
        this.room.setTeamsLock(true);
    }

    public unlockTeams(): void {
        this.room.setTeamsLock(false);
    }

    public setTeamColors(
        team: TeamID,
        angle: number,
        textColor: number,
        colors: number[],
    ): void {
        this.room.setTeamColors(team, angle, textColor, colors);
    }

    public setPassword(password: string | null): void {
        this.room.setPassword(password);
    }

    public removePassword(): void {
        this.room.setPassword(null);
    }

    public setRequireRecaptcha(required: boolean): void {
        this.room.setRequireRecaptcha(required);
    }

    public setKickRateLimit(min: number, rate: number, burst: number): void {
        this.room.setKickRateLimit(min, rate, burst);
    }

    public getBallPosition(): Position | null {
        return this.room.getBallPosition();
    }

    public getDiscCount(): number {
        return this.room.getDiscCount();
    }

    public getDiscProperties(discIndex: number): DiscPropertiesObject | null {
        return this.room.getDiscProperties(discIndex);
    }

    public setDiscProperties(
        discIndex: number,
        properties: DiscPropertiesObject,
    ): void {
        this.room.setDiscProperties(discIndex, properties);
    }

    public getPlayerDiscProperties(
        player: PlayerObject,
    ): DiscPropertiesObject | null;
    public getPlayerDiscProperties(
        playerId: number,
    ): DiscPropertiesObject | null;
    public getPlayerDiscProperties(
        player: number | PlayerObject,
    ): DiscPropertiesObject | null {
        const playerId = typeof player === "number" ? player : player.id;
        return this.room.getPlayerDiscProperties(playerId);
    }

    public setPlayerDiscProperties(
        player: PlayerObject,
        properties: DiscPropertiesObject,
    ): void;
    public setPlayerDiscProperties(
        playerId: number,
        properties: DiscPropertiesObject,
    ): void;
    public setPlayerDiscProperties(
        player: number | PlayerObject,
        properties: DiscPropertiesObject,
    ): void {
        const playerId = typeof player === "number" ? player : player.id;
        this.room.setPlayerDiscProperties(playerId, properties);
    }

    public startRecording(): void {
        this.room.startRecording();
    }

    public stopRecording(): Uint8Array | null {
        return this.room.stopRecording();
    }

    public get collisionFlags(): CollisionFlagsObject {
        return this.room.CollisionFlags;
    }

    public get raw(): RoomObject {
        return this.room;
    }
}

function toChatSound(sound: ChatSoundString): ChatSounds {
    switch (sound) {
        case "none":
            return 0;
        case "normal":
            return 1;
        case "notification":
            return 2;
    }
}
