import QRCode from "qrcode";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let res = await QRCode.toFile(path.join(__dirname, "etherAddr.png"), "0x420D91590Ac92492a0f042E60BEac3b6e2FF0e9B");
