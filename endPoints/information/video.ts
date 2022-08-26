import { Request, Response } from "express";
import fs from "fs";
import path from "path";

import { logger } from "../../loggerConfiguration.js";


function video(req: Request, res: Response) {
    logger.info('server.playVideo %s', req.query.address);

    //TODO select the video to be played from the customer's address

    const filePath = path.join(__dirname, "public/sample-mp4-file.mp4");
    const stat = fs.statSync(filePath);
    const fileSize = stat.size
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    }
    res.writeHead(200, head)
    fs.createReadStream(filePath).pipe(res)
}

export { video };
