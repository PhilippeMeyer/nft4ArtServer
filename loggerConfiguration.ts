import { LoggerOptionsWithTransports } from "express-winston";
import winston from "winston";

export const logConf: LoggerOptionsWithTransports = {
    transports: [new winston.transports.Console()],
    format: winston.format.combine(winston.format.splat(), winston.format.colorize(), winston.format.simple()),
    meta: false,
    msg: "HTTP  ",
    expressFormat: true,
    colorize: false,
    ignoreRoute: () => false,
};
