import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const app = express();
app.use(express.json());

// const SECRET = process.env.ZENCLASS_SECRET;
// if (!SECRET) {
//   console.warn("WARNING: ZENCLASS_SECRET is not set");
// }

// путь к файлу с событиями
const DATA_DIR = "data";
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");

// убеждаемся, что папка есть
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.post("/zenclass-webhook", (req, res) => {
  try {
    const { id, timestamp, hash, event_name, payload } = req.body;

    if (!id || !timestamp || !hash || !event_name) {
      return res.status(400).send("missing fields");
    }

    // проверяем подпись по схеме из статьи: secret&id&timestamp → sha1 → hash[page:1]
    // const s = `${SECRET}&${id}&${timestamp}`;
    // const expected = crypto.createHash("sha1").update(s).digest("hex");

    // if (expected !== hash) {
    //   console.warn("invalid hash for id", id);
    //   return res.status(400).send("invalid hash");
    // }

    const event = {
      id,
      timestamp,
      event_name,
      payload,
      received_at: Date.now()
    };

    const line = JSON.stringify(event) + "\n";

    fs.appendFile(EVENTS_FILE, line, (err) => {
      if (err) {
        console.error("write error", err);
        return res.status(500).send("write error");
      }
      res.send("ok");
    });
  } catch (e) {
    console.error("handler error", e);
    res.status(500).send("error");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("listening on", port);
});
