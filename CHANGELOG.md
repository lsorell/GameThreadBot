# Version Changelog

## 1.0.2

- ScheduleManager was scheduling basketball games for the following day due to converting for UTC time. Used local time functions to fix the issue.
- Fixed the bot-status command to be under the 2K character limit with basketball schedules

## 1.0.1

- Fixed the ESPNApiService to get the correct year for basketball schedules. ESPN uses the following year for basketball (i.e. 25-26 season uses 2026)
