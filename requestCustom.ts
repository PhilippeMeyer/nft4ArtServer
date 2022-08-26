import { Request } from "express";

export interface RequestCustom extends Request {
    deviceId?: string;
    manager?: string;
    address?: string;
    appId?: string;
}
