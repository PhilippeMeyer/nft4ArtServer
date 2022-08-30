import { Request, Response } from "express";
import sharp from 'sharp';


async function mintTokenFromFiles(req: Request, res: Response){
    console.log(req.files);
    console.log(req.body);
    //const fileInput: object[] = req.files as object[];
    //fileInput.forEach((file: sharp.SharpOptions | undefined) => {sharp(file).resize({width:100}).toFile('test')});
    res.sendStatus(200);
}

export { mintTokenFromFiles };