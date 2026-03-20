import {
  Client,
  TextChannel,
  AnyThreadChannel,
  ChannelType,
  ThreadAutoArchiveDuration,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
} from "discord.js";
import { ScheduleManager } from "./ScheduleManager";
import { config, SPORT_METADATA } from "../../config";
import { Sport, Game } from "../../types";
import { extractOpponent, getHomeAway } from "../../utils/gameUtils";
import { logger } from "../../utils/logger";

const LOG = "Thread";

export class ThreadManager {
  private client: Client;
  private scheduleManager: ScheduleManager;
  private createdGameIds: Set<string> = new Set();
  private createdThreads: Map<string, AnyThreadChannel> = new Map();

  constructor(client: Client, scheduleManager: ScheduleManager) {
    this.client = client;
    this.scheduleManager = scheduleManager;
  }

  // --- Public: cron + event entry points ---

  public async checkAndCreateTodayThreads(): Promise<number> {
    const todaysGames = await this.scheduleManager.getTodaysGames();
    let created = 0;

    for (const { game, sport } of todaysGames) {
      try {
        if (await this.createGameThread(game, sport)) created++;
      } catch (error) {
        logger.error(LOG, `Error creating thread for ${sport} game ${game.id}`, error);
      }
    }

    logger.info(LOG, `Created ${created} thread(s) for today's games`);
    return created;
  }

  public async createGameThread(game: Game, sport: Sport): Promise<boolean> {
    try {
      if (this.createdGameIds.has(game.id)) {
        logger.debug(LOG, `Already processed game ${game.id}, skipping`);
        return false;
      }

      const meta = SPORT_METADATA[sport];
      if (!meta?.createThreads) {
        logger.debug(LOG, `Thread creation disabled for ${sport}, skipping`);
        return false;
      }

      const gameThreadsChannel = this.client.channels.cache.get(
        config.GAME_THREADS_CHANNEL_ID,
      ) as TextChannel;
      const generalChannel = this.client.channels.cache.get(
        config.GENERAL_CHANNEL_ID,
      ) as TextChannel;

      if (!gameThreadsChannel || !generalChannel) {
        logger.error(LOG, "Could not find required channels");
        return false;
      }

      const opponent = extractOpponent(game);
      if (!opponent) {
        logger.error(LOG, `Could not find opponent for game: ${game.name}`);
        return false;
      }

      const gameNumber = this.scheduleManager.getGameCounter(sport) + 1;
      const threadName = `${meta.displayName} Game ${gameNumber}: ${opponent.displayName}`;

      if (await this.threadExists(gameThreadsChannel, threadName)) {
        logger.info(LOG, `Thread already exists: ${threadName}`);
        this.createdGameIds.add(game.id);
        return false;
      }

      const thread = await gameThreadsChannel.threads.create({
        name: threadName,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        type: ChannelType.PublicThread,
        reason: `Automated game thread for ${opponent.displayName} game`,
      });

      this.scheduleManager.incrementGameCounter(sport);
      this.createdGameIds.add(game.id);
      this.createdThreads.set(game.id, thread);

      await thread.send({ content: this.buildInitialMessage(game, sport, opponent) });

      await generalChannel.send({
        content: `${meta.emoji} The game thread for **${threadName}** is now up!\nGo Cats! 💜`,
        components: [this.buildThreadButtons(thread.id)],
      });

      logger.info(LOG, `Created thread: ${threadName}`);
      return true;
    } catch (error) {
      logger.error(LOG, "Error creating game thread", error);
      return false;
    }
  }

  public async sendGameStartNotification(game: Game, sport: Sport): Promise<void> {
    const meta = SPORT_METADATA[sport];
    if (!meta?.channelId) {
      logger.info(LOG, `No sport channel configured for ${sport}, skipping game start notification`);
      return;
    }

    const sportChannel = this.client.channels.cache.get(meta.channelId) as TextChannel;
    if (!sportChannel) {
      logger.error(LOG, `Could not find sport channel ${meta.channelId} for ${sport}`);
      return;
    }

    const opponent = extractOpponent(game);
    const opponentName = opponent?.displayName || "Unknown";
    const thread = this.createdThreads.get(game.id);

    const message =
      `${meta.emoji} The game vs **${opponentName}** is starting!\n` +
      `We'll be talking about the game in the game thread.\n` +
      `Go Cats! 💜`;

    try {
      const sendOptions: { content: string; components?: ActionRowBuilder<ButtonBuilder>[] } = {
        content: message,
      };
      if (thread) {
        sendOptions.components = [this.buildThreadButtons(thread.id)];
      }
      await sportChannel.send(sendOptions);
      logger.info(LOG, `Sent game start notification for ${sport} game ${game.id}`);
    } catch (error) {
      logger.error(LOG, `Error sending game start notification for ${sport}`, error);
    }
  }

  public async handleJoinThreadButton(interaction: ButtonInteraction): Promise<void> {
    const threadId = interaction.customId.replace("join_thread_", "");
    try {
      const thread = await this.client.channels.fetch(threadId);
      if (!thread?.isThread()) {
        await interaction.reply({ content: "Could not find that thread.", ephemeral: true });
        return;
      }
      await thread.members.add(interaction.user.id);
      await interaction.reply({
        content: `You've joined **${thread.name}**! Head over to <#${threadId}> to chat.`,
        ephemeral: true,
      });
    } catch (error) {
      logger.error(LOG, "Error handling join thread button", error);
      await interaction.reply({
        content: `Something went wrong joining the thread. Please try joining manually here: <#${threadId}>.`,
        ephemeral: true,
      });
    }
  }

  public async handleThreadLocked(thread: AnyThreadChannel): Promise<void> {
    if (thread.parentId !== config.GAME_THREADS_CHANNEL_ID) return;

    const sport = this.detectSportFromThreadName(thread.name);
    if (!sport) {
      logger.warn(LOG, `Could not determine sport for locked thread: ${thread.name}`);
      return;
    }

    const meta = SPORT_METADATA[sport];
    if (!meta?.channelId) {
      logger.info(LOG, `No sport channel configured for ${sport}, skipping lock message`);
      return;
    }

    try {
      await thread.send({
        content:
          `🔒 A mod has locked the thread.\n` +
          `${meta.emoji} Move over to <#${meta.channelId}> for the postgame discussion!`,
      });
      logger.info(LOG, `Sent lock redirect in thread: ${thread.name}`);
    } catch (error) {
      logger.error(LOG, `Error sending lock redirect in ${thread.name}`, error);
    }
  }

  // --- Private helpers ---

  private detectSportFromThreadName(threadName: string): Sport | null {
    for (const [sport, meta] of Object.entries(SPORT_METADATA)) {
      if (threadName.startsWith(meta.displayName)) return sport as Sport;
    }
    return null;
  }

  private buildInitialMessage(
    game: Game,
    sport: Sport,
    opponent: { displayName: string },
  ): string {
    const meta = SPORT_METADATA[sport];
    const gameDate = new Date(game.date);

    const formattedDate = gameDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = gameDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: "America/Chicago",
    });

    const homeAway = getHomeAway(game);

    return (
      `${meta.emoji} **${meta.displayName} Game Thread**\n\n` +
      `**Kansas State ${homeAway} ${opponent.displayName}**\n` +
      `📅 ${formattedDate}\n` +
      `⏰ ${formattedTime}\n\n` +
      `Go Cats! 💜`
    );
  }

  private buildThreadButtons(threadId: string): ActionRowBuilder<ButtonBuilder> {
    const joinButton = new ButtonBuilder()
      .setCustomId(`join_thread_${threadId}`)
      .setLabel("Join Thread")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("💬");

    const openButton = new ButtonBuilder()
      .setURL(`https://discord.com/channels/${config.GUILD_ID}/${threadId}`)
      .setLabel("Open Thread")
      .setStyle(ButtonStyle.Link)
      .setEmoji("🔗");

    return new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton, openButton);
  }

  private async threadExists(channel: TextChannel, threadName: string): Promise<boolean> {
    try {
      const activeThreads = await channel.threads.fetchActive();
      const archivedThreads = await channel.threads.fetchArchived();
      const allThreads = [
        ...activeThreads.threads.values(),
        ...archivedThreads.threads.values(),
      ];
      return allThreads.some((t) => t.name === threadName);
    } catch (error) {
      logger.error(LOG, "Error checking if thread exists", error);
      return false;
    }
  }
}
