import { createModule } from "@core/module";

export const config: RoomConfigObject = {
    roomName: "HaxFootball",
    maxPlayers: 16,
    noPlayer: true,
    public: false,
};

// Just a test module to demonstrate module creation. In real use-cases,
// modules would be more complex and handle various events and states.
// They would also likely be split into separate files for better organization,
// and they would also call the state machine defined in `src/meta/legacy/meta.ts`.
const testModule = createModule()
    .onPlayerJoin((room, player) => {
        room.setAdmin(player, true);
    })
    .onGameStart((room) => {
        room.send({
            message: "Game has started! Good luck to all players!",
            style: "bold",
        });
    })
    .onRoomLink((_, url) => {
        console.log(`Room link: ${url}`);
    });

export const modules = [testModule];
