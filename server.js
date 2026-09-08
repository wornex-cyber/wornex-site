import express from "express";
import helmet from "helmet";
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";
import { Vonage } from "@vonage/server-sdk";
import Iyzipay from "iyzipay";
const { Pool } = pg;

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SMS_ONAY_API_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET;
const SMS_BASE = "https://www.smsonayim.com/api";
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID;
const VONAGE_PRIVATE_KEY = process.env.VONAGE_PRIVATE_KEY;
const IYZICO_API_KEY =
  process.env.IYZICO_API_KEY;

const IYZICO_SECRET_KEY =
  process.env.IYZICO_SECRET_KEY;

const IYZICO_BASE_URL =
  process.env.IYZICO_BASE_URL ||
  "https://sandbox-api.iyzipay.com";
const IYZICO_IS_SANDBOX =
  IYZICO_BASE_URL.includes(
    "sandbox-api.iyzipay.com"
  );
const SHOPIER_API_BASE_URL =
  "https://api.shopier.com/v1";

const SHOPIER_PAT =
  process.env.SHOPIER_PAT;

const SHOPIER_WEBHOOK_TOKEN =
  process.env.SHOPIER_WEBHOOK_TOKEN;

const SHOPIER_ACCOUNT_ID =
  process.env.SHOPIER_ACCOUNT_ID;
const SHOPIER_PRODUCT_IMAGE_URL =
  process.env.SHOPIER_PRODUCT_IMAGE_URL;
const SHOPIER_PAYMENTS_ENABLED =
  process.env.SHOPIER_PAYMENTS_ENABLED ===
  "true";
const PAYMENT_TEST_EMAILS =
  new Set(
    String(
      process.env.PAYMENT_TEST_EMAILS || ""
    )
      .split(",")
      .map((email) =>
        email.trim().toLowerCase()
      )
      .filter(Boolean)
  );

const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ||
  "https://wornex-api.onrender.com";
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://wornex-web.onrender.com";
const vonage = new Vonage({
  applicationId: VONAGE_APPLICATION_ID,
  privateKey: VONAGE_PRIVATE_KEY,
});
const iyzipay =
  IYZICO_API_KEY &&
  IYZICO_SECRET_KEY
    ? new Iyzipay({
        apiKey: IYZICO_API_KEY,
        secretKey: IYZICO_SECRET_KEY,
        uri: IYZICO_BASE_URL,
      })
    : null;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(
  express.json({
    limit: "32kb",
    verify: (req, res, buffer) => {
      if (
        req.originalUrl ===
        "/api/shopier/webhook"
      ) {
        req.rawBody =
          Buffer.from(buffer);
      }
    },
  })
);
app.use(
  express.urlencoded({
    extended: false,
    limit: "32kb",
  })
);
app.use(
  helmet({
    contentSecurityPolicy: {
  reportOnly: true,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: [
      "'self'",
      "https://cdnjs.cloudflare.com",
    ],
    fontSrc: [
      "'self'",
      "https://cdnjs.cloudflare.com",
      "data:",
    ],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: [
      "'self'",
      BACKEND_ORIGIN,
    ],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
    upgradeInsecureRequests: null,
  },
},
  })
);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );
  }

  next();
});
const PUBLIC_FILES = new Set([
  "/",
  "/index.html",
  "/app.js",
  "/topup.js",
  "/panel.js",
  "/styles.css",
  "/favicon.svg",
  "/shopier-product.png",
  "/panel.html",
  "/privacy.html",
  "/topup.html",
]);

app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    PUBLIC_FILES.has(req.path)
  ) {
    return next();
  }

  return res.sendStatus(404);
});

app.use(
  express.static(".", {
    dotfiles: "deny",
    index: "index.html",
  })
);
// Frontend erişimi
app.use((req, res, next) => {
  res.setHeader(
  "Access-Control-Allow-Origin",
  FRONTEND_ORIGIN
);

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
    CREATE UNIQUE INDEX IF NOT EXISTS
      users_phone_unique_idx
    ON users (phone)
    WHERE phone IS NOT NULL;
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
    await db.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      conversation_id TEXT UNIQUE NOT NULL,
      iyzico_token TEXT UNIQUE,
      amount NUMERIC(12, 2) NOT NULL
        CHECK (amount > 0),
      status TEXT NOT NULL DEFAULT 'pending',
      payment_id TEXT,
      error_message TEXT,
      credited_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS
      payments_user_created_idx
    ON payments (
      user_id,
      created_at DESC
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS
      shopier_topups (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        reference_code TEXT UNIQUE NOT NULL,
        product_id TEXT UNIQUE,
        product_url TEXT,
        order_id TEXT UNIQUE,
        webhook_id TEXT UNIQUE,
        amount NUMERIC(12, 2) NOT NULL
          CHECK (
            amount IN (
              10,
              100,
              250,
              500,
              1000,
              2500
            )
          ),
        status TEXT NOT NULL
          DEFAULT 'pending',
        error_message TEXT,
        credited_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW()
      );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS
      shopier_topups_user_created_idx
    ON shopier_topups (
      user_id,
      created_at DESC
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
function validEmail(value) {
  const email = String(value);

  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}
const activeOrderUsers = new Set();
function createRateLimiter({
  windowMs,
  maxRequests,
  keyGenerator,
  message,
}) {
  const buckets = new Map();
  const cleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) {
        buckets.delete(key);
      }
    }
  }, Math.min(
    windowMs,
    15 * 60 * 1000
  ));

  cleanupTimer.unref();
  return (req, res, next) => {
    const now = Date.now();

    const key = String(
      keyGenerator
        ? keyGenerator(req)
        : req.ip ||
          req.socket.remoteAddress ||
          "unknown"
    );

    const current = buckets.get(key);

    if (
      !current ||
      now >= current.resetAt
    ) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      return next();
    }

    if (current.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message:
          message ||
          "Çok fazla istek gönderdiniz. Biraz bekleyin.",
      });
    }

    current.count += 1;
    next();
  };
}
const loginRateLimiter =
  createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message:
      "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.",
  });

const registerRateLimiter =
  createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    message:
      "Çok fazla kayıt denemesi. Daha sonra tekrar deneyin.",
  });
const orderRateLimiter =
  createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyGenerator:
      (req) => req.userId,
    message:
      "Çok fazla sipariş denemesi. 1 dakika bekleyin.",
  });
const otpStartRateLimiter =
  createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    keyGenerator:
      (req) => req.userId,
    message:
      "Çok fazla doğrulama kodu istediniz. 1 saat sonra tekrar deneyin.",
  });
const otpCheckRateLimiter =
  createRateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 5,
    keyGenerator:
      (req) => req.userId,
    message:
      "Çok fazla doğrulama kodu denediniz. 10 dakika bekleyin.",
  });
const messagePollRateLimiter =
  createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyGenerator:
      (req) => req.userId,
    message:
      "Çok fazla SMS sorgusu gönderdiniz. 1 dakika bekleyin.",
  });
const cancelRateLimiter =
  createRateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyGenerator:
      (req) => req.userId,
    message:
      "Çok fazla iptal isteği gönderdiniz. 10 dakika bekleyin.",
  });
const paymentRateLimiter =
  createRateLimiter({
    windowMs: 10 * 60 * 1000,
    maxRequests: 5,
    keyGenerator:
      (req) => req.userId,
    message:
      "Çok fazla ödeme başlatma isteği gönderdiniz. 10 dakika sonra tekrar deneyin.",
  });
const catalogRateLimiter =
  createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 60,
    message:
      "Çok fazla servis sorgusu gönderdiniz. 1 dakika bekleyin.",
  });
const accountReadRateLimiter =
  createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 120,
    keyGenerator:
      (req) => req.userId,
    message:
      "Çok fazla hesap sorgusu gönderdiniz. 1 dakika bekleyin.",
  });
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
async function requireVerifiedPhone(
  req,
  res,
  next
) {
  try {
    const result = await db.query(
      `
        SELECT phone_verified
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Kullanıcı bulunamadı.",
      });
    }

    if (!result.rows[0].phone_verified) {
      return res.status(403).json({
        success: false,
        code:
          "PHONE_VERIFICATION_REQUIRED",
        message:
          "Sipariş vermeden önce telefonunu doğrulamalısın.",
      });
    }

    next();
  } catch (error) {
    console.error(
      "Telefon doğrulama kontrolü hatası:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Telefon doğrulama durumu kontrol edilemedi.",
    });
  }
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
async function getProviderBalance() {
  const data = await smsRequest(
    `/${encodeURIComponent(API_KEY)}/getBalance`
  );

  const balance = Number(data?.balance);

  if (!Number.isFinite(balance) || balance < 0) {
    throw new Error("Geçersiz sağlayıcı bakiye cevabı.");
  }

  return balance;
}
async function finalizeCancellationAndRefund(
  numberId,
  userId
) {
  const result = await db.query(
    `
      WITH cancelled_order AS (
        UPDATE orders
        SET
          status = 'cancelled',
          updated_at = NOW()
        WHERE provider_number_id = $1
          AND user_id = $2
          AND status IN ('pending', 'cancelling')
        RETURNING user_id, price
      ),
      refunded_user AS (
        UPDATE users
        SET balance =
          users.balance + cancelled_order.price
        FROM cancelled_order
        WHERE users.id =
          cancelled_order.user_id
        RETURNING users.id
      )
      SELECT COUNT(*)::int AS refunded_count
      FROM refunded_user
    `,
    [
      String(numberId),
      userId
    ]
  );

  return result.rows[0]?.refunded_count === 1;
}
let cancellationReconciliationRunning = false;

async function reconcileCancellingOrders() {
  if (cancellationReconciliationRunning || !API_KEY) {
    return;
  }

  cancellationReconciliationRunning = true;

  try {
    const result = await db.query(
      `
        SELECT provider_number_id, user_id
        FROM orders
        WHERE status = 'cancelling'
          AND updated_at <
            NOW() - INTERVAL '30 seconds'
        ORDER BY updated_at ASC
        LIMIT 20
      `
    );

    for (const order of result.rows) {
      try {
        const data = await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/getMessage/${order.provider_number_id}`
        );

        if (Number(data.status) === -1) {
          await finalizeCancellationAndRefund(
            order.provider_number_id,
            order.user_id
          );
          continue;
        }

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
                AND status = 'cancelling'
            `,
            [
              String(data.code || ""),
              String(order.provider_number_id),
              order.user_id
            ]
          );
        }
      } catch (error) {
        console.error(
          "İptal toparlama hatası:",
          error
        );
      }
    }
  } finally {
    cancellationReconciliationRunning = false;
  }
}
// --------------------------------------------------
// Shopier helpers
// --------------------------------------------------

async function shopierRequest(
  path,
  {
    method = "GET",
    body,
  } = {}
) {
  if (!SHOPIER_PAT) {
    throw new Error(
      "Shopier erişim anahtarı eksik."
    );
  }

  if (
    typeof path !== "string" ||
    !path.startsWith("/")
  ) {
    throw new Error(
      "Geçersiz Shopier API yolu."
    );
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const headers = {
      Accept: "application/json",
      Authorization:
        `Bearer ${SHOPIER_PAT}`,
    };

    if (body !== undefined) {
      headers["Content-Type"] =
        "application/json";
    }

    const response = await fetch(
      `${SHOPIER_API_BASE_URL}${path}`,
      {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
        signal: controller.signal,
      }
    );

    const responseText =
      await response.text();

    let data = null;

    if (responseText) {
      try {
        data =
          JSON.parse(responseText);
      } catch {
        data = {
          message:
            "Shopier geçersiz JSON cevabı döndürdü.",
        };
      }
    }

    if (!response.ok) {
      const error = new Error(
        data?.message ||
        `Shopier API hatası: ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        "Shopier API isteği zaman aşımına uğradı."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
async function createShopierTopupProduct({
  amount,
  referenceCode,
}) {
  if (!isAllowedTopupAmount(amount)) {
    throw new Error(
      "Geçersiz Shopier yükleme tutarı."
    );
  }

  if (!SHOPIER_PRODUCT_IMAGE_URL) {
    throw new Error(
      "Shopier ürün görseli ayarı eksik."
    );
  }

  const product =
    await shopierRequest(
      "/products",
      {
        method: "POST",
        body: {
          title:
            `VORNEX ${amount} TL Bakiye Paketi`,
          description:
            `VORNEX dijital bakiye paketi. Referans: ${referenceCode}`,
          type: "digital",
          media: [
            {
              type: "image",
              url:
                SHOPIER_PRODUCT_IMAGE_URL,
              placement: 1,
            },
          ],
          priceData: {
            currency: "TRY",
            price:
              Number(amount).toFixed(2),
          },
          stockQuantity: 1,
          shippingPayer: "sellerPays",
          customListing: true,
        },
      }
    );

  const productId =
    normalizePaymentField(
      product?.id,
      120
    );

  const productUrl =
    normalizePaymentField(
      product?.url,
      500
    );

  let parsedProductUrl;

  try {
    parsedProductUrl =
      new URL(productUrl);
  } catch {
    throw new Error(
      "Shopier geçersiz ürün bağlantısı döndürdü."
    );
  }

  const allowedHost =
    parsedProductUrl.hostname ===
      "shopier.com" ||
    parsedProductUrl.hostname ===
      "www.shopier.com";

  if (
    !productId ||
    parsedProductUrl.protocol !==
      "https:" ||
    !allowedHost
  ) {
    throw new Error(
      "Shopier ürün cevabı doğrulanamadı."
    );
  }

  return {
    productId,
    productUrl:
      parsedProductUrl.toString(),
  };
}
function verifyShopierSignature(
  payload,
  receivedSignature
) {
  if (!SHOPIER_WEBHOOK_TOKEN) {
    return false;
  }

  const signature =
    normalizePaymentField(
      receivedSignature,
      128
    ).toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(signature)) {
    return false;
  }

  const calculatedSignature =
    crypto
      .createHmac(
        "sha256",
        SHOPIER_WEBHOOK_TOKEN
      )
      .update(JSON.stringify(payload))
      .digest("hex");

  const receivedBuffer =
    Buffer.from(signature, "hex");

  const calculatedBuffer =
    Buffer.from(
      calculatedSignature,
      "hex"
    );

  return (
    receivedBuffer.length ===
      calculatedBuffer.length &&
    crypto.timingSafeEqual(
      receivedBuffer,
      calculatedBuffer
    )
  );
}

function shopierMoneyMatches(
  value,
  expected
) {
  const receivedAmount =
    Number(value);

  const expectedAmount =
    Number(expected);

  return (
    Number.isFinite(receivedAmount) &&
    Number.isFinite(expectedAmount) &&
    Math.abs(
      receivedAmount -
      expectedAmount
    ) < 0.001
  );
}
// --------------------------------------------------
// Iyzico helpers
// --------------------------------------------------
const ALLOWED_TOPUP_AMOUNTS =
  new Set([
    10, 
    100,
    250,
    500,
    1000,
    2500,
  ]);

function normalizePaymentField(
  value,
  maxLength = 120
) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function isAllowedTopupAmount(value) {
  const amount = Number(value);

  return (
    Number.isInteger(amount) &&
    ALLOWED_TOPUP_AMOUNTS.has(amount)
  );
}
function buildCheckoutRequest({
  paymentId,
  conversationId,
  amount,
  user,
  buyer,
  ip,
}) {
  const price =
    Number(amount).toFixed(2);

  const contactName =
    `${buyer.name} ${buyer.surname}`;

  return {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price,
    paidPrice: price,
    currency: Iyzipay.CURRENCY.TRY,
    basketId: `TOPUP-${paymentId}`,
    paymentGroup:
      Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl:
      `${BACKEND_ORIGIN}/api/payments/callback`,

    buyer: {
      id: String(user.id),
      name: buyer.name,
      surname: buyer.surname,
      gsmNumber: user.phone,
      email: user.email,
      identityNumber:
        buyer.identityNumber,
      registrationAddress:
        buyer.address,
      ip,
      city: buyer.city,
      country: "Turkey",
      zipCode: buyer.zipCode,
    },

    shippingAddress: {
      contactName,
      city: buyer.city,
      country: "Turkey",
      address: buyer.address,
      zipCode: buyer.zipCode,
    },

    billingAddress: {
      contactName,
      city: buyer.city,
      country: "Turkey",
      address: buyer.address,
      zipCode: buyer.zipCode,
    },

    basketItems: [
      {
        id: String(paymentId),
        name: "VORNEX Bakiye",
        category1:
          "Dijital Hizmet",
        itemType:
          Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price,
      },
    ],
  };
}
function initializeCheckoutForm(request) {
  return new Promise(
    (resolve, reject) => {
      iyzipay.checkoutFormInitialize.create(
        request,
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        }
      );
    }
  );
}

function retrieveCheckoutForm(request) {
  return new Promise(
    (resolve, reject) => {
      iyzipay.checkoutForm.retrieve(
        request,
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        }
      );
    }
  );
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
  requireAuth,
  (req, res) => {
    res.json({
      apiConfigured: Boolean(API_KEY),
      databaseConfigured: Boolean(
        process.env.DATABASE_URL
      ),
      authConfigured: Boolean(
        AUTH_SECRET
      ),
      iyzicoConfigured: Boolean(
      IYZICO_API_KEY &&
      IYZICO_SECRET_KEY
      ),
    });
  }
);

// --------------------------------------------------
// Register
// --------------------------------------------------

app.post(
  "/api/register",
 registerRateLimiter,
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
if (!validEmail(email)) {
  return res.status(400).json({
    error:
      "Geçerli bir e-posta adresi girin.",
  });
}
     if (
  password.length < 8 ||
  password.length > 128
) {
  return res.status(400).json({
    error:
      "Şifre 8–128 karakter arasında olmalı.",
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
  loginRateLimiter,
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
if (
  !validEmail(email) ||
  password.length > 128
) {
  return res.status(401).json({
    error:
      "E-posta veya şifre hatalı.",
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
  accountReadRateLimiter,
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
  catalogRateLimiter,
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
  catalogRateLimiter,
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
  catalogRateLimiter,
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

app.post(
  "/api/order/:serviceId",
  requireAuth,
  requireVerifiedPhone,
  orderRateLimiter,
  async (req, res) => {
      if (process.env.ORDERS_ENABLED !== "true") {
      return res.status(403).json({
        success: false,
        message: "Sipariş sistemi şu anda test modunda kapalı."
      });
    }
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
     const providerBalance = await getProviderBalance();

if (providerBalance < supplierPrice) {
  return res.status(503).json({
    success: false,
    message: "SMS sağlayıcısında bu sipariş için yeterli bakiye yok."
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
  accountReadRateLimiter,
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
 messagePollRateLimiter,
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
       await finalizeCancellationAndRefund(
  numberId,
  req.userId
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

app.post(
  "/api/cancel/:numberId",
  requireAuth,
  cancelRateLimiter,
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
    const cancelClaim = await db.query(
  `
    UPDATE orders
    SET
      status = 'cancelling',
      updated_at = NOW()
    WHERE provider_number_id = $1
      AND user_id = $2
      AND status = 'pending'
    RETURNING id
  `,
  [
    String(numberId),
    req.userId
  ]
);

if (cancelClaim.rows.length === 0) {
  return res.status(409).json({
    success: false,
    message:
      "Bu sipariş iptal edilemez veya iptal işlemi zaten devam ediyor."
  });
}
      const data =
        await smsRequest(
          `/${encodeURIComponent(
            API_KEY
          )}/cancelNumber/${numberId}`
        );
           if (data.success) {
       await finalizeCancellationAndRefund(
  numberId,
  req.userId
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
// --------------------------------------------------
// SHOPIER WEBHOOK
// --------------------------------------------------

app.post(
  "/api/shopier/webhook",
  async (req, res) => {
    const webhookId =
      normalizePaymentField(
        req.get("Shopier-Webhook-Id"),
        120
      );

    const accountId =
      normalizePaymentField(
        req.get("Shopier-Account-Id"),
        120
      );

    const eventName =
      normalizePaymentField(
        req.get("Shopier-Event"),
        120
      );

    const signature =
      normalizePaymentField(
        req.get("Shopier-Signature"),
        128
      );

    const timestamp =
      normalizePaymentField(
        req.get("Shopier-Timestamp"),
        40
      );

    if (
      !SHOPIER_PAT ||
      !SHOPIER_WEBHOOK_TOKEN ||
      !SHOPIER_ACCOUNT_ID
    ) {
      console.error(
        "Shopier webhook ayarları eksik."
      );

      return res.sendStatus(503);
    }

    if (
      !webhookId ||
      !accountId ||
      !eventName ||
      !signature ||
      !timestamp
    ) {
      return res.sendStatus(400);
    }

    if (accountId !== SHOPIER_ACCOUNT_ID) {
      return res.sendStatus(403);
    }

    if (
      !verifyShopierSignature(
        req.body,
        signature
      )
    ) {
      return res.sendStatus(401);
    }

    if (eventName !== "order.created") {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    const orderId =
      normalizePaymentField(
        req.body?.id,
        120
      );

    if (!orderId) {
      return res.sendStatus(400);
    }

    let client = null;

    try {
      const verifiedOrder =
        await shopierRequest(
          `/orders/${encodeURIComponent(
            orderId
          )}`
        );

      const verifiedOrderId =
        normalizePaymentField(
          verifiedOrder?.id,
          120
        );

      const paymentStatus =
        normalizePaymentField(
          verifiedOrder?.paymentStatus,
          40
        ).toLowerCase();

      const currency =
        normalizePaymentField(
          verifiedOrder?.currency,
          10
        ).toUpperCase();

      const lineItems =
        Array.isArray(
          verifiedOrder?.lineItems
        )
          ? verifiedOrder.lineItems
          : [];

      if (
        verifiedOrderId !== orderId ||
        paymentStatus !== "paid" ||
        currency !== "TRY" ||
        lineItems.length !== 1
      ) {
        console.error(
          "Shopier siparişi doğrulanamadı:",
          orderId
        );

        return res.status(200).json({
          received: true,
          credited: false,
        });
      }

      const item =
        lineItems[0];

      const productId =
        normalizePaymentField(
          item?.productId,
          120
        );

      const quantity =
        Number(item?.quantity);

      if (
        !productId ||
        !Number.isInteger(quantity) ||
        quantity !== 1
      ) {
        return res.status(200).json({
          received: true,
          credited: false,
        });
      }

      client =
        await db.connect();

      await client.query("BEGIN");

      const topupResult =
        await client.query(
          `
            SELECT
              id,
              user_id,
              amount,
              status,
              order_id,
              credited_at
            FROM shopier_topups
            WHERE product_id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [productId]
        );

      if (topupResult.rows.length === 0) {
        await client.query("COMMIT");

        return res.status(200).json({
          received: true,
          ignored: true,
        });
      }

      const topup =
        topupResult.rows[0];

      if (topup.credited_at) {
        await client.query("COMMIT");

        return res.status(200).json({
          received: true,
          credited: true,
          duplicate: true,
        });
      }

      const orderTotal =
        verifiedOrder?.totals?.total;

      const validMoney =
        shopierMoneyMatches(
          orderTotal,
          topup.amount
        ) &&
        shopierMoneyMatches(
          item?.price,
          topup.amount
        ) &&
        shopierMoneyMatches(
          item?.total,
          topup.amount
        );

      if (!validMoney) {
        await client.query(
          `
            UPDATE shopier_topups
            SET
              status = 'failed',
              error_message =
                'Shopier sipariş tutarı eşleşmedi.',
              updated_at = NOW()
            WHERE id = $1
          `,
          [topup.id]
        );

        await client.query("COMMIT");

        return res.status(200).json({
          received: true,
          credited: false,
        });
      }

      const creditResult =
        await client.query(
          `
            UPDATE shopier_topups
            SET
              order_id = $1,
              webhook_id = $2,
              status = 'completed',
              error_message = NULL,
              credited_at = NOW(),
              updated_at = NOW()
            WHERE id = $3
              AND credited_at IS NULL
            RETURNING
              user_id,
              amount
          `,
          [
            orderId,
            webhookId,
            topup.id,
          ]
        );

      if (creditResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(200).json({
          received: true,
          credited: false,
          duplicate: true,
        });
      }

      const creditedTopup =
        creditResult.rows[0];

      await client.query(
        `
          UPDATE users
          SET balance =
            balance + $1
          WHERE id = $2
        `,
        [
          creditedTopup.amount,
          creditedTopup.user_id,
        ]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        received: true,
        credited: true,
      });
    } catch (error) {
      if (client) {
        await client
          .query("ROLLBACK")
          .catch(() => {});
      }

      if (error?.code === "23505") {
        return res.status(200).json({
          received: true,
          duplicate: true,
        });
      }

      console.error(
        "Shopier webhook hatası:",
        error
      );

      return res.sendStatus(500);
    } finally {
      client?.release();
    }
  }
);
// --------------------------------------------------
// SHOPIER ÖDEME BAŞLAT
// --------------------------------------------------

app.post(
  "/api/shopier/start",
  requireAuth,
  requireVerifiedPhone,
  paymentRateLimiter,
  async (req, res) => {
    let topupId = null;

    try {
      if (!SHOPIER_PAYMENTS_ENABLED) {
        return res.status(503).json({
          success: false,
          message:
            "Shopier ödemeleri şu anda test modunda kapalı.",
        });
      }

      if (
        !SHOPIER_PAT ||
        !SHOPIER_PRODUCT_IMAGE_URL
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Shopier ödeme ayarları eksik.",
        });
      }

      const amount =
        Number(req.body?.amount);

      if (!isAllowedTopupAmount(amount)) {
        return res.status(400).json({
          success: false,
          message:
            "Geçersiz bakiye yükleme tutarı.",
        });
      }

      const referenceCode =
        crypto.randomUUID();

      const insertResult =
        await db.query(
          `
            INSERT INTO shopier_topups (
              user_id,
              reference_code,
              amount,
              status,
              expires_at
            )
            VALUES (
              $1,
              $2,
              $3,
              'creating',
              NOW() + INTERVAL '24 hours'
            )
            RETURNING id
          `,
          [
            req.userId,
            referenceCode,
            amount,
          ]
        );

      topupId =
        insertResult.rows[0].id;

      const product =
        await createShopierTopupProduct({
          amount,
          referenceCode,
        });

      const updateResult =
        await db.query(
          `
            UPDATE shopier_topups
            SET
              product_id = $1,
              product_url = $2,
              status = 'pending',
              updated_at = NOW()
            WHERE id = $3
              AND status = 'creating'
            RETURNING id
          `,
          [
            product.productId,
            product.productUrl,
            topupId,
          ]
        );

      if (updateResult.rows.length === 0) {
        throw new Error(
          "Shopier ödeme kaydı güncellenemedi."
        );
      }

      return res.json({
        success: true,
        provider: "shopier",
        paymentId: topupId,
        paymentPageUrl:
          product.productUrl,
      });
    } catch (error) {
      console.error(
        "Shopier ödeme başlatma hatası:",
        error
      );

      if (topupId !== null) {
        await db.query(
          `
            UPDATE shopier_topups
            SET
              status = 'failed',
              error_message = $1,
              updated_at = NOW()
            WHERE id = $2
              AND credited_at IS NULL
          `,
          [
            String(
              error?.message ||
              "Shopier ödeme bağlantısı oluşturulamadı."
            ).slice(0, 500),
            topupId,
          ]
        ).catch((databaseError) => {
          console.error(
            "Shopier hata kaydı güncellenemedi:",
            databaseError
          );
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Shopier ödeme bağlantısı oluşturulamadı.",
      });
    }
  }
);
// --------------------------------------------------
// IYZICO ÖDEME BAŞLAT
// --------------------------------------------------

app.post(
  "/api/payments/start",
  requireAuth,
  requireVerifiedPhone,
  paymentRateLimiter,
  async (req, res) => {
    let paymentId = null;

    try {
      if (
        !IYZICO_API_KEY ||
        !IYZICO_SECRET_KEY
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Iyzico ödeme ayarları eksik.",
        });
      }

      const amount =
        Number(req.body?.amount);

      if (!isAllowedTopupAmount(amount)) {
        return res.status(400).json({
          success: false,
          message:
            "Geçersiz bakiye yükleme tutarı.",
        });
      }

           if (!IYZICO_IS_SANDBOX) {
        return res.status(503).json({
          success: false,
          message:
            "Canlı ödeme için müşteri bilgileri henüz hazır değil.",
        });
      }

      const buyer = {
        name: "Vornex",
        surname: "Test",
        identityNumber: "74300864791",
        city: "Istanbul",
        address: "Vornex Sandbox Test Adresi",
        zipCode: "34000",
      };
      const userResult =
        await db.query(
          `
            SELECT
              id,
              email,
              phone,
              phone_verified
            FROM users
            WHERE id = $1
            LIMIT 1
          `,
          [req.userId]
        );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "Kullanıcı bulunamadı.",
        });
      }

      const user = userResult.rows[0];
      if (
        IYZICO_IS_SANDBOX &&
        !PAYMENT_TEST_EMAILS.has(
          String(user.email || "")
            .trim()
            .toLowerCase()
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Sandbox ödemeleri yalnızca yetkili test hesaplarına açıktır."
        });
      }

      const conversationId =
        crypto.randomUUID();

      const paymentInsert =
        await db.query(
          `
            INSERT INTO payments (
              user_id,
              conversation_id,
              amount,
              status
            )
            VALUES (
              $1,
              $2,
              $3,
              'pending'
            )
            RETURNING id
          `,
          [
            req.userId,
            conversationId,
            amount,
          ]
        );

      paymentId =
        paymentInsert.rows[0].id;

      const buyerIp = String(
        req.ip ||
        req.socket.remoteAddress ||
        "127.0.0.1"
      ).replace(/^::ffff:/, "");

      const checkoutRequest =
        buildCheckoutRequest({
          paymentId,
          conversationId,
          amount,
          user,
          buyer,
          ip: buyerIp,
        });

      const checkout =
        await initializeCheckoutForm(
          checkoutRequest
        );

      if (
        checkout?.status !== "success" ||
        !checkout?.token ||
        !checkout?.paymentPageUrl
      ) {
        const errorMessage =
          checkout?.errorMessage ||
          "Iyzico ödeme formu oluşturulamadı.";

        await db.query(
          `
            UPDATE payments
            SET
              status = 'failed',
              error_message = $1,
              updated_at = NOW()
            WHERE id = $2
          `,
          [
            errorMessage,
            paymentId
          ]
        );

        return res.status(502).json({
          success: false,
          message: errorMessage,
        });
      }

      await db.query(
        `
          UPDATE payments
          SET
            iyzico_token = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          checkout.token,
          paymentId
        ]
      );

      return res.json({
        success: true,
        paymentId,
        paymentPageUrl:
          checkout.paymentPageUrl,
      });
    } catch (error) {
      console.error(
        "Ödeme başlatma hatası:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Ödeme başlatılırken sunucu hatası oluştu.",
      });
    }
  }
);
// --------------------------------------------------
// IYZICO ÖDEME CALLBACK
// --------------------------------------------------

app.post(
  "/api/payments/callback",
  async (req, res) => {
    try {
      const token =
        normalizePaymentField(
          req.body?.token,
          500
        );

      if (!token) {
        return res.redirect(
          303,
          `${FRONTEND_ORIGIN}/topup.html?payment=failed`
        );
      }

      const paymentResult =
        await db.query(
          `
            SELECT
              id,
              user_id,
              conversation_id,
              amount,
              status,
              credited_at
            FROM payments
            WHERE iyzico_token = $1
            LIMIT 1
          `,
          [token]
        );

      if (paymentResult.rows.length === 0) {
        return res.redirect(
          303,
          `${FRONTEND_ORIGIN}/topup.html?payment=failed`
        );
      }

      const payment =
        paymentResult.rows[0];

      if (payment.credited_at) {
        return res.redirect(
          303,
          `${FRONTEND_ORIGIN}/topup.html?payment=success`
        );
      }

      const checkout =
        await retrieveCheckoutForm({
          locale: Iyzipay.LOCALE.TR,
          conversationId:
            payment.conversation_id,
          token,
        });

      const amountMatches =
        Number.isFinite(
          Number(checkout?.paidPrice)
        ) &&
        Math.abs(
          Number(checkout.paidPrice) -
          Number(payment.amount)
        ) < 0.001;

      const conversationMatches =
        String(
          checkout?.conversationId || ""
        ) ===
        String(payment.conversation_id);

      const basketMatches =
        String(checkout?.basketId || "") ===
        `TOPUP-${payment.id}`;

      const paymentSucceeded =
        checkout?.status === "success" &&
        checkout?.paymentStatus ===
          "SUCCESS" &&
        checkout?.currency === "TRY" &&
        amountMatches &&
        conversationMatches &&
        basketMatches;

      if (!paymentSucceeded) {
        const errorMessage =
          checkout?.errorMessage ||
          checkout?.paymentStatus ||
          "Ödeme doğrulanamadı.";

        await db.query(
          `
            UPDATE payments
            SET
              status = 'failed',
              error_message = $1,
              updated_at = NOW()
            WHERE id = $2
              AND credited_at IS NULL
          `,
          [
            String(errorMessage),
            payment.id
          ]
        );

        return res.redirect(
          303,
          `${FRONTEND_ORIGIN}/topup.html?payment=failed`
        );
      }

      await db.query(
        `
          WITH credited_payment AS (
            UPDATE payments
            SET
              status = 'completed',
              payment_id = $1,
              error_message = NULL,
              credited_at = NOW(),
              updated_at = NOW()
            WHERE id = $2
              AND credited_at IS NULL
            RETURNING
              user_id,
              amount
          )
          UPDATE users
          SET balance =
            users.balance +
            credited_payment.amount
          FROM credited_payment
          WHERE users.id =
            credited_payment.user_id
        `,
        [
          String(checkout.paymentId || ""),
          payment.id
        ]
      );

      return res.redirect(
        303,
        `${FRONTEND_ORIGIN}/topup.html?payment=success`
      );
    } catch (error) {
      console.error(
        "Iyzico callback hatası:",
        error
      );

      return res.redirect(
        303,
        `${FRONTEND_ORIGIN}/topup.html?payment=error`
      );
    }
  }
);
// ----------------------------------------------------
// ODEME GECMISI
// ----------------------------------------------------

app.get(
  "/api/payments",
  requireAuth,
  accountReadRateLimiter,
  async (req, res) => {
    try {
           await db.query(
        `
          UPDATE payments
          SET
            status = 'failed',
            error_message =
              'Ödeme süresi doldu.',
            updated_at = NOW()
          WHERE user_id = $1
            AND status = 'pending'
            AND created_at <
              NOW() - INTERVAL '30 minutes'
        `,
        [req.userId]
      );

      const result = await db.query(
        `
          SELECT
            id,
            amount,
            status,
            created_at,
            credited_at
          FROM payments
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [req.userId]
      );

      const payments =
        result.rows.map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount),
          status: payment.status,
          createdAt: payment.created_at,
          creditedAt: payment.credited_at
        }));

      return res.json({
        success: true,
        payments
      });

    } catch (error) {
      console.error(
        "Ödeme geçmişi hatası:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Ödeme geçmişi alınamadı."
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
app.post(
  "/api/verify/start",
  requireAuth,
  otpStartRateLimiter,
  async (req, res) => {
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
    const phoneOwner = await db.query(
      `
        SELECT id
        FROM users
        WHERE phone = $1
          AND id <> $2
        LIMIT 1
      `,
      [
        phone,
        req.userId
      ]
    );

    if (phoneOwner.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Bu telefon numarası başka bir hesapta kullanılıyor.",
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
app.post(
  "/api/verify/check",
  requireAuth,
  otpCheckRateLimiter,
  async (req, res) => {
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
       if (error?.code === "23505") {
      return res.status(409).json({
        success: false,
        verified: false,
        message:
          "Bu telefon numarası başka bir hesapta kullanılıyor.",
      });
    }
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
app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message:
      "API adresi bulunamadı.",
  });
});
app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message:
        "İstek boyutu çok büyük.",
    });
  }

  if (
    error instanceof SyntaxError &&
    error?.status === 400 &&
    "body" in error
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Geçersiz JSON verisi gönderildi.",
    });
  }

  console.error(
    "Beklenmeyen sunucu hatası:",
    error
  );

  return res.status(500).json({
    success: false,
    message:
      "Sunucu hatası oluştu.",
  });
});
setInterval(() => {
  reconcileCancellingOrders().catch(
    (error) => {
      console.error(
        "İptal toparlama görevi hatası:",
        error
      );
    }
  );
}, 60_000);
app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `VORNEX API ${PORT} portunda çalışıyor.`
    );
  }
);
