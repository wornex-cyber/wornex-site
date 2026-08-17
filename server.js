import express from "express";
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SMS_ONAY_API_KEY;
const SMS_BASE = "https://www.smsonayim.com/api";

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// --------------------------------------------------
// Database
// --------------------------------------------------

async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("Veritabanı hazır.");
}

initDatabase().catch((error) => {
  console.error("Veritabanı başlatma hatası:", error);
});

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function validId(value) {
  return /^[0-9]+$/.test(String(value));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, storedHash] =
    String(storedPassword).split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const hash = crypto.scryptSync(
    password,
    salt,
    64
  );

  const storedBuffer = Buffer.from(
    storedHash,
    "hex"
  );

  if (hash.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    hash,
    storedBuffer
  );
}

async function smsRequest(path) {
  const response = await fetch(
    `${SMS_BASE}${path}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `SmsOnay HTTP ${response.status}: ${text}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Geçersiz API cevabı: ${text}`
    );
  }
}

// --------------------------------------------------
// Health
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "VORNEX API",
  });
});

app.get("/api/config-status", (req, res) => {
  res.json({
    apiConfigured: Boolean(API_KEY),
    databaseConfigured: Boolean(
      process.env.DATABASE_URL
    ),
  });
});

// --------------------------------------------------
// Register
// --------------------------------------------------

app.post("/api/register", async (req, res) => {
  try {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ""
    );

    if (!email || !password) {
      return res.status(400).json({
        error: "E-posta ve şifre gerekli.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error:
          "Şifre en az 6 karakter olmalı.",
      });
    }

    const existing = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Bu e-posta zaten kayıtlı.",
      });
    }

    const passwordHash =
      hashPassword(password);

    const result = await db.query(
      `
      INSERT INTO users
        (email, password_hash, balance)
      VALUES
        ($1, $2, 0)
      RETURNING id, email, balance
      `,
      [email, passwordHash]
    );

    res.status(201).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Kayıt hatası:",
      error
    );

    res.status(500).json({
      error:
        "Kayıt sırasında bir hata oluştu.",
    });
  }
});

// --------------------------------------------------
// Login
// --------------------------------------------------

app.post("/api/login", async (req, res) => {
  try {
    const email = String(
      req.body.email || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ""
    );

    if (!email || !password) {
      return res.status(400).json({
        error: "E-posta ve şifre gerekli.",
      });
    }

    const result = await db.query(
      `
      SELECT
        id,
        email,
        password_hash,
        balance
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error:
          "E-posta veya şifre hatalı.",
      });
    }

    const user = result.rows[0];

    const valid = verifyPassword(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error:
          "E-posta veya şifre hatalı.",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        balance: user.balance,
      },
    });
  } catch (error) {
    console.error(
      "Giriş hatası:",
      error
    );

    res.status(500).json({
      error:
        "Giriş sırasında bir hata oluştu.",
    });
  }
});

// --------------------------------------------------
// SmsOnay Categories
// --------------------------------------------------

app.get(
  "/api/categories",
  async (req, res) => {
    try {
      const data =
        await smsRequest(
          "/getCategories"
        );

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "Kategoriler alınamadı.",
      });
    }
  }
);

// --------------------------------------------------
// Services
// --------------------------------------------------

app.get(
  "/api/services/:categoryId",
  async (req, res) => {
    const { categoryId } =
      req.params;

    if (!validId(categoryId)) {
      return res.status(400).json({
        success: false,
        message:
          "Geçersiz categoryId.",
      });
    }

    try {
      const data =
        await smsRequest(
          `/getServices/${categoryId}`
        );

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "Servisler alınamadı.",
      });
    }
  }
);

// --------------------------------------------------
// Service details
// --------------------------------------------------

app.get(
  "/api/service/:serviceId",
  async (req, res) => {
    const { serviceId } =
      req.params;

    if (!validId(serviceId)) {
      return res.status(400).json({
        success: false,
        message:
          "Geçersiz serviceId.",
      });
    }

    try {
      const data =
        await smsRequest(
          `/getServiceDetails/${serviceId}`
        );

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "Fiyat ve stok alınamadı.",
      });
    }
  }
);

// --------------------------------------------------
// Provider balance
// --------------------------------------------------

app.get(
  "/api/balance",
  async (req, res) => {
    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "SMS_ONAY_API_KEY ayarlanmamış.",
      });
    }

    try {
      const data =
        await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/getBalance`
        );

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "Bakiye alınamadı.",
      });
    }
  }
);

// --------------------------------------------------
// Order number
// --------------------------------------------------

app.get(
  "/api/order/:serviceId",
  async (req, res) => {
    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "SMS_ONAY_API_KEY ayarlanmamış.",
      });
    }

    const { serviceId } =
      req.params;

    if (!validId(serviceId)) {
      return res.status(400).json({
        success: false,
        message:
          "Geçersiz serviceId.",
      });
    }

    try {
      const data =
        await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/getNumber/${serviceId}`
        );

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "Numara alınamadı.",
      });
    }
  }
);

// --------------------------------------------------
// Read SMS
// --------------------------------------------------

app.get(
  "/api/message/:numberId",
  async (req, res) => {
    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "SMS_ONAY_API_KEY ayarlanmamış.",
      });
    }

    const { numberId } =
      req.params;

    if (!validId(numberId)) {
      return res.status(400).json({
        success: false,
        message:
          "Geçersiz numberId.",
      });
    }

    try {
      const data =
        await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/getMessage/${numberId}`
        );

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "SMS durumu alınamadı.",
      });
    }
  }
);

// --------------------------------------------------
// Cancel number
// --------------------------------------------------

app.get(
  "/api/cancel/:numberId",
  async (req, res) => {
    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        message:
          "SMS_ONAY_API_KEY ayarlanmamış.",
      });
    }

    const { numberId } =
      req.params;

    if (!validId(numberId)) {
      return res.status(400).json({
        success: false,
        message:
          "Geçersiz numberId.",
      });
    }

    try {
      const data =
        await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/cancelNumber/${numberId}`
        );

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "Numara iptal edilemedi.",
      });
    }
  }
);

// --------------------------------------------------
// Start
// --------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `VORNEX API ${PORT} portunda çalışıyor.`
    );
  }
);
