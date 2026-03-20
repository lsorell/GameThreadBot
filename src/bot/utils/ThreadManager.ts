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
import { config } from "../../config";
import { Sport } from "../../types";

export class ThreadManager {
  private client: Client;
  private scheduleManager: ScheduleManager;
  private createdGameIds: Set<string> = new Set();
  private createdThreads: Map<string, AnyThreadChannel> = new Map();

  constructor(client: Client, scheduleManager: ScheduleManager) {
    this.client = client;
    this.scheduleManager = scheduleManager;
  }

  public async checkAndCreateTodayThreads(): Promise<number> {
    const todaysGames = await this.scheduleManager.getTodaysGames();
    let threadsCreated = 0;

    for (const { game, sport } of todaysGames) {
      try {
        const threadCreated = await this.createGameThread(game, sport);
        if (threadCreated) threadsCreated++;
      } catch (error) {
        console.error(`Error creating thread for ${sport} game:`, error);
      }
    }

    console.log(`Created ${threadsCreated} thread(s) for today's games`);
    return threadsCreated;
  }

  public async createGameThread(game: any, sport: Sport): Promise<boolean> {
    try {
      if (this.createdGameIds.has(game.id)) {
        console.log(`Thread already created for game ${game.id}, skipping`);
        return false;
      }

      const gameThreadsChannel = this.client.channels.cache.get(
        config.GAME_THREADS_CHANNEL_ID,
      ) as TextChannel;
      const generalChannel = this.client.channels.cache.get(
        config.GENERAL_CHANNEL_ID,
      ) as TextChannel;

      if (!gameThreadsChannel || !generalChannel) {
        console.error("Could not find required channels");
        return false;
      }

      const opponent = this.extractOpponent(game);
      if (!opponent) {
        console.error("Could not find opponent for game:", game.name);
        return false;
      }

      const gameNumber = this.scheduleManager.getGameCounter(sport) + 1;
      const threadName = this.generateThreadName(
        sport,
        gameNumber,
        opponent.displayName,
      );

      const threadExists = await this.checkThreadExists(
        gameThreadsChannel,
        threadName,
      );
      if (threadExists) {
        console.log(`Thread already exists: ${threadName}`);
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

      const initialMessage = this.generateInitialMessage(game, sport, opponent);
      await thread.send({ content: initialMessage });

      const notificationMessage = this.generateNotificationMessage(threadName);
      const threadButtons = this.buildThreadButtons(thread.id);
      await generalChannel.send({
        content: notificationMessage,
        components: [threadButtons],
      });

      console.log(`Created thread: ${threadName}`);
      return true;
    } catch (error) {
      console.error("Error creating game thread:", error);
      return false;
    }
  }

  private getSportChannelId(sport: Sport): string {
    const map: Record<Sport, string> = {
      [config.SPORTS.FOOTBALL]: config.FOOTBALL_CHANNEL_ID,
      [config.SPORTS.MENS_BASKETBALL]: config.MBB_CHANNEL_ID,
      [config.SPORTS.WOMENS_BASKETBALL]: config.WBB_CHANNEL_ID,
    };
    return map[sport] || "";
  }

  public async sendGameStartNotification(
    game: any,
    sport: Sport,
  ): Promise<void> {
    const channelId = this.getSportChannelId(sport);
    if (!channelId) {
      console.log(
        `No sport channel configured for ${sport}, skipping game start notification`,
      );
      return;
    }

    const sportChannel = this.client.channels.cache.get(
      channelId,
    ) as TextChannel;
    if (!sportChannel) {
      console.error(`Could not find sport channel ${channelId} for ${sport}`);
      return;
    }

    const opponent = this.extractOpponent(game);
    const opponentName = opponent?.displayName || "Unknown";
    const thread = this.createdThreads.get(game.id);

    const emoji = this.getSportEmoji(sport);
    const message =
      `${emoji} The game vs **${opponentName}** is starting!\n` +
      `We'll be talking about the game in the game thread.\n` +
      `Go Cats! 💜`;

    try {
      const sendOptions: {
        content: string;
        components?: ActionRowBuilder<ButtonBuilder>[];
      } = {
        content: message,
      };
      if (thread) {
        sendOptions.components = [this.buildThreadButtons(thread.id)];
      }
      await sportChannel.send(sendOptions);
      console.log(`Sent game start notification for ${sport} game ${game.id}`);
    } catch (error) {
      console.error(
        `Error sending game start notification for ${sport}:`,
        error,
      );
    }
  }

  private extractOpponent(game: any): any | null {
    const competition = game.competitions?.[0];
    if (!competition) return null;

    const ksuTeam = competition.competitors?.find(
      (comp: any) =>
        comp.team?.displayName?.includes("Kansas State") ||
        comp.team?.abbreviation === "KSU",
    );

    const opponent = competition.competitors?.find(
      (comp: any) => comp !== ksuTeam,
    );
    return opponent?.team || null;
  }

  private generateThreadName(
    sport: Sport,
    gameNumber: number,
    opponentName: string,
  ): string {
    const sportDisplayNames: Record<Sport, string> = {
      [config.SPORTS.FOOTBALL]: "Football",
      [config.SPORTS.MENS_BASKETBALL]: "Men's Basketball",
      [config.SPORTS.WOMENS_BASKETBALL]: "Women's Basketball",
    };

    const sportName = sportDisplayNames[sport] || sport;
    return `${sportName} Game ${gameNumber}: ${opponentName}`;
  }

  private generateInitialMessage(
    game: any,
    sport: Sport,
    opponent: any,
  ): string {
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

    const competition = game.competitions?.[0];
    const ksuTeam = competition?.competitors?.find(
      (comp: any) =>
        comp.team?.displayName?.includes("Kansas State") ||
        comp.team?.abbreviation === "KSU",
    );
    const homeAway = ksuTeam?.homeAway === "home" ? "vs" : "@";

    const sportEmoji = this.getSportEmoji(sport);
    const sportDisplayName = this.generateThreadName(sport, 0, "").split(
      " Game",
    )[0];

    return (
      `${sportEmoji} **${sportDisplayName} Game Thread**\n\n` +
      `**Kansas State ${homeAway} ${opponent.displayName}**\n` +
      `📅 ${formattedDate}\n` +
      `⏰ ${formattedTime}\n\n` +
      `Go Cats! 💜`
    );
  }

  private generateNotificationMessage(threadName: string): string {
    const emoji = this.getSportEmojiFromThreadName(threadName);
    return (
      `${emoji} The game thread for **${threadName}** is now up!\n` +
      `Go Cats! 💜`
    );
  }

  private buildThreadButtons(
    threadId: string,
  ): ActionRowBuilder<ButtonBuilder> {
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

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      joinButton,
      openButton,
    );
  }

  public async handleJoinThreadButton(
    interaction: ButtonInteraction,
  ): Promise<void> {
    const threadId = interaction.customId.replace("join_thread_", "");
    try {
      const thread = await this.client.channels.fetch(threadId);
      if (!thread?.isThread()) {
        await interaction.reply({
          content: "Could not find that thread.",
          ephemeral: true,
        });
        return;
      }
      await thread.members.add(interaction.user.id);
      await interaction.reply({
        content: `You've joined **${thread.name}**! Head over to <#${threadId}> to chat.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error handling join thread button:", error);
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
      console.log(`Could not determine sport for locked thread: ${thread.name}`);
      return;
    }

    const channelId = this.getSportChannelId(sport);
    if (!channelId) {
      console.log(`No sport channel configured for ${sport}, skipping lock message`);
      return;
    }

    const emoji = this.getSportEmoji(sport);
    const message =
      `🔒 A mod has locked the thread.\n` +
      `${emoji} Move over to <#${channelId}> for the postgame discussion!`;

    try {
      await thread.send({ content: message });
      console.log(`Sent lock redirect message in thread: ${thread.name}`);
    } catch (error) {
      console.error(`Error sending lock redirect message in ${thread.name}:`, error);
    }
  }

  private detectSportFromThreadName(threadName: string): Sport | null {
    if (threadName.startsWith("Football")) return config.SPORTS.FOOTBALL;
    if (threadName.startsWith("Men's Basketball")) return config.SPORTS.MENS_BASKETBALL;
    if (threadName.startsWith("Women's Basketball")) return config.SPORTS.WOMENS_BASKETBALL;
    return null;
  }

  private getSportEmoji(sport: Sport): string {
    const emojiMap: Record<Sport, string> = {
      [config.SPORTS.FOOTBALL]: "🏈",
      [config.SPORTS.MENS_BASKETBALL]: "🏀",
      [config.SPORTS.WOMENS_BASKETBALL]: "🏀",
    };
    return emojiMap[sport] || "🏆";
  }

  private getSportEmojiFromThreadName(threadName: string): string {
    if (threadName.includes("Football")) return "🏈";
    if (threadName.includes("Basketball")) return "🏀";
    return "🏆";
  }

  private async checkThreadExists(
    channel: TextChannel,
    threadName: string,
  ): Promise<boolean> {
    try {
      const activeThreads = await channel.threads.fetchActive();
      const archivedThreads = await channel.threads.fetchArchived();

      const allThreads = [
        ...activeThreads.threads.values(),
        ...archivedThreads.threads.values(),
      ];
      return allThreads.some((thread) => thread.name === threadName);
    } catch (error) {
      console.error("Error checking if thread exists:", error);
      return false;
    }
  }
}
