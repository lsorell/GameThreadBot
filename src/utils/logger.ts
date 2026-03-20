const timestamp = (): string => new Date().toISOString();

function format(level: string, context: string, message: string): string {
  return `${timestamp()} [${level}] [${context}] ${message}`;
}

export const logger = {
  info: (context: string, message: string, ...args: unknown[]) => {
    console.log(format("INFO", context, message), ...args);
  },
  warn: (context: string, message: string, ...args: unknown[]) => {
    console.warn(format("WARN", context, message), ...args);
  },
  error: (context: string, message: string, ...args: unknown[]) => {
    console.error(format("ERROR", context, message), ...args);
  },
  debug: (context: string, message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(format("DEBUG", context, message), ...args);
    }
  },
};
