import axios from "axios";
import { config, SPORT_METADATA } from "../config";
import { Sport, ScheduleData } from "../types";
import { logger } from "../utils/logger";
import footballSchedule from "../data/football-schedule-2306-2026.json";

const LOG = "ESPNApi";

// Temporary fallback to local file while figuring out how to self host
const LOCAL_FALLBACK: Partial<Record<Sport, ScheduleData>> = {
  [config.SPORTS.FOOTBALL]: { events: footballSchedule.events || [] },
};

export class ESPNApiService {
  public async fetchSchedule(sport: Sport): Promise<ScheduleData> {
    const meta = SPORT_METADATA[sport];
    if (!meta) {
      throw new Error(`Unknown sport: ${sport}`);
    }

    const fallback = LOCAL_FALLBACK[sport];
    if (fallback) {
      logger.info(LOG, `Using local fallback file for ${sport} schedule`);
      return fallback;
    }

    const season = this.getCurrentSeason(sport);
    const url = `${config.ESPN_BASE_URL}/${meta.espnPath}/teams/${config.KSU_TEAM_ID}/schedule?season=${season}`;

    try {
      logger.info(LOG, `Fetching ${sport} schedule (season ${season})`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { "User-Agent": "3MAW-Discord-Bot/1.0" },
      });

      return { events: response.data.events || [] };
    } catch (error) {
      logger.error(LOG, `Error fetching ${sport} schedule`);
      if (axios.isAxiosError(error)) {
        logger.error(
          LOG,
          `Status: ${error.response?.status}, Message: ${error.message}`,
        );
      }
      return { events: [] };
    }
  }

  private getCurrentSeason(sport: Sport): number {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    if (sport === config.SPORTS.FOOTBALL) {
      // Football: Aug–Jan. Jan–Feb belongs to the previous year's season.
      return month <= 2 ? year - 1 : year;
    }
    if (
      sport === config.SPORTS.MENS_BASKETBALL ||
      sport === config.SPORTS.WOMENS_BASKETBALL
    ) {
      // Basketball: Oct–Mar. Oct–Dec uses next year as the season identifier.
      return month >= 10 ? year + 1 : year;
    }

    return year;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const url = `${config.ESPN_BASE_URL}/football/college-football/teams/${config.KSU_TEAM_ID}`;
      const response = await axios.get(url, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.error(LOG, "ESPN API connection test failed", error);
      return false;
    }
  }
}
