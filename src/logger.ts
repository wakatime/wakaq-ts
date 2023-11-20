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
      format.printf(({ level, message, stack }) => {
        let msg = `${new Date().toISOString()} ${level}`;
        const task = wakaq.currentTask;
        if (task) {
          msg = `${msg} in ${task.name}`;
        }
        msg = `${msg}: ${message}`;
        if (stack) {
          msg = `${msg} - ${stack}`;
        }
        return msg;
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
