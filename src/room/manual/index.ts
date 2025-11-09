import { createModule } from "@core/module";
import { createEngine, type Engine } from "@common/engine";
import { registry, stadium } from "@meta/legacy/meta";
import { defaultConfig, type Config } from "@meta/legacy/config";
import { Team } from "@common/models";

export const config: RoomConfigObject = {
    roomName: "HaxFootball",
    maxPlayers: 16,
    noPlayer: true,
    public: false,
};

let engine: Engine<Config> | null = null;

const mainModule = createModule()
    .onRoomLink((_, url) => {
        console.log(`Room link: ${url}`);
    })
    .onPlayerJoin((room, player) => {
        room.setAdmin(player, true);
    });

const matchModule = createModule()
    .onGameStart((room) => {
        engine = createEngine(room, registry, {
            config: defaultConfig,
            onStats: (key) => {
                console.log(`Stat recorded: ${key}`);
            },
        });

        engine.start("KICKOFF", { forTeam: Team.RED });
    })
    .onGameTick(() => {
        if (engine) engine.tick();
    })
    .onPlayerBallKick((_room, player) => {
        if (engine) engine.trackPlayerBallKick(player.id);
    })
    .onGameStop(() => {
        if (engine) engine.stop();
        engine = null;
    })
    .onRoomLink((room, _) => {
        room.setStadium(stadium);
    });

export const modules = [mainModule, matchModule];
