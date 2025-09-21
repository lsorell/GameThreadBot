import { config } from "./config";

export type Sport = (typeof config.SPORTS)[keyof typeof config.SPORTS];

export interface Game {
  id: string;
  name: string;
  date: string;
  competitions: Array<{
    id: string;
    date: string;
    competitors: Array<{
      team: {
        displayName: string;
        abbreviation: string;
      };
      homeAway: string;
    }>;
  }>;
}

export interface ScheduleData {
  events: Game[];
}

export interface GameCounter {
  [sport: string]: number;
}

export interface TodayGame {
  game: Game;
  sport: Sport;
}
