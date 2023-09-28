import * as fs from 'fs';
import { createLogger, format, transports } from 'winston';
import { WakaQ } from './wakaq';

export enum Level {
  INFO = 'info',
  ERROR = 'error',
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
    const s = fs.createWriteStream('/dev/null');
    logger.add(new transports.Stream({ level: level, stream: s }));
  } else {
    logger.add(
      new transports.File({
        filename: logFile,
        level: level,
        handleExceptions: true,
        maxFiles: 5, // You might need to adjust these settings
        maxsize: 5242880, // 5MB
      }),
    );
  }
  return logger;
};
