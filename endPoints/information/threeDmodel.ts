import { Response } from "express";
import fs from "fs";
import path from "path";

import { app } from "../../app.js";
import { logger } from "../../loggerConfiguration.js";
import { RequestCustom } from "../../requestCustom.js";


//
// /apiV1/information/3Dmodel
// Returns the 3d model associated with a token
//
// Gets as input the token for which the 3D model is required
//

function threeDmodel(req: RequestCustom, res: Response) {
    logger.info('server.tokensOwned %s', req.address);

    const filePath = path.join(__dirname, "public/sample-mp4-file.mp4");
    const buff = fs.readFileSync(filePath);
    const buffB64 = buff.toString('base64');

    res.status(200).json({type: 'stl', data: buffB64});
}

export { threeDmodel };
