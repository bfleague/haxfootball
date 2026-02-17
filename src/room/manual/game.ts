import { createModule } from "@core/module";
import { COMMAND_PREFIX } from "@runtime/commands";
import { createEngine, type Engine } from "@runtime/engine";
import { registry, stadium } from "@meta/legacy/meta";
import { defaultConfig, type Config } from "@meta/legacy/config";
import { Team } from "@runtime/models";
import { legacyGlobalSchema } from "@meta/legacy/global";
import { t } from "@lingui/core/macro";
import { Room } from "@core/room";
import { COLOR } from "@common/general/color";

const getPlayerNamePrefix = (team: number): string => {
    switch (team) {
        case Team.RED:
            return "🟥";
        case Team.BLUE:
            return "🟦";
        default:
            return "⬜";
    }
};

const formatChatMessage = (player: PlayerObject, rawMessage: string): string =>
    `${getPlayerNamePrefix(player.team)} ${player.name}: ${rawMessage}`;

const getMentionedPlayerIds = (
    message: string,
    players: PlayerObject[],
): Set<number> => {
    const mentions = message.match(/@\S+/g);

    if (!mentions) return new Set();

    const mentionedIds = new Set<number>();

    for (const mention of mentions) {
        const mentionName = mention.slice(1).replace(/_/g, " ").toLowerCase();

        for (const player of players) {
            if (player.name.toLowerCase() === mentionName) {
                mentionedIds.add(player.id);
            }
        }
    }

    return mentionedIds;
};

const broadcastChat = (
    room: Room,
    rawMessage: string,
    formatMessage: (rawMessage: string) => string,
): void => {
    const message = formatMessage(rawMessage);
    const players = room.getPlayerList();
    const mentionedIds = getMentionedPlayerIds(rawMessage, players);

    if (mentionedIds.size === 0) {
        room.send({ message });
        return;
    }

    for (const p of players) {
        if (mentionedIds.has(p.id)) {
            room.send({
                message,
                to: p.id,
                style: "bold",
                sound: "notification",
            });
        } else {
            room.send({ message, to: p.id });
        }
    }
};

let engine: Engine<Config> | null = null;

const gameModule = createModule()
    .setCommands({
        spec: { prefix: COMMAND_PREFIX },
        commands: [
            "punt",
            "fg",
            "version",
            "undo",
            "info",
            "reposition",
            "score",
        ],
    })
    .onGameStart((room) => {
        engine = createEngine(room, registry, {
            config: defaultConfig,
            globalSchema: legacyGlobalSchema,
        });

        engine.start("KICKOFF", { forTeam: Team.RED });
    })
    .onGameTick(() => {
        engine?.tick();
    })
    .onPlayerBallKick((_room, player) => {
        engine?.trackPlayerBallKick(player.id);
    })
    .onPlayerSendCommand((room, player, command) => {
        const { handled: handledByEngine } = engine
            ? engine.handlePlayerCommand(player, command)
            : { handled: false };

        if (handledByEngine) {
            return { hideMessage: true };
        }

        switch (command.name) {
            case "version":
                room.send({
                    message: t`🏈 HaxFootball 2026`,
                    color: COLOR.SYSTEM,
                    to: player.id,
                });

                return { hideMessage: true };
            default:
                room.send({
                    message: engine
                        ? t`⚠️ You cannot use that command right now.`
                        : t`⚠️ The game has not been started yet.`,
                    color: COLOR.WARNING,
                    to: player.id,
                });

                return { hideMessage: true };
        }
    })
    .onPlayerChat((room, player, rawMessage) => {
        const isTeamPlayer =
            player.team === Team.RED || player.team === Team.BLUE;
        const isTeamChat =
            isTeamPlayer &&
            (rawMessage.startsWith(";") || rawMessage.startsWith("t "));

        if (!isTeamChat) {
            return;
        }

        const teamMessage = rawMessage.startsWith(";")
            ? rawMessage.slice(1)
            : rawMessage.slice(2);
        const teamTarget = player.team === Team.RED ? "red" : "blue";

        room.send({
            message: `☎️ ${player.name}: ${teamMessage}`,
            color: COLOR.ALERT,
            to: teamTarget,
            sound: "notification",
        });

        return false;
    })

    .onPlayerChat((room, player, rawMessage) => {
        if (engine) {
            return;
        }

        const format = (raw: string) => formatChatMessage(player, raw);
        broadcastChat(room, rawMessage, format);

        return false;
    })
    .onPlayerChat((room, player, rawMessage) => {
        const format = (raw: string) => formatChatMessage(player, raw);
        const broadcast = () => broadcastChat(room, rawMessage, format);

        if (!engine) {
            return;
        }

        const chatResult = engine.handlePlayerChat(
            player,
            rawMessage,
            broadcast,
        );

        if (chatResult.allowBroadcast && !chatResult.sentBeforeHooks) {
            broadcast();
        }

        return false;
    })
    .onPlayerTeamChange((_room, changedPlayer, byPlayer) => {
        engine?.handlePlayerTeamChange(changedPlayer, byPlayer);
    })
    .onPlayerLeave((_room, player) => {
        engine?.handlePlayerLeave(player);
    })
    .onGameStop(() => {
        engine?.stop();
        engine = null;
    })
    .onGamePause((_room, byPlayer) => {
        engine?.handleGamePause(byPlayer);
    })
    .onGameUnpause((_room, byPlayer) => {
        engine?.handleGameUnpause(byPlayer);
    })
    .onRoomLink((room, _) => {
        room.setStadium(stadium);
    });

export const modules = [gameModule];
