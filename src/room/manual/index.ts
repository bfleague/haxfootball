import { createModule } from "@core/module";
import { createEngine, type Engine } from "@common/engine";
import { legacyRegistry } from "@meta/legacy/meta";
import { defaultLegacyConfig, type Config } from "@meta/legacy/config";
import { Team } from "@common/models";
import baseStadium from "@meta/legacy/stadiums/base";

export const config: RoomConfigObject = {
    roomName: "HaxFootball",
    maxPlayers: 16,
    noPlayer: true,
    public: false,
};

let engine: Engine<Config> | null = null;

const matchModule = createModule()
    .onGameStart((room) => {
        engine = createEngine(room, legacyRegistry, {
            config: defaultLegacyConfig,
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
        if (engine) engine.notePlayerBallKick(player.id);
    })
    .onGameStop(() => {
        if (engine) engine.stop();
        engine = null;
    })
    .onPlayerJoin((room, player) => {
        room.setAdmin(player, true);
    })
    .onRoomLink((room, url) => {
        room.setStadium(baseStadium);
        console.log(`Room link: ${url}`);
    });

export const modules = [matchModule];
