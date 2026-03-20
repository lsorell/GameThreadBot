import { Game } from "../types";

export function extractOpponent(game: Game): { displayName: string; abbreviation: string } | null {
  const competition = game.competitions?.[0];
  if (!competition) return null;

  const ksuTeam = competition.competitors?.find(
    (comp) =>
      comp.team?.displayName?.includes("Kansas State") ||
      comp.team?.abbreviation === "KSU",
  );

  const opponent = competition.competitors?.find((comp) => comp !== ksuTeam);
  return opponent?.team || null;
}

export function getHomeAway(game: Game): "vs" | "@" {
  const competition = game.competitions?.[0];
  const ksuTeam = competition?.competitors?.find(
    (comp) =>
      comp.team?.displayName?.includes("Kansas State") ||
      comp.team?.abbreviation === "KSU",
  );
  return ksuTeam?.homeAway === "home" ? "vs" : "@";
}
