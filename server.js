import express from "express";
import crypto from "crypto";
import pkg from "pg";

const { Pool } = pkg;

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

// подключение к Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// health-check
app.get("/health-check", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1");
    res.json({ ok: true, db: r.rows[0]["?column?"] === 1 });
  } catch (e) {
    console.error("health error", e);
    res.status(500).json({ ok: false });
  }
});

// отдать сырые последние N событий
app.get("/events-latest", async (req, res) => {
  const limit = Number(req.query.limit || 50);
  try {
    const r = await pool.query(
      "SELECT id, timestamp, event_name, payload, received_at FROM events ORDER BY received_at DESC LIMIT $1",
      [limit]
    );
    res.json({ ok: true, events: r.rows });
  } catch (e) {
    console.error("select error", e);
    res.status(500).json({ ok: false });
  }
});

// основной вебхук
app.post("/zenclass-webhook", async (req, res) => {
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

    // вставляем в БД (идемпотентно по id)
    await pool.query(
      `INSERT INTO events (id, timestamp, event_name, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id, timestamp, event_name, payload]
    );

    res.send("ok");
  } catch (e) {
    console.error("handler error", e);
    res.status(500).send("error");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("listening on", port);
});
