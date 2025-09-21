import {
  Client,
  TextChannel,
  ChannelType,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { ScheduleManager } from "./ScheduleManager";
import { config } from "../../config";
import { Sport } from "../../types";

export class ThreadManager {
  private client: Client;
  private scheduleManager: ScheduleManager;

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
      const gameThreadsChannel = this.client.channels.cache.get(
        config.GAME_THREADS_CHANNEL_ID
      ) as TextChannel;
      const generalChannel = this.client.channels.cache.get(
        config.GENERAL_CHANNEL_ID
      ) as TextChannel;

      if (!gameThreadsChannel || !generalChannel) {
        console.error("Could not find required channels");
        return false;
      }

      // Get opponent information
      const opponent = this.extractOpponent(game);
      if (!opponent) {
        console.error("Could not find opponent for game:", game.name);
        return false;
      }

      // Generate thread name
      const gameNumber = this.scheduleManager.incrementGameCounter(sport);
      const threadName = this.generateThreadName(
        sport,
        gameNumber,
        opponent.displayName
      );

      // Check if thread already exists
      const threadExists = await this.checkThreadExists(
        gameThreadsChannel,
        threadName
      );
      if (threadExists) {
        console.log(`Thread already exists: ${threadName}`);
        return false;
      }

      // Create the thread
      const thread = await gameThreadsChannel.threads.create({
        name: threadName,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        type: ChannelType.PublicThread,
        reason: `Automated game thread for ${opponent.displayName} game`,
      });

      // Send initial message in thread
      const initialMessage = this.generateInitialMessage(game, sport, opponent);
      await thread.send({ content: initialMessage });

      // Send notification in general channel
      const notificationMessage = this.generateNotificationMessage(
        threadName,
        thread
      );
      await generalChannel.send({ content: notificationMessage });

      console.log(`Created thread: ${threadName}`);
      return true;
    } catch (error) {
      console.error("Error creating game thread:", error);
      return false;
    }
  }

  private extractOpponent(game: any): any | null {
    const competition = game.competitions?.[0];
    if (!competition) return null;

    const ksuTeam = competition.competitors?.find(
      (comp: any) =>
        comp.team?.displayName?.includes("Kansas State") ||
        comp.team?.abbreviation === "KSU"
    );

    const opponent = competition.competitors?.find(
      (comp: any) => comp !== ksuTeam
    );
    return opponent?.team || null;
  }

  private generateThreadName(
    sport: Sport,
    gameNumber: number,
    opponentName: string
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
    opponent: any
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
    });

    const competition = game.competitions?.[0];
    const ksuTeam = competition?.competitors?.find(
      (comp: any) =>
        comp.team?.displayName?.includes("Kansas State") ||
        comp.team?.abbreviation === "KSU"
    );
    const homeAway = ksuTeam?.homeAway === "home" ? "vs" : "@";

    const sportEmoji = this.getSportEmoji(sport);
    const sportDisplayName = this.generateThreadName(sport, 0, "").split(
      " Game"
    )[0];

    return (
      `${sportEmoji} **${sportDisplayName} Game Thread**\n\n` +
      `**Kansas State ${homeAway} ${opponent.displayName}**\n` +
      `📅 ${formattedDate}\n` +
      `⏰ ${formattedTime}\n\n` +
      `Go Cats! 💜`
    );
  }

  private generateNotificationMessage(threadName: string, thread: any): string {
    const emoji = this.getSportEmojiFromThreadName(threadName);
    return `${emoji} The game thread for **${threadName}** is now up! Head over to ${thread} to discuss the game. Let's go Wildcats! 💜`;
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
    threadName: string
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
