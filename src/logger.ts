import { createLogger, format, transports } from 'winston';
import { WakaQ } from './wakaq.js';

export enum Level {
  INFO = 'info',
  ERROR = 'error',
  WARN = 'warn',
  DEBUG = 'debug',
}

export const setupLogging = (wakaq: WakaQ, isChild: boolean = false, isScheduler: boolean = false) => {
  const level = isScheduler ? wakaq.schedulerLogLevel : wakaq.workerLogLevel;
  const logger = createLogger({
    level: level,
    format: format.combine(
      format.errors({ stack: true }),
      format.printf(({ level, message, stack, payload }) => {
        if (stack) message = `${message} - ${stack}`;
        if (isChild) return JSON.stringify({ payload: wakaq.currentTask, level, message });
        let prefix = `${new Date().toISOString()} ${level.toUpperCase()}`;
        if (payload) {
          if (payload?.name) {
            prefix = `${prefix} in ${payload.name} args=${JSON.stringify(payload.args ?? [])} retry=${payload.retry ?? 0}`;
          }
        }
        return `${prefix}: ${message}`;
      }),
    ),
  });

  const logFile = isScheduler ? wakaq.schedulerLogFile : wakaq.workerLogFile;

  if (isChild || !logFile) {
    logger.add(new transports.Console());
  } else {
    logger.add(
      new transports.File({
        filename: logFile,
        level: level,
        handleExceptions: true,
        maxsize: 5242880, // 5MB
      }),
    );
  }
  return logger;
};
