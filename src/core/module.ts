import { Room } from "@core/room";

export class Module {
    private events: [string, Function][] = [];

    onPlayerJoin(handler: (room: Room, player: PlayerObject) => void): this {
        this.events.push(["onPlayerJoin", handler]);
        return this;
    }

    onPlayerLeave(handler: (room: Room, player: PlayerObject) => void): this {
        this.events.push(["onPlayerLeave", handler]);
        return this;
    }

    onTeamVictory(handler: (room: Room, scores: ScoresObject) => void): this {
        this.events.push(["onTeamVictory", handler]);
        return this;
    }

    onPlayerChat(
        handler: (
            room: Room,
            player: PlayerObject,
            message: string,
        ) => boolean | void,
    ): this {
        this.events.push(["onPlayerChat", handler]);
        return this;
    }

    onPlayerBallKick(
        handler: (room: Room, player: PlayerObject) => void,
    ): this {
        this.events.push(["onPlayerBallKick", handler]);
        return this;
    }

    onTeamGoal(handler: (room: Room, team: TeamID) => void): this {
        this.events.push(["onTeamGoal", handler]);
        return this;
    }

    onGameStart(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGameStart", handler]);
        return this;
    }

    onGameStop(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGameStop", handler]);
        return this;
    }

    onPlayerAdminChange(
        handler: (
            room: Room,
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onPlayerAdminChange", handler]);
        return this;
    }

    onPlayerTeamChange(
        handler: (
            room: Room,
            changedPlayer: PlayerObject,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onPlayerTeamChange", handler]);
        return this;
    }

    onPlayerKicked(
        handler: (
            room: Room,
            kickedPlayer: PlayerObject,
            reason: string,
            ban: boolean,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onPlayerKicked", handler]);
        return this;
    }

    onGameTick(handler: (room: Room) => void): this {
        this.events.push(["onGameTick", handler]);
        return this;
    }

    onGamePause(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGamePause", handler]);
        return this;
    }

    onGameUnpause(
        handler: (room: Room, byPlayer: PlayerObject | null) => void,
    ): this {
        this.events.push(["onGameUnpause", handler]);
        return this;
    }

    onPositionsReset(handler: (room: Room) => void): this {
        this.events.push(["onPositionsReset", handler]);
        return this;
    }

    onPlayerActivity(
        handler: (room: Room, player: PlayerObject) => void,
    ): this {
        this.events.push(["onPlayerActivity", handler]);
        return this;
    }

    onStadiumChange(
        handler: (
            room: Room,
            newStadiumName: string,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onStadiumChange", handler]);
        return this;
    }

    onRoomLink(handler: (room: Room, url: string) => void): this {
        this.events.push(["onRoomLink", handler]);
        return this;
    }

    onKickRateLimitSet(
        handler: (
            room: Room,
            min: number,
            rate: number,
            burst: number,
            byPlayer: PlayerObject | null,
        ) => void,
    ): this {
        this.events.push(["onKickRateLimitSet", handler]);
        return this;
    }

    call(eventName: string, ...args: any[]) {
        for (const [name, handler] of this.events) {
            if (name === eventName) {
                handler(...args);
            }
        }
    }
}

export function createModule() {
    return new Module();
}

export function updateRoomModules(roomObject: RoomObject, modules: Module[]) {
    const room = new Room(roomObject);

    roomObject.onPlayerJoin = (player) =>
        modules.forEach((module) => module.call("onPlayerJoin", room, player));

    roomObject.onPlayerLeave = (player) =>
        modules.forEach((module) => module.call("onPlayerLeave", room, player));

    roomObject.onTeamVictory = (scores) =>
        modules.forEach((module) => module.call("onTeamVictory", room, scores));

    roomObject.onPlayerChat = (player, message) => {
        modules.forEach((module) =>
            module.call("onPlayerChat", room, player, message),
        );
    };

    roomObject.onPlayerBallKick = (player) =>
        modules.forEach((module) =>
            module.call("onPlayerBallKick", room, player),
        );

    roomObject.onTeamGoal = (team) =>
        modules.forEach((module) => module.call("onTeamGoal", room, team));

    roomObject.onGameStart = (byPlayer) =>
        modules.forEach((module) => module.call("onGameStart", room, byPlayer));

    roomObject.onGameStop = (byPlayer) =>
        modules.forEach((module) => module.call("onGameStop", room, byPlayer));

    roomObject.onPlayerAdminChange = (changedPlayer, byPlayer) =>
        modules.forEach((module) =>
            module.call("onPlayerAdminChange", room, changedPlayer, byPlayer),
        );

    roomObject.onPlayerTeamChange = (changedPlayer, byPlayer) =>
        modules.forEach((module) =>
            module.call("onPlayerTeamChange", room, changedPlayer, byPlayer),
        );

    roomObject.onPlayerKicked = (kickedPlayer, reason, ban, byPlayer) =>
        modules.forEach((module) =>
            module.call(
                "onPlayerKicked",
                room,
                kickedPlayer,
                reason,
                ban,
                byPlayer,
            ),
        );

    roomObject.onGameTick = () =>
        modules.forEach((module) => module.call("onGameTick", room));

    roomObject.onGamePause = (byPlayer) =>
        modules.forEach((module) => module.call("onGamePause", room, byPlayer));

    roomObject.onGameUnpause = (byPlayer) =>
        modules.forEach((module) =>
            module.call("onGameUnpause", room, byPlayer),
        );

    roomObject.onPositionsReset = () =>
        modules.forEach((module) => module.call("onPositionsReset", room));

    roomObject.onPlayerActivity = (player) =>
        modules.forEach((module) =>
            module.call("onPlayerActivity", room, player),
        );

    roomObject.onStadiumChange = (newStadiumName, byPlayer) =>
        modules.forEach((module) =>
            module.call("onStadiumChange", room, newStadiumName, byPlayer),
        );

    roomObject.onRoomLink = (url) =>
        modules.forEach((module) => module.call("onRoomLink", room, url));

    roomObject.onKickRateLimitSet = (min, rate, burst, byPlayer) =>
        modules.forEach((module) =>
            module.call("onKickRateLimitSet", room, min, rate, burst, byPlayer),
        );
}
