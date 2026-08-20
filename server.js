import express from "express";
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";
import { Vonage } from "@vonage/server-sdk";
const { Pool } = pg;

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SMS_ONAY_API_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET;
const SMS_BASE = "https://www.smsonayim.com/api";
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID;
const VONAGE_PRIVATE_KEY = process.env.VONAGE_PRIVATE_KEY;

const vonage = new Vonage({
  applicationId: VONAGE_APPLICATION_ID,
  privateKey: VONAGE_PRIVATE_KEY,
});
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

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone TEXT;
  `);

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      provider_number_id TEXT UNIQUE NOT NULL,
      category_id TEXT,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      country_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      sms_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
const activeOrderUsers = new Set();
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
          `SELECT id, email, balance, phone, phone_verified
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
  requireAuth,
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
    const categoryName = String(
  req.query.categoryName || ""
).trim();

const countryName = String(
  req.query.countryName || ""
).trim();

    if (!validId(serviceId)) {
      return res.status(400).json({
        success: false,
        message:
          "Geçersiz serviceId.",
      });
    }
    if (activeOrderUsers.has(req.userId)) {
      return res.status(429).json({
        success: false,
        message:
          "Sipariş işleminiz zaten devam ediyor."
      });
    }

    activeOrderUsers.add(req.userId);
    try {
           const serviceDetails =
        await smsRequest(
          `/getServiceDetails/${serviceId}`
        );

           const supplierPrice =
        Number(serviceDetails?.price);

      if (
        !Number.isFinite(supplierPrice) ||
        supplierPrice < 0
      ) {
        return res.status(502).json({
          success: false,
          message:
            "Geçersiz servis fiyatı."
        });
      }
      const salePrice =
        Math.ceil(
          Math.max(
            500,
            supplierPrice * 1.5
          )
        );
           const debitResult =
        await db.query(
          `
            UPDATE users
            SET balance = balance - $1
            WHERE id = $2
              AND balance >= $1
            RETURNING balance
          `,
          [
            salePrice,
            req.userId
          ]
        );

      if (debitResult.rows.length === 0) {
        return res.status(402).json({
          success: false,
          message:
            "Yetersiz bakiye."
        });
      }
           let data;

      try {
        data = await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/getNumber/${serviceId}`
        );
      } catch (providerError) {
        await db.query(
          `
            UPDATE users
            SET balance = balance + $1
            WHERE id = $2
          `,
          [
            salePrice,
            req.userId
          ]
        );

        throw providerError;
      }

      if (
        !data.success ||
        !data.number ||
        !data.number_id
      ) {
        await db.query(
          `
            UPDATE users
            SET balance = balance + $1
            WHERE id = $2
          `,
          [
            salePrice,
            req.userId
          ]
        );

        return res.status(502).json({
          success: false,
          message:
            data.message ||
            "Numara alınamadı."
        });
      }
       if (
        data.success &&
        data.number &&
        data.number_id
      ) {
        try {
          const orderInsert =
            await db.query(
              `
                INSERT INTO orders (
                  user_id,
                  provider_number_id,
                  service_id,
                  service_name,
                  country_name,
                  phone_number,
                  status,
                  price
                )
                VALUES (
                  $1, $2, $3, $4,
                  $5, $6, 'pending', $7
                )
                ON CONFLICT (provider_number_id)
                DO NOTHING
                RETURNING id
              `,
              [
                req.userId,
                String(data.number_id),
                String(serviceId),
                categoryName || "Servis",
                countryName || "Ülke",
                String(data.number),
                salePrice,
              ]
            );

          if (orderInsert.rows.length === 0) {
            throw new Error(
              "Sipariş kaydı oluşturulamadı."
            );
          }
        } catch (orderError) {
          try {
            await smsRequest(
              `/${encodeURIComponent(
                API_KEY
              )}/cancelNumber/${data.number_id}`
            );
          } catch (cancelError) {
            console.error(
              "Provider iptal hatası:",
              cancelError
            );
          }

          await db.query(
            `
              UPDATE users
              SET balance = balance + $1
              WHERE id = $2
            `,
            [
              salePrice,
              req.userId
            ]
          );

          throw orderError;
        }
      } 

      res.json(data);
    } catch (error) {
      console.error(error);

      res.status(502).json({
        success: false,
        message:
          "Numara alınamadı.",
      });
    } finally {
  activeOrderUsers.delete(req.userId);
}
  }
);
// --------------------------------------------------
// Kullanıcının siparişleri
// --------------------------------------------------

app.get(
  "/api/orders",
  requireAuth,
  async (req, res) => {
    try {
      const result = await db.query(
        `
          SELECT
            id,
            provider_number_id,
            service_id,
            service_name,
            country_name,
            phone_number,
            status,
            price,
            sms_code,
            created_at,
            updated_at
          FROM orders
          WHERE user_id = $1
          ORDER BY created_at DESC
        `,
        [req.userId]
      );

      const orders = result.rows;

      const activeOrders =
        orders.filter(
          (order) => order.status === "pending"
        ).length;

      const completedOrders =
        orders.filter(
          (order) => order.status === "completed"
        ).length;

      const totalSpent =
        orders.reduce(
          (total, order) =>
            total + Number(order.price || 0),
          0
        );

      res.json({
        success: true,
        orders,
        stats: {
          activeOrders,
          completedOrders,
          totalSpent,
        },
      });
    } catch (error) {
      console.error(
        "Sipariş listesi hatası:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Siparişler alınamadı.",
      });
    }
  }
);
// --------------------------------------------------
// Read SMS
// --------------------------------------------------

app.get(
  "/api/message/:numberId",
  requireAuth,
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
            const ownedOrder =
        await db.query(
          `
            SELECT id
            FROM orders
            WHERE provider_number_id = $1
              AND user_id = $2
            LIMIT 1
          `,
          [
            String(numberId),
            req.userId
          ]
        );

      if (ownedOrder.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Sipariş bulunamadı."
        });
      }
      const data =
        await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/getMessage/${numberId}`
        );
      if (Number(data.status) === 1) {
        await db.query(
          `
            UPDATE orders
            SET
              status = 'completed',
              sms_code = $1,
              updated_at = NOW()
            WHERE provider_number_id = $2
              AND user_id = $3
                      AND status = 'pending'
          `,
          [
            String(data.code || ""),
            String(numberId),
            req.userId
          ]
        );
      }
                 if (Number(data.status) === -1) {
        await db.query(
          `
            WITH cancelled_order AS (
              UPDATE orders
              SET
                status = 'cancelled',
                updated_at = NOW()
              WHERE provider_number_id = $1
                AND user_id = $2
                AND status = 'pending'
              RETURNING user_id, price
            )
            UPDATE users
            SET balance =
              users.balance + cancelled_order.price
            FROM cancelled_order
            WHERE users.id =
              cancelled_order.user_id
          `,
          [
            String(numberId),
            req.userId
          ]
        );
      }
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
    requireAuth,
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
    const ownedOrder =
      await db.query(
        `
          SELECT id
          FROM orders
          WHERE provider_number_id = $1
            AND user_id = $2
          LIMIT 1
        `,
        [
          String(numberId),
          req.userId
        ]
      );

    if (ownedOrder.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Sipariş bulunamadı."
      });
    }
    try {
      const data =
        await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/cancelNumber/${numberId}`
        );
           if (data.success) {
        await db.query(
          `
            WITH cancelled_order AS (
              UPDATE orders
              SET
                status = 'cancelled',
                updated_at = NOW()
              WHERE provider_number_id = $1
                AND user_id = $2
                AND status = 'pending'
              RETURNING user_id, price
            )
            UPDATE users
            SET balance =
              users.balance + cancelled_order.price
            FROM cancelled_order
            WHERE users.id =
              cancelled_order.user_id
          `,
          [
            String(numberId),
            req.userId
          ]
        );
      }
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
// ----------------------------------------------------
// VONAGE SMS OTP
// ----------------------------------------------------

const pendingVerifications = new Map();

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/\s+/g, "")
    .replace(/[()-]/g, "");
}

function isValidPhone(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}


// OTP GÖNDER
app.post("/api/verify/start", requireAuth, async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);

    if (!VONAGE_APPLICATION_ID || !VONAGE_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        message: "Vonage API ayarları eksik.",
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Telefon numarasını +905xxxxxxxxx formatında gir.",
      });
    }

    const previous = pendingVerifications.get(phone);

    if (
      previous &&
      Date.now() - previous.createdAt < 60_000
    ) {
      const remaining =
        Math.ceil(
          (60_000 - (Date.now() - previous.createdAt)) / 1000
        );

      return res.status(429).json({
        success: false,
        message: `Yeni kod için ${remaining} saniye bekle.`,
      });
    }

  const data = await vonage.verify2.newRequest({
  brand: "VORNEX",
  codeLength: 6,
  workflow: [
    {
      channel: "sms",
      to: phone,
    },
  ],
});

  

    const requestId = data.requestId;

    if (!requestId) {
      return res.status(502).json({
        success: false,
        message:
          "Vonage request ID döndürmedi.",
      });
    }

    pendingVerifications.set(
      phone,
      {
        requestId,
        userId: req.userId,
        createdAt: Date.now(),
        attempts: 0,
      }
    );

    return res.json({
      success: true,
      message: "Doğrulama kodu gönderildi.",
    });

  } catch (error) {
    console.error(
      "Verify start error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "SMS gönderilirken sunucu hatası oluştu.",
    });
  }
});


// OTP KONTROL
app.post("/api/verify/check", requireAuth, async (req, res) => {
  try {
    const phone =
      normalizePhone(req.body?.phone);

    const code =
      String(req.body?.code || "")
        .trim();

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz telefon numarası.",
      });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message:
          "6 haneli doğrulama kodunu gir.",
      });
    }

    const pending =
      pendingVerifications.get(phone);

    if (!pending) {
      return res.status(400).json({
        success: false,
        message:
          "Bu numara için aktif doğrulama bulunamadı.",
      });
    }
if (pending.userId !== req.userId) {
  return res.status(403).json({
    success: false,
    message: "Bu doğrulama isteği bu kullanıcıya ait değil.",
  });
}
    if (
      Date.now() - pending.createdAt >
      10 * 60_000
    ) {
      pendingVerifications.delete(phone);

      return res.status(410).json({
        success: false,
        message:
          "Doğrulama isteğinin süresi doldu.",
      });
    }

    if (pending.attempts >= 5) {
      pendingVerifications.delete(phone);

      return res.status(429).json({
        success: false,
        message:
          "Çok fazla hatalı deneme yapıldı.",
      });
    }

    pending.attempts += 1;

    const status = await vonage.verify2.checkCode(pending.requestId, code);

    if (status === "completed") {
      await db.query(
  `
    UPDATE users
    SET phone = $1,
        phone_verified = TRUE
    WHERE id = $2
  `,
  [phone, req.userId]
);
  pendingVerifications.delete(phone);

  return res.json({
    success: true,
    verified: true,
    message: "Telefon numarası doğrulandı.",
  });
}

return res.status(400).json({
  success: false,
  verified: false,
  message: "Doğrulama kodu geçersiz.",
});
   

  } catch (error) {
    console.error(
      "Verify check error:",
      error
    );

    return res.status(500).json({
      success: false,
      verified: false,
      message:
        "Kod kontrol edilirken sunucu hatası oluştu.",
    });
  }
});
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
