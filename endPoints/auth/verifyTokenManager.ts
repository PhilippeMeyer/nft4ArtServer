import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";

import { RequestCustom } from "../../requestCustom.js"
import { logger } from "../../loggerConfiguration.js";
import { config } from "../../config.js"


//
// verifyTokenManager
// Helper function to verify if a token belongs to a manager This is called by the end points to verify if the JWT is valid and owned by a manager
//
// When the token is expired, the PoS will reinitiate a login procedure which is simply performed through
// a biometric check
//
const verifyTokenManager = (req: RequestCustom, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        logger.info("server.verifyToken.missingToken");
        return res.status(401).json({
            error: { message: "No token provided!", name: "NoTokenProvided" },
        });
    }
    jwt.verify(token, config.secret, (err: any, decoded: any) => {
        if (err) {
            const status = err.name == "TokenExpiredError" ? 401 : 403;

            return res.status(status).json({
                error: err,
            });
        }

        req.deviceId = decoded.id;
        req.manager = decoded.manager;
        if (!req.manager)
            return res.status(403).json({
                error: { message: "Not authorized !", name: "NotAuthorized" },
            });

        next();
    });
}

export { verifyTokenManager };
