import { Request, Response } from "express";


import { logger } from "../../loggerConfiguration.js";
import * as dbPos from '../../services/db.js';

//
// /apiV1/auth/authorizePoS, parameter: PoS, the name of the PoS, authorized: true or false
//
// This end point authorizes or not a PoS
//
// Inputs : 
// - poS: the id of the PoS
// - authorized: true or false
//

function authorizePoS(req: Request, res: Response) {
    logger.info('server.authorizePoS');

    if (typeof req.query.PoS === "undefined") {
        logger.warn('server.authorizePoS.undefinedPoS');
        res.sendStatus(400).json({ error: { name: "noPoSSpecified", message: "The Point of Sale is missing"}});
        return;
    }
    if (typeof req.query.authorized === "undefined") {
        logger.warn('server.authorizePoS.undefinedAuthorization');
        res.sendStatus(400).json({ error: { name: "noAuthorizationSpecified", message: "The Point of Sale authorization is missing"}} );
        return;
    }

    const pos: any = dbPos.findRegisteredPos(req.query.PoS as string);
    if (pos == null) {
        logger.warn('server.authorizePoS.noPoSRegistered');
        res.sendStatus(400).json({ error: { name: "nonExistingPoS", message: "The Point of Sale does not exist" }} );
        return;
    }
    pos.authorized = req.query.authorized == "true" ? true : false;
    dbPos.updateAuthorizedRegisteredPos(req.query.PoS as string, pos.authorized);
    res.sendStatus(200);
}

export { authorizePoS };