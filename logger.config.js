import winston from "winston";
import path from "path";

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  debug: "blue",
};

winston.addColors(colors);

const logger = winston.createLogger({
  level: "debug",
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  },
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "info.log"),
      level: "info",
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "erros.log"),
      level: "error",
      handleExceptions: true,
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), "logs", "warnings.log"),
      level: "warn",
    }),
  ],
});

export default logger;
