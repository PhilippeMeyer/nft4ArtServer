import { LoggerOptionsWithTransports } from "express-winston";
import winston from "winston";

const logConf: LoggerOptionsWithTransports = {
    transports: [new winston.transports.Console()],
    format: winston.format.combine(winston.format.splat(), winston.format.colorize(), winston.format.simple()),
    meta: false,
    msg: "HTTP  ",
    expressFormat: true,
    colorize: false,
    ignoreRoute: () => false,
};

const { format, transports } = logConf;
const logger = winston.createLogger({ format, transports });

export {logConf, logger}