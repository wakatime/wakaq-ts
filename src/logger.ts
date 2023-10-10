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
    format: format((info) => {
      const task = wakaq.currentTask;
      if (task) {
        info.message = `${new Date().toISOString()} ${info.level} in ${task.name}: ${info.message}`;
      } else {
        info.message = `${new Date().toISOString()} ${info.level}: ${info.message}`;
      }
      return info;
    })(),
  });

  const logFile = isScheduler ? wakaq.schedulerLogFile : wakaq.workerLogFile;

  if (isChild || !logFile) {
    logger.add(
      new transports.Console({
        format: format.simple(),
      }),
    );
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
