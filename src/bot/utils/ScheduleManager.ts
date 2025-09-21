import cron from "node-cron";
import { ESPNApiService } from "../../api/ESPNApiService";
import { config } from "../../config";
import { Sport, ScheduleData } from "../../types";
import type { ThreadManager } from "./ThreadManager";

export class ScheduleManager {
  private espnApi: ESPNApiService;
  private gameCounters: Record<Sport, number> = {
    [config.SPORTS.FOOTBALL]: 0,
    [config.SPORTS.MENS_BASKETBALL]: 0,
    [config.SPORTS.WOMENS_BASKETBALL]: 0,
  };
  private weeklyTask?: cron.ScheduledTask;
  // Map key: `${sport}_${gameId}`
  private gameDayTasks: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.espnApi = new ESPNApiService();
  }

  public startScheduledJobs(threadManager: ThreadManager): void {
    // Weekly schedule refresh - every Sunday at 12:01 AM ET
    if (this.weeklyTask) {
      console.warn("Weekly task already running.");
      return;
    }
    this.weeklyTask = cron.schedule(
      config.WEEKLY_REFRESH_CRON,
      async () => {
        console.log("Running weekly schedule refresh...");
        await this.refreshAllSchedules(threadManager);
      },
      {
        scheduled: true,
        timezone: config.TIMEZONE,
      }
    );
    console.log("Scheduled jobs started");
  }

  public stopScheduledJobs(): void {
    if (this.weeklyTask) {
      this.weeklyTask.stop();
      this.weeklyTask = undefined;
    }
    // Stop and clear all gameDayTasks
    for (const task of this.gameDayTasks.values()) {
      task.stop();
    }
    this.gameDayTasks.clear();
    console.log("Scheduled jobs stopped");
  }

  /**
   * Refreshes all schedules and sets up per-game cron jobs for the week.
   * @param threadManager ThreadManager instance for job callbacks
   */
  public async refreshAllSchedules(
    threadManager?: ThreadManager
  ): Promise<void> {
    const sports = Object.values(config.SPORTS) as Sport[];
    // Track valid keys for this week's games
    const validKeys = new Set<string>();

    for (const sport of sports) {
      try {
        await this.refreshSportSchedule(sport);
        const schedule = await this.getSchedule(sport);
        for (const game of schedule.events) {
          const gameDate = new Date(game.date);
          // Only schedule for games in the future (today or later)
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          gameDate.setHours(0, 0, 0, 0);
          if (gameDate >= now) {
            const key = this.getGameTaskKey(sport, game.id);
            validKeys.add(key);
            if (!this.gameDayTasks.has(key) && threadManager) {
              // Schedule at 5:00 AM ET on game day
              const cronTime = this.getCronTimeForGame(game.date);
              const task = cron.schedule(
                cronTime,
                async () => {
                  console.log(
                    `Running game day thread check for ${sport} game ${game.id}`
                  );
                  await threadManager.checkAndCreateTodayThreads();
                },
                {
                  scheduled: true,
                  timezone: config.TIMEZONE,
                }
              );
              this.gameDayTasks.set(key, task);
              console.log(
                `Scheduled game day job for ${sport} game ${game.id} at ${cronTime}`
              );
            }
          }
        }
      } catch (error) {
        console.error(`Error refreshing ${sport} schedule:`, error);
      }
    }
    // Remove obsolete jobs
    for (const key of Array.from(this.gameDayTasks.keys())) {
      if (!validKeys.has(key)) {
        const task = this.gameDayTasks.get(key);
        if (task) task.stop();
        this.gameDayTasks.delete(key);
        console.log(`Removed obsolete game day job: ${key}`);
      }
    }
  }

  /**
   * Returns a cron string for 5:00 AM ET on the date of the game.
   */
  private getCronTimeForGame(dateString: string): string {
    const date = new Date(dateString);
    // node-cron: 'm h D M d' (d=day of week, not used here)
    // 5:00 AM: '0 5 D M *'
    return `0 5 ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;
  }

  /**
   * Returns a unique key for a game day task.
   */
  private getGameTaskKey(sport: Sport, gameId: string): string {
    return `${sport}_${gameId}`;
  }

  /**
   * Checks if a game day cron job exists for the given sport and gameId.
   */
  public hasGameDayTask(sport: Sport, gameId: string): boolean {
    return this.gameDayTasks.has(this.getGameTaskKey(sport, gameId));
  }

  /**
   * Adds a game day cron job if it doesn't already exist.
   * Returns true if added, false if already exists.
   */
  public addGameDayTask(
    sport: Sport,
    game: any,
    threadManager: ThreadManager
  ): boolean {
    const key = this.getGameTaskKey(sport, game.id);
    if (this.gameDayTasks.has(key)) return false;
    const cronTime = this.getCronTimeForGame(game.date);
    const task = cron.schedule(
      cronTime,
      async () => {
        console.log(
          `Running game day thread check for ${sport} game ${game.id}`
        );
        await threadManager.checkAndCreateTodayThreads();
      },
      {
        scheduled: true,
        timezone: config.TIMEZONE,
      }
    );
    this.gameDayTasks.set(key, task);
    console.log(
      `Scheduled game day job for ${sport} game ${game.id} at ${cronTime}`
    );
    return true;
  }

  private async refreshSportSchedule(sport: Sport): Promise<void> {
    const schedule = await this.espnApi.fetchSchedule(sport);

    // Reset and recalculate game counter
    this.gameCounters[sport] = this.calculateGameCounter(schedule);

    console.log(
      `Refreshed ${sport} schedule. Current game count: ${this.gameCounters[sport]}`
    );
  }

  private calculateGameCounter(schedule: ScheduleData): number {
    const today = new Date();
    let count = 0;

    for (const game of schedule.events) {
      const gameDate = new Date(game.date);
      if (gameDate <= today) {
        count++;
      }
    }

    return count;
  }

  public async getSchedule(sport: Sport): Promise<ScheduleData> {
    return await this.espnApi.fetchSchedule(sport);
  }

  public getGameCounter(sport: Sport): number {
    return this.gameCounters[sport];
  }

  public incrementGameCounter(sport: Sport): number {
    this.gameCounters[sport]++;
    return this.gameCounters[sport];
  }

  public async getTodaysGames(): Promise<Array<{ game: any; sport: Sport }>> {
    const todaysGames: Array<{ game: any; sport: Sport }> = [];
    const sports = Object.values(config.SPORTS) as Sport[];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const sport of sports) {
      try {
        const schedule = await this.getSchedule(sport);

        for (const game of schedule.events) {
          const gameDate = new Date(game.date);
          gameDate.setHours(0, 0, 0, 0);

          if (gameDate.getTime() === today.getTime()) {
            todaysGames.push({ game, sport });
          }
        }
      } catch (error) {
        console.error(`Error checking today's games for ${sport}:`, error);
      }
    }

    return todaysGames;
  }
}
