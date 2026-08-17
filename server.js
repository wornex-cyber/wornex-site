import express from "express";
import "dotenv/config";

import pg from "pg";

const app = express();
const { Pool } = pg;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

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
app.use(express.json()); 
app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "E-posta ve şifre gerekli."
      });
    }

    const existing = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Bu e-posta zaten kayıtlı."
      });
    }

    const crypto = await import("node:crypto");

    const salt = crypto.randomBytes(16).toString("hex");

    const hash = crypto.scryptSync(
      password,
      salt,
      64
    ).toString("hex");

    const passwordHash = `${salt}:${hash}`;

    const result = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, balance",
      [email, passwordHash]
    );

    res.status(201).json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Kayıt hatası:", error);
    res.status(500).json({
      error: "Kayıt sırasında bir hata oluştu."
    });
  }
});

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SMS_ONAY_API_KEY;
const SMS_BASE = "https://www.smsonayim.com/api";

// VORNEX frontend'in backend'e erişebilmesi için
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

async function smsRequest(path) {
  const response = await fetch(`${SMS_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`SmsOnay HTTP ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Geçersiz API cevabı: ${text}`);
  }
}

function validId(value) {
  return /^[0-9]+$/.test(String(value));
}

// Sunucu kontrolü
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "VORNEX API",
  });
});

// API key ayarlı mı?
app.get("/api/config-status", (req, res) => {
  res.json({
    apiConfigured: Boolean(API_KEY),
  });
});

// Kategoriler: Google, Discord vb.
app.get("/api/categories", async (req, res) => {
  try {
    const data = await smsRequest("/getCategories");
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "Kategoriler alınamadı.",
    });
  }
});

// Kategorideki ülkeler / servisler
app.get("/api/services/:categoryId", async (req, res) => {
  const { categoryId } = req.params;

  if (!validId(categoryId)) {
    return res.status(400).json({
      success: false,
      message: "Geçersiz categoryId.",
    });
  }

  try {
    const data = await smsRequest(`/getServices/${categoryId}`);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "Servisler alınamadı.",
    });
  }
});

// Fiyat ve stok
app.get("/api/service/:serviceId", async (req, res) => {
  const { serviceId } = req.params;

  if (!validId(serviceId)) {
    return res.status(400).json({
      success: false,
      message: "Geçersiz serviceId.",
    });
  }

  try {
    const data = await smsRequest(`/getServiceDetails/${serviceId}`);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "Fiyat ve stok alınamadı.",
    });
  }
});

// SmsOnay bakiyesi
app.get("/api/balance", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      message: "SMS_ONAY_API_KEY ayarlanmamış.",
    });
  }

  try {
    const data = await smsRequest(
      `/${encodeURIComponent(API_KEY)}/getBalance`
    );

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "Bakiye alınamadı.",
    });
  }
});

// Numara sipariş et
app.get("/api/order/:serviceId", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      message: "SMS_ONAY_API_KEY ayarlanmamış.",
    });
  }

  const { serviceId } = req.params;

  if (!validId(serviceId)) {
    return res.status(400).json({
      success: false,
      message: "Geçersiz serviceId.",
    });
  }

  try {
    const data = await smsRequest(
      `/${encodeURIComponent(API_KEY)}/getNumber/${serviceId}`
    );

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "Numara alınamadı.",
    });
  }
});

// Gelen SMS kodunu kontrol et
app.get("/api/message/:numberId", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      message: "SMS_ONAY_API_KEY ayarlanmamış.",
    });
  }

  const { numberId } = req.params;

  if (!validId(numberId)) {
    return res.status(400).json({
      success: false,
      message: "Geçersiz numberId.",
    });
  }

  try {
    const data = await smsRequest(
      `/${encodeURIComponent(API_KEY)}/getMessage/${numberId}`
    );

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "SMS durumu alınamadı.",
    });
  }
});

// Numarayı iptal et
app.get("/api/cancel/:numberId", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      message: "SMS_ONAY_API_KEY ayarlanmamış.",
    });
  }

  const { numberId } = req.params;

  if (!validId(numberId)) {
    return res.status(400).json({
      success: false,
      message: "Geçersiz numberId.",
    });
  }

  try {
    const data = await smsRequest(
      `/${encodeURIComponent(API_KEY)}/cancelNumber/${numberId}`
    );

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "Numara iptal edilemedi.",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VORNEX API ${PORT} portunda çalışıyor.`);
});
