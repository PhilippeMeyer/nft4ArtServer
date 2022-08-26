import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";

import { RequestCustom } from "../../requestCustom.js"
import { logger } from "../../loggerConfiguration.js";
import { config } from "../../config.js"


//
// verifyToken
// Helper function to verify a token. This is called by the end points to verify if the JWT is valid
//
// When the token is expired, the PoS will reinitiate a login procedure which is simply performed through
// a biometric check
//
const verifyToken = (req: RequestCustom, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
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
        req.address = decoded.address;
        next();
    });
}

export { verifyToken };
