import cron from "node-cron";
import { ESPNApiService } from "../../api/ESPNApiService";
import { config } from "../../config";
import { Sport, Game, ScheduleData, TodayGame } from "../../types";
import { logger } from "../../utils/logger";
import type { ThreadManager } from "./ThreadManager";

const LOG = "Schedule";

export class ScheduleManager {
  private espnApi: ESPNApiService;
  private gameCounters: Record<string, number> = {};
  private weeklyTask?: cron.ScheduledTask;
  private gameDayTasks: Map<string, cron.ScheduledTask> = new Map();
  private gameStartTasks: Map<string, cron.ScheduledTask> = new Map();
  private scheduledGames: Map<string, TodayGame> = new Map();

  constructor() {
    this.espnApi = new ESPNApiService();
    for (const sport of Object.values(config.SPORTS)) {
      this.gameCounters[sport] = 0;
    }
  }

  public startScheduledJobs(threadManager: ThreadManager): void {
    if (this.weeklyTask) {
      logger.warn(LOG, "Weekly task already running, skipping");
      return;
    }

    this.weeklyTask = cron.schedule(
      config.WEEKLY_REFRESH_CRON,
      async () => {
        logger.info(LOG, "Running weekly schedule refresh");
        await this.refreshAllSchedules(threadManager);
      },
      { scheduled: true, timezone: config.TIMEZONE },
    );

    logger.info(LOG, "Scheduled jobs started");
  }

  public stopScheduledJobs(): void {
    this.weeklyTask?.stop();
    this.weeklyTask = undefined;

    for (const task of this.gameDayTasks.values()) task.stop();
    this.gameDayTasks.clear();

    for (const task of this.gameStartTasks.values()) task.stop();
    this.gameStartTasks.clear();

    logger.info(LOG, "Scheduled jobs stopped");
  }

  public async refreshAllSchedules(threadManager?: ThreadManager): Promise<void> {
    const sports = Object.values(config.SPORTS) as Sport[];
    const validKeys = new Set<string>();

    for (const sport of sports) {
      try {
        await this.refreshSportSchedule(sport);
        const schedule = await this.espnApi.fetchSchedule(sport);

        for (const game of schedule.events) {
          if (!this.isFutureGame(game)) continue;

          const key = this.gameKey(sport, game.id);
          validKeys.add(key);
          this.scheduledGames.set(key, { game, sport });

          if (threadManager) {
            this.ensureGameDayTask(key, sport, game, threadManager);
            this.ensureGameStartTask(key, sport, game, threadManager);
          }
        }
      } catch (error) {
        logger.error(LOG, `Error refreshing ${sport} schedule`, error);
      }
    }

    this.removeObsoleteTasks(validKeys);
  }

  public addGameDayTask(sport: Sport, game: Game, threadManager: ThreadManager): boolean {
    const key = this.gameKey(sport, game.id);
    if (this.gameDayTasks.has(key)) return false;

    this.scheduledGames.set(key, { game, sport });
    this.ensureGameDayTask(key, sport, game, threadManager);
    this.ensureGameStartTask(key, sport, game, threadManager);
    return true;
  }

  public hasGameDayTask(sport: Sport, gameId: string): boolean {
    return this.gameDayTasks.has(this.gameKey(sport, gameId));
  }

  public getGameCounter(sport: Sport): number {
    return this.gameCounters[sport] ?? 0;
  }

  public incrementGameCounter(sport: Sport): number {
    this.gameCounters[sport] = this.getGameCounter(sport) + 1;
    return this.gameCounters[sport];
  }

  public getScheduledGames(): TodayGame[] {
    return Array.from(this.scheduledGames.values());
  }

  public getScheduledGamesBySport(sport: Sport): TodayGame[] {
    return this.getScheduledGames().filter((entry) => entry.sport === sport);
  }


  public async getTodaysGames(): Promise<TodayGame[]> {
    const todaysGames: TodayGame[] = [];
    const sports = Object.values(config.SPORTS) as Sport[];
    const today = this.formatDateET(new Date());

    for (const sport of sports) {
      try {
        const schedule = await this.espnApi.fetchSchedule(sport);
        for (const game of schedule.events) {
          if (this.formatDateET(new Date(game.date)) === today) {
            todaysGames.push({ game, sport });
          }
        }
      } catch (error) {
        logger.error(LOG, `Error checking today's games for ${sport}`, error);
      }
    }

    return todaysGames;
  }

  // --- Private helpers ---

  private ensureGameDayTask(
    key: string,
    sport: Sport,
    game: Game,
    threadManager: ThreadManager,
  ): void {
    if (this.gameDayTasks.has(key)) return;

    const cronExpr = this.gameDayCron(game.date);
    const task = cron.schedule(
      cronExpr,
      async () => {
        logger.info(LOG, `Game day thread check: ${sport} game ${game.id}`);
        await threadManager.checkAndCreateTodayThreads();
      },
      { scheduled: true, timezone: config.TIMEZONE },
    );

    this.gameDayTasks.set(key, task);
    logger.info(LOG, `Scheduled game day job: ${sport} ${game.id} at ${cronExpr}`);
  }

  private ensureGameStartTask(
    key: string,
    sport: Sport,
    game: Game,
    threadManager: ThreadManager,
  ): void {
    if (this.gameStartTasks.has(key)) return;

    const cronExpr = this.gameStartCron(game.date);
    if (!cronExpr) return;

    const task = cron.schedule(
      cronExpr,
      async () => {
        logger.info(LOG, `Game start notification: ${sport} game ${game.id}`);
        await threadManager.sendGameStartNotification(game, sport);
      },
      { scheduled: true, timezone: config.TIMEZONE },
    );

    this.gameStartTasks.set(key, task);
    logger.info(LOG, `Scheduled game start notification: ${sport} ${game.id} at ${cronExpr}`);
  }

  private removeObsoleteTasks(validKeys: Set<string>): void {
    for (const key of Array.from(this.gameDayTasks.keys())) {
      if (validKeys.has(key)) continue;

      this.gameDayTasks.get(key)?.stop();
      this.gameDayTasks.delete(key);
      this.gameStartTasks.get(key)?.stop();
      this.gameStartTasks.delete(key);
      this.scheduledGames.delete(key);
      logger.info(LOG, `Removed obsolete game jobs: ${key}`);
    }
  }

  private async refreshSportSchedule(sport: Sport): Promise<void> {
    const schedule = await this.espnApi.fetchSchedule(sport);
    this.gameCounters[sport] = this.calculateGameCounter(schedule);
    logger.info(LOG, `Refreshed ${sport} — game count: ${this.gameCounters[sport]}`);
  }

  private calculateGameCounter(schedule: ScheduleData): number {
    const now = new Date();
    return schedule.events.filter((game) => new Date(game.date) <= now).length;
  }

  private isFutureGame(game: Game): boolean {
    const gameDate = new Date(game.date);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    gameDate.setHours(0, 0, 0, 0);
    return gameDate >= startOfToday;
  }

  private gameKey(sport: Sport, gameId: string): string {
    return `${sport}_${gameId}`;
  }

  private formatDateET(date: Date): string {
    return date.toLocaleString("en-US", {
      timeZone: config.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  private parseGameDateParts(dateString: string) {
    const date = new Date(dateString);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: config.TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    return {
      month: parts.find((p) => p.type === "month")?.value,
      day: parts.find((p) => p.type === "day")?.value,
      hour: parts.find((p) => p.type === "hour")?.value,
      minute: parts.find((p) => p.type === "minute")?.value,
    };
  }

  private gameDayCron(dateString: string): string {
    const { day, month } = this.parseGameDateParts(dateString);
    return `0 ${config.GAME_DAY_THREAD_HOUR} ${day} ${month} *`;
  }

  private gameStartCron(dateString: string): string | null {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    const { month, day, hour, minute } = this.parseGameDateParts(dateString);
    if (!month || !day || !hour || !minute) return null;
    return `${minute} ${hour} ${day} ${month} *`;
  }
}
