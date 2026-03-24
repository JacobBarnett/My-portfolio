import { readFileSync } from "fs";
import { join } from "path";

export default function handler(req, res) {
  const file = req.query.file;

  if (
    !file ||
    !["mining_physics.js", "mining_physics_bg.wasm"].includes(file)
  ) {
    return res.status(404).end();
  }

  const filePath = join(process.cwd(), "public", "wasm", file);
  const content = readFileSync(filePath);

  const contentType = file.endsWith(".wasm")
    ? "application/wasm"
    : "application/javascript";

  res.setHeader("Content-Type", contentType);
  res.status(200).send(content);
}
