import { Request, Response } from "express";


async function mintTokenFromFiles(req: Request, res: Response){
    console.log(req.files);
    console.log(req.body);
    res.sendStatus(200);
}

export { mintTokenFromFiles };