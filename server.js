import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const app = express();
app.use(express.json());

// несколько секретов через запятую: ZENCLASS_SECRETS="s1,s2,s3"
const SECRETS = (process.env.ZENCLASS_SECRETS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (SECRETS.length === 0) {
  console.warn("WARNING: ZENCLASS_SECRETS is not set");
}

// путь к файлу с событиями
const DATA_DIR = "data";
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");

// проверка, что папка есть
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// отдать сырой JSONL
app.get("/raw-json", (req, res) => {
  if (!fs.existsSync(EVENTS_FILE)) {
    return res.status(404).send("no file");
  }
  res.sendFile(EVENTS_FILE, { root: "." });
});

// основной вебхук
app.post("/zenclass-webhook", (req, res) => {
  try {
    const { id, timestamp, hash, event_name, payload } = req.body;

    if (!id || !timestamp || !hash || !event_name) {
      return res.status(400).send("missing fields");
    }

    // проверяем по любому из секретов
    const valid = SECRETS.some((secret) => {
      const s = `${secret}&${id}&${timestamp}`;
      const expected = crypto.createHash("sha1").update(s).digest("hex");
      return expected === hash;
    });

    if (!valid) {
      console.warn("invalid hash for id", id);
      return res.status(400).send("invalid hash");
    }

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
