import axios from "axios";
import { config } from "../config";
import { Sport, ScheduleData } from "../types";

export class ESPNApiService {
  private readonly sportMap: Record<Sport, string> = {
    [config.SPORTS.FOOTBALL]: "football/college-football",
    [config.SPORTS.MENS_BASKETBALL]: "basketball/mens-college-basketball",
    [config.SPORTS.WOMENS_BASKETBALL]: "basketball/womens-college-basketball",
  };

  public async fetchSchedule(sport: Sport): Promise<ScheduleData> {
    const espnSport = this.sportMap[sport];
    if (!espnSport) {
      throw new Error(`Unknown sport: ${sport}`);
    }

    const season = this.getCurrentSeason(sport);
    const url = `${config.ESPN_BASE_URL}/${espnSport}/teams/${config.KSU_TEAM_ID}/schedule?season=${season}`;

    try {
      console.log(`Fetching ${sport} schedule from: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "3MAW-Discord-Bot/1.0",
        },
      });

      return {
        events: response.data.events || [],
      };
    } catch (error) {
      console.error(`Error fetching ${sport} schedule:`, error);
      if (axios.isAxiosError(error)) {
        console.error(
          `Status: ${error.response?.status}, Message: ${error.message}`
        );
      }
      return { events: [] };
    }
  }

  private getCurrentSeason(sport: Sport): number {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based month

    if (sport === config.SPORTS.FOOTBALL) {
      // Football season runs Aug-Jan, so:
      // Aug-Dec = current year season
      // Jan-Jul = previous year season (since season started in previous year)
      return currentMonth >= 8 ? currentYear : currentYear - 1;
    } else {
      // Basketball seasons run Nov-Mar, so:
      // Nov-Dec = current year season
      // Jan-Jul = current year season (season started in previous year but we use current year)
      // Aug-Oct = previous year season (off-season, but if games exist, they'd be from previous season)
      return currentMonth >= 8 ? currentYear : currentYear;
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      const url = `${config.ESPN_BASE_URL}/football/college-football/teams/${config.KSU_TEAM_ID}`;
      const response = await axios.get(url, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      console.error("ESPN API connection test failed:", error);
      return false;
    }
  }
}
