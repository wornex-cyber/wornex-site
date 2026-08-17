import express from "express";
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SMS_ONAY_API_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET;
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

// index.html, app.js, styles.css vb. dosyaları sun
app.use(express.static("."));

// Frontend erişimi
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
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

// --------------------------------------------------
// Auth token
// --------------------------------------------------

function createAuthToken(userId) {
  if (!AUTH_SECRET) {
    throw new Error("AUTH_SECRET ayarlanmamış.");
  }

  const payload = Buffer.from(
    JSON.stringify({
      userId,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!AUTH_SECRET || !token) {
    return null;
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(payload)
      .digest("base64url");

    const signatureBuffer = Buffer.from(
      signature,
      "utf8"
    );

    const expectedBuffer = Buffer.from(
      expectedSignature,
      "utf8"
    );

    if (
      signatureBuffer.length !==
      expectedBuffer.length
    ) {
      return null;
    }

    if (
      !crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer
      )
    ) {
      return null;
    }

    const data = JSON.parse(
      Buffer.from(
        payload,
        "base64url"
      ).toString("utf8")
    );

    if (
      !data.userId ||
      !data.expiresAt ||
      Date.now() > data.expiresAt
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

// Şimdilik tanımlıyoruz ama siparişlere henüz
// uygulamıyoruz. Frontend hazır olunca kullanacağız.
function requireAuth(req, res, next) {
  const authHeader =
    req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Giriş yapmanız gerekiyor.",
    });
  }

  const token = authHeader.slice(7);

  const auth = verifyAuthToken(token);

  if (!auth) {
    return res.status(401).json({
      success: false,
      error:
        "Oturum geçersiz veya süresi dolmuş.",
    });
  }

  req.userId = auth.userId;

  next();
}

// --------------------------------------------------
// Password
// --------------------------------------------------

function hashPassword(password) {
  const salt = crypto
    .randomBytes(16)
    .toString("hex");

  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(
  password,
  storedPassword
) {
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

  if (
    hash.length !== storedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    hash,
    storedBuffer
  );
}

// --------------------------------------------------
// SmsOnay helper
// --------------------------------------------------

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

app.get(
  "/api/config-status",
  (req, res) => {
    res.json({
      apiConfigured: Boolean(API_KEY),
      databaseConfigured: Boolean(
        process.env.DATABASE_URL
      ),
      authConfigured: Boolean(
        AUTH_SECRET
      ),
    });
  }
);

// --------------------------------------------------
// Register
// --------------------------------------------------

app.post(
  "/api/register",
  async (req, res) => {
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
          error:
            "E-posta ve şifre gerekli.",
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          error:
            "Şifre en az 6 karakter olmalı.",
        });
      }

      const existing =
        await db.query(
          "SELECT id FROM users WHERE email = $1",
          [email]
        );

      if (
        existing.rows.length > 0
      ) {
        return res.status(409).json({
          error:
            "Bu e-posta zaten kayıtlı.",
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

      const user = result.rows[0];

      const token =
        createAuthToken(user.id);

      res.status(201).json({
        success: true,
        token,
        user,
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
  }
);

// --------------------------------------------------
// Login
// --------------------------------------------------

app.post(
  "/api/login",
  async (req, res) => {
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
          error:
            "E-posta ve şifre gerekli.",
        });
      }

      const result =
        await db.query(
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

      if (
        result.rows.length === 0
      ) {
        return res.status(401).json({
          error:
            "E-posta veya şifre hatalı.",
        });
      }

      const user =
        result.rows[0];

      const valid =
        verifyPassword(
          password,
          user.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "E-posta veya şifre hatalı.",
        });
      }

      const token =
        createAuthToken(user.id);

      res.json({
        success: true,
        token,
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
  }
);

// --------------------------------------------------
// Kullanıcı bilgisi
// Henüz frontend kullanmıyor ama hazır.
// --------------------------------------------------

app.get(
  "/api/me",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await db.query(
          `
          SELECT id, email, balance
          FROM users
          WHERE id = $1
          `,
          [req.userId]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Kullanıcı bulunamadı.",
        });
      }

      res.json({
        success: true,
        user: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Kullanıcı bilgisi hatası:",
        error
      );

      res.status(500).json({
        error:
          "Kullanıcı bilgisi alınamadı.",
      });
    }
  }
);

// --------------------------------------------------
// Categories
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
// Şimdilik mevcut davranışı bozmuyoruz.
// Sonraki aşamada admin-only olacak.
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
// Order
//
// ÖNEMLİ:
// requireAuth henüz burada kullanılmıyor.
// Frontend token göndermeye başladıktan sonra:
// app.get("/api/order/:serviceId",
//   requireAuth,
//   async (...)
// yapacağız.
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
