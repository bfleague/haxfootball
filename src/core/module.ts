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

    call(eventName: string, ...args: any[]): boolean {
        const responses: boolean[] = [];

        for (const [name, handler] of this.events) {
            if (name === eventName) {
                const response = handler(...args);
                responses.push(response !== false);
            }
        }

        return responses.every((response) => response);
    }
}

export function createModule() {
    return new Module();
}

export function updateRoomModules(roomObject: RoomObject, modules: Module[]) {
    const room = new Room(roomObject);

    const emit =
        (eventName: string) =>
        (...args: any[]) => {
            room.invalidateCaches();
            modules.forEach((module) => module.call(eventName, room, ...args));
        };

    const emitChat =
        () =>
        (...args: any[]) => {
            room.invalidateCaches();

            const shouldSend = modules.reduce((allow, module) => {
                const moduleAllows = module.call("onPlayerChat", room, ...args);
                return allow && moduleAllows;
            }, true);

            return shouldSend;
        };

    roomObject.onPlayerJoin = emit("onPlayerJoin");
    roomObject.onPlayerLeave = emit("onPlayerLeave");
    roomObject.onTeamVictory = emit("onTeamVictory");
    roomObject.onPlayerChat = emitChat();
    roomObject.onPlayerBallKick = emit("onPlayerBallKick");
    roomObject.onTeamGoal = emit("onTeamGoal");
    roomObject.onGameStart = emit("onGameStart");
    roomObject.onGameStop = emit("onGameStop");
    roomObject.onPlayerAdminChange = emit("onPlayerAdminChange");
    roomObject.onPlayerTeamChange = emit("onPlayerTeamChange");
    roomObject.onPlayerKicked = emit("onPlayerKicked");
    roomObject.onGameTick = emit("onGameTick");
    roomObject.onGamePause = emit("onGamePause");
    roomObject.onGameUnpause = emit("onGameUnpause");
    roomObject.onPositionsReset = emit("onPositionsReset");
    roomObject.onPlayerActivity = emit("onPlayerActivity");
    roomObject.onStadiumChange = emit("onStadiumChange");
    roomObject.onRoomLink = emit("onRoomLink");
    roomObject.onKickRateLimitSet = emit("onKickRateLimitSet");
}
