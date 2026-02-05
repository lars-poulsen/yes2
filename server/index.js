import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import Stripe from "stripe";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getDb } from "./db.js";
import {
  authCookieOptions,
  getCookieName,
  getCurrentUser,
  requireAdmin,
  requireUser,
  signToken,
} from "./lib/auth.js";

const createExpressApp =
  typeof express === "function" ? express : express?.default;

if (typeof createExpressApp !== "function") {
  throw new Error(
    "Express kunne ikke initialiseres. Tjek at afhængigheden er installeret og importen virker i dit runtime."
  );
}

const app = createExpressApp();
const db = getDb();

const MAX_JSON_BODY_SIZE = "100kb";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_EMAIL_LENGTH = 191;
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "https://nemtsvar.dk",
  "https://www.nemtsvar.dk",
];
const APP_NAME = "Nemtsvar.dk";
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("invalid-password", 12);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseCorsOrigins = () => {
  const configured = process.env.CORS_ORIGIN ?? "";
  if (!configured) {
    return DEFAULT_CORS_ORIGINS;
  }
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const corsOrigins = parseCorsOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  express.json({
    limit: MAX_JSON_BODY_SIZE,
    verify: (req, _res, buf) => {
      if (req.originalUrl === "/api/billing/webhook") {
        req.rawBody = buf;
      }
    },
  })
);
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  return res.status(200).json({ ok: true, service: APP_NAME });
});

app.get("/healthz", (_req, res) => {
  return res.status(200).send("ok");
});

if (process.env.SERVE_STATIC_DIST === "true") {
  const distDir =
    process.env.DIST_DIR ?? path.resolve(__dirname, "..", "dist");
  const indexPath = path.join(distDir, "index.html");
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    return res.sendFile(indexPath, (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

const ipRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const userRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? req.ip,
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

app.use("/api", ipRateLimiter);

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
const STRIPE_SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL ?? "https://nemtsvar.dk/billing/success";
const STRIPE_CANCEL_URL =
  process.env.STRIPE_CANCEL_URL ?? "https://nemtsvar.dk/billing/cancelled";
const STRIPE_PORTAL_RETURN_URL =
  process.env.STRIPE_PORTAL_RETURN_URL ?? "https://nemtsvar.dk/billing";
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-mini";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const normalizeEmail = (email) => email.trim().toLowerCase();
const isValidEmail = (email) => emailRegex.test(email);
const isValidPassword = (password) => typeof password === "string" && password.length >= 8;

const getBillingSettings = async () => {
  const settings = await db.get(
    `
      SELECT
        stripe_price_id,
        stripe_publishable_key,
        stripe_success_url,
        stripe_cancel_url,
        stripe_portal_return_url,
        openai_model,
        plan_name,
        plan_amount,
        plan_currency,
        plan_interval
      FROM billing_settings
      ORDER BY updated_at DESC
      LIMIT 1
    `
  );
  return settings;
};

const resolveBillingConfig = async () => {
  const settings = await getBillingSettings();
  return {
    priceId: settings?.stripe_price_id ?? STRIPE_PRICE_ID,
    publishableKey: settings?.stripe_publishable_key ?? STRIPE_PUBLISHABLE_KEY,
    successUrl: settings?.stripe_success_url ?? STRIPE_SUCCESS_URL,
    cancelUrl: settings?.stripe_cancel_url ?? STRIPE_CANCEL_URL,
    portalReturnUrl:
      settings?.stripe_portal_return_url ?? STRIPE_PORTAL_RETURN_URL,
    openaiModel: settings?.openai_model ?? null,
    plan: {
      name: settings?.plan_name ?? null,
      amount: settings?.plan_amount ?? null,
      currency: settings?.plan_currency ?? null,
      interval: settings?.plan_interval ?? null,
    },
  };
};

const resolveOpenAiModel = async () => {
  const settings = await getBillingSettings();
  return settings?.openai_model ?? OPENAI_MODEL;
};

const getUserEntitlements = async (userId) => {
  const user = await db.get(
    `
      SELECT free_questions_remaining, free_period_ends_at
      FROM users
      WHERE id = ?
    `,
    userId
  );
  const subscription = await db.get(
    `
      SELECT status, current_period_end
      FROM subscriptions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    userId
  );

  const freePeriodEndsAt = user?.free_period_ends_at ?? null;
  const freePeriodActive = freePeriodEndsAt
    ? new Date(freePeriodEndsAt).getTime() > Date.now()
    : false;

  return {
    subscriptionStatus: subscription?.status ?? "canceled",
    subscriptionPeriodEnd: subscription?.current_period_end ?? null,
    freeQuestionsRemaining: user?.free_questions_remaining ?? 0,
    freePeriodEndsAt,
    freePeriodActive,
  };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const validateRequest =
  (schema) =>
  (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return res.status(400).json({
        error: "Validation error",
        details: result.error.flatten(),
      });
    }

    req.validated = result.data;
    return next();
  };

const registerSchema = z.object({
  body: z.object({
    email: z.string().email().max(MAX_EMAIL_LENGTH),
    password: z.string().min(8).max(128),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(MAX_EMAIL_LENGTH),
    password: z.string().min(1).max(128),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const emptySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const paginationSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
});

const messageSchema = z.object({
  body: z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({}).optional(),
});

const openAiSchema = z.object({
  body: z.object({
    model: z.string().trim().min(1).max(100).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
        })
      )
      .min(1),
    stream: z.boolean().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const webhookSchema = z.object({
  body: z.any(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const adminEntitlementsSchema = z.object({
  body: z.object({
    freeQuestionsRemaining: z.coerce.number().int().min(0).optional(),
    freePeriodEndsAt: z
      .string()
      .datetime({ offset: true })
      .optional()
      .nullable(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({}).optional(),
});

const adminUserActionSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({}).optional(),
});

const billingSettingsSchema = z.object({
  body: z.object({
    stripePriceId: z.string().trim().optional().nullable(),
    stripePublishableKey: z.string().trim().optional().nullable(),
    successUrl: z.string().url().optional().nullable(),
    cancelUrl: z.string().url().optional().nullable(),
    stripePortalReturnUrl: z.string().url().optional().nullable(),
    openaiModel: z.string().trim().min(1).max(100).optional().nullable(),
    planName: z.string().trim().optional().nullable(),
    planAmount: z.coerce.number().int().min(0).optional().nullable(),
    planCurrency: z.string().trim().optional().nullable(),
    planInterval: z.enum(["day", "week", "month", "year"]).optional().nullable(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const bootstrapAdminUser = async () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return;
  }

  const normalizedEmail = normalizeEmail(adminEmail);

  if (!isValidEmail(normalizedEmail)) {
    console.warn("ADMIN_EMAIL er ikke en gyldig email. Springer admin-bootstrap over.");
    return;
  }

  if (!isValidPassword(adminPassword)) {
    console.warn("ADMIN_PASSWORD skal være mindst 8 tegn. Springer admin-bootstrap over.");
    return;
  }
  const existingUser = await db.get(
    "SELECT id, role, password_hash FROM users WHERE email = ?",
    normalizedEmail
  );

  if (existingUser) {
    const passwordMatches = await bcrypt.compare(
      adminPassword,
      existingUser.password_hash
    );
    if (!passwordMatches) {
      console.warn(
        "Admin-bootstrap stoppet: ADMIN_EMAIL findes, men ADMIN_PASSWORD matcher ikke. Ingen rolle-opgradering udført."
      );
      return;
    }

    const updatedPasswordHash = await bcrypt.hash(adminPassword, 12);
    await db.run(
      "UPDATE users SET password_hash = ?, role = ? WHERE id = ?",
      updatedPasswordHash,
      "admin",
      existingUser.id
    );
    console.log(
      "Admin-bootstrap fuldført: adgangskode valideret, password_hash opdateret og rolle sat til admin."
    );
    return;
  }

  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await db.run(
    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    userId,
    normalizedEmail,
    passwordHash,
    "admin",
    createdAt
  );
  console.log("Admin-bruger oprettet via bootstrap.");
};

try {
  await bootstrapAdminUser();
} catch (error) {
  console.error(
    "Admin-bootstrap fejlede. Serveren starter stadig. Detaljer:",
    error?.message ?? error
  );
}

const handleRegister = async (req, res) => {
  const { email, password } = req.validated.body;
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Ugyldig email" });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Adgangskode skal være mindst 8 tegn" });
  }

  const existingUser = await db.get(
    "SELECT id FROM users WHERE email = ?",
    normalizedEmail
  );
  if (existingUser) {
    return res.status(409).json({ error: "Email er allerede registreret" });
  }

  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 12);
  const role = "user";

  await db.run(
    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    userId,
    normalizedEmail,
    passwordHash,
    role,
    createdAt
  );

  const token = signToken({ id: userId, role });
  res.cookie(getCookieName(), token, authCookieOptions);
  return res.status(201).json({
    id: userId,
    email: normalizedEmail,
    role,
    created_at: createdAt,
  });
};

app.post(
  "/api/auth/register",
  authRateLimiter,
  validateRequest(registerSchema),
  handleRegister
);

app.post(
  "/api/auth/signup",
  authRateLimiter,
  validateRequest(registerSchema),
  handleRegister
);

app.post(
  "/api/auth/login",
  authRateLimiter,
  validateRequest(loginSchema),
  async (req, res) => {
    const { email, password } = req.validated.body;
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Ugyldig email" });
    }

    if (typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ error: "Manglende adgangskode" });
    }

    const user = await db.get(
      "SELECT id, email, password_hash, role, created_at, blocked_at FROM users WHERE email = ?",
      normalizedEmail
    );

    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return res.status(401).json({ error: "Forkert email eller adgangskode" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Forkert email eller adgangskode" });
    }

    if (user.blocked_at) {
      return res.status(403).json({ error: "Din bruger er blokeret" });
    }

    const token = signToken(user);
    res.cookie(getCookieName(), token, authCookieOptions);
    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    });
  }
);

app.post("/api/auth/logout", validateRequest(emptySchema), async (_req, res) => {
  res.clearCookie(getCookieName(), { ...authCookieOptions, path: "/" });
  return res.status(204).send();
});

app.get("/api/auth/me", validateRequest(emptySchema), async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Ingen aktiv session." });
  }
  if (user.blocked_at) {
    return res.status(403).json({ error: "Bruger er blokeret" });
  }
  return res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
  });
});

app.post(
  "/api/openai",
  requireUser,
  userRateLimiter,
  validateRequest(openAiSchema),
  async (req, res) => {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY mangler" });
    }

    const { model, messages, stream } = req.validated.body;
    const resolvedModel = model || (await resolveOpenAiModel());
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        stream: Boolean(stream),
      }),
      signal: controller.signal,
    });

    if (!openAiResponse.ok) {
      const details = await openAiResponse.text();
      return res.status(openAiResponse.status).json({
        error: "OpenAI request failed",
        details: details || undefined,
      });
    }

    if (stream) {
      if (!openAiResponse.body) {
        return res.status(502).json({ error: "OpenAI stream unavailable" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const reader = openAiResponse.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          res.write(Buffer.from(value));
        }
      }
      return res.end();
    }

    const data = await openAiResponse.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return res.json({ reply });
  }
);

app.get(
  "/api/users/me",
  requireUser,
  userRateLimiter,
  validateRequest(emptySchema),
  async (req, res) => {
    const user = await db.get(
      `
        SELECT id, email, role, created_at, free_questions_remaining, free_period_ends_at
        FROM users
        WHERE id = ?
      `,
      req.userId
    );

    if (!user) {
      return res.status(404).json({ error: "Bruger ikke fundet" });
    }

    const subscription = await db.get(
      `
        SELECT status, current_period_end
        FROM subscriptions
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      req.userId
    );

    const customer = await db.get(
      `
        SELECT provider_customer_id
        FROM customers
        WHERE user_id = ? AND provider = ?
        LIMIT 1
      `,
      req.userId,
      "stripe"
    );

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      subscription_status: subscription?.status ?? "canceled",
      current_period_end: subscription?.current_period_end ?? null,
      stripe_customer_id: customer?.provider_customer_id ?? null,
      free_questions_remaining: user.free_questions_remaining,
      free_period_ends_at: user.free_period_ends_at,
    });
  }
);

app.get(
  "/api/billing/config",
  requireUser,
  userRateLimiter,
  validateRequest(emptySchema),
  async (_req, res) => {
  const config = await resolveBillingConfig();
  return res.json({
    provider: "stripe",
    publishableKey: config.publishableKey,
    priceId: config.priceId,
    successUrl: config.successUrl,
    cancelUrl: config.cancelUrl,
    plan: config.plan,
  });
  }
);

app.post(
  "/api/billing/checkout-session",
  requireUser,
  userRateLimiter,
  validateRequest(emptySchema),
  async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe er ikke konfigureret" });
  }

  const config = await resolveBillingConfig();
  if (!config.priceId) {
    return res.status(500).json({ error: "Stripe price ID mangler" });
  }

  const user = await db.get("SELECT id, email FROM users WHERE id = ?", req.userId);
  if (!user) {
    return res.status(404).json({ error: "Bruger ikke fundet" });
  }

  const existingCustomer = await db.get(
    "SELECT provider_customer_id FROM customers WHERE user_id = ? AND provider = ?",
    req.userId,
    "stripe"
  );

  let customerId = existingCustomer?.provider_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: req.userId },
    });
    customerId = customer.id;
    await db.run(
      `
        INSERT INTO customers (id, user_id, provider, provider_customer_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      crypto.randomUUID(),
      req.userId,
      "stripe",
      customerId,
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    success_url: config.successUrl,
    cancel_url: config.cancelUrl,
    line_items: [{ price: config.priceId, quantity: 1 }],
    subscription_data: {
      metadata: { userId: req.userId },
    },
    metadata: { userId: req.userId },
  });

  await db.run(
    `
      INSERT INTO payment_events (id, user_id, provider, event_type, provider_event_id, status, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    crypto.randomUUID(),
    req.userId,
    "stripe",
    "checkout.session.created",
    session.id,
    "created",
    JSON.stringify({ sessionId: session.id }),
    new Date().toISOString()
  );

  return res.json({ id: session.id, url: session.url });
  }
);

app.post(
  "/api/billing/portal-session",
  requireUser,
  userRateLimiter,
  validateRequest(emptySchema),
  async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe er ikke konfigureret" });
    }

    const existingCustomer = await db.get(
      "SELECT provider_customer_id FROM customers WHERE user_id = ? AND provider = ?",
      req.userId,
      "stripe"
    );

    if (!existingCustomer?.provider_customer_id) {
      return res.status(404).json({ error: "Ingen Stripe-kunde fundet" });
    }

    const config = await resolveBillingConfig();
    const session = await stripe.billingPortal.sessions.create({
      customer: existingCustomer.provider_customer_id,
      return_url: config.portalReturnUrl,
    });

    return res.json({ url: session.url });
  }
);

app.post("/api/billing/webhook", validateRequest(webhookSchema), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: "Stripe webhook er ikke konfigureret" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Manglende Stripe signature" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).json({ error: "Ugyldigt webhook-signatur" });
  }

  const eventData = event.data?.object ?? {};
  const eventType = event.type;
  const eventId = event.id;
  const createdAt = new Date().toISOString();
  const userId =
    eventData?.metadata?.userId ??
    eventData?.customer_details?.metadata?.userId ??
    eventData?.subscription_details?.metadata?.userId ??
    null;

  await db.run(
    `
      INSERT INTO payment_events (id, user_id, provider, event_type, provider_event_id, status, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    crypto.randomUUID(),
    userId,
    "stripe",
    eventType,
    eventId,
    "received",
    JSON.stringify(event),
    createdAt
  );

  if (eventType === "checkout.session.completed") {
    const subscriptionId = eventData?.subscription ?? null;
    const customerId = eventData?.customer ?? null;
    if (subscriptionId && customerId && userId) {
      await db.run(
        `
          INSERT INTO subscriptions (id, user_id, provider, provider_subscription_id, provider_customer_id, status, current_period_end, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            current_period_end = VALUES(current_period_end),
            updated_at = VALUES(updated_at)
        `,
        crypto.randomUUID(),
        userId,
        "stripe",
        subscriptionId,
        customerId,
        "active",
        null,
        createdAt,
        createdAt
      );
    }
  }

  if (eventType === "invoice.payment_succeeded" || eventType === "invoice.payment_failed") {
    const status = eventType === "invoice.payment_succeeded" ? "succeeded" : "failed";
    await db.run(
      `
        INSERT INTO payments (id, user_id, provider, provider_payment_id, provider_invoice_id, amount, currency, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      crypto.randomUUID(),
      userId,
      "stripe",
      eventData?.payment_intent ?? null,
      eventData?.id ?? null,
      eventData?.amount_paid ?? eventData?.amount_due ?? null,
      eventData?.currency ?? null,
      status,
      createdAt
    );
  }

  if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    const status = eventData?.status ?? "canceled";
    const periodEnd = eventData?.current_period_end
      ? new Date(eventData.current_period_end * 1000).toISOString()
      : null;
    await db.run(
      `
        INSERT INTO subscriptions (id, user_id, provider, provider_subscription_id, provider_customer_id, status, current_period_end, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          current_period_end = VALUES(current_period_end),
          updated_at = VALUES(updated_at)
      `,
      crypto.randomUUID(),
      userId,
      "stripe",
      eventData?.id ?? null,
      eventData?.customer ?? null,
      status,
      periodEnd,
      createdAt,
      createdAt
    );
  }

  return res.json({ received: true });
});

app.get(
  "/api/admin/users",
  requireUser,
  userRateLimiter,
  requireAdmin,
  validateRequest(emptySchema),
  async (req, res) => {
  const users = await db.all(
    `
      SELECT
        id,
        email,
        role,
        created_at,
        blocked_at,
        free_questions_remaining,
        free_period_ends_at
      FROM users
      ORDER BY created_at DESC
    `
  );
  return res.json({ users });
  }
);

app.patch(
  "/api/admin/users/:id/entitlements",
  requireUser,
  userRateLimiter,
  requireAdmin,
  validateRequest(adminEntitlementsSchema),
  async (req, res) => {
    const { freeQuestionsRemaining, freePeriodEndsAt } = req.validated.body;
    const updates = [];
    const values = [];

    if (typeof freeQuestionsRemaining === "number") {
      updates.push("free_questions_remaining = ?");
      values.push(freeQuestionsRemaining);
    }

    if (freePeriodEndsAt !== undefined) {
      updates.push("free_period_ends_at = ?");
      values.push(freePeriodEndsAt);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "Ingen ændringer angivet" });
    }

    values.push(req.validated.params.id);
    await db.run(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      ...values
    );

    return res.status(204).send();
  }
);

app.patch(
  "/api/admin/users/:id/block",
  requireUser,
  userRateLimiter,
  requireAdmin,
  validateRequest(adminUserActionSchema),
  async (req, res) => {
    const { id } = req.validated.params;
    if (id === req.userId) {
      return res.status(400).json({ error: "Du kan ikke blokere din egen bruger." });
    }
    const existingUser = await db.get("SELECT id FROM users WHERE id = ?", id);
    if (!existingUser) {
      return res.status(404).json({ error: "Bruger ikke fundet" });
    }
    const now = new Date().toISOString();
    await db.run("UPDATE users SET blocked_at = ? WHERE id = ?", now, id);
    return res.status(204).send();
  }
);

app.patch(
  "/api/admin/users/:id/unblock",
  requireUser,
  userRateLimiter,
  requireAdmin,
  validateRequest(adminUserActionSchema),
  async (req, res) => {
    const { id } = req.validated.params;
    const existingUser = await db.get("SELECT id FROM users WHERE id = ?", id);
    if (!existingUser) {
      return res.status(404).json({ error: "Bruger ikke fundet" });
    }
    await db.run("UPDATE users SET blocked_at = NULL WHERE id = ?", id);
    return res.status(204).send();
  }
);

app.delete(
  "/api/admin/users/:id",
  requireUser,
  userRateLimiter,
  requireAdmin,
  validateRequest(adminUserActionSchema),
  async (req, res) => {
    const { id } = req.validated.params;
    if (id === req.userId) {
      return res.status(400).json({ error: "Du kan ikke slette din egen bruger." });
    }
    const existingUser = await db.get("SELECT id FROM users WHERE id = ?", id);
    if (!existingUser) {
      return res.status(404).json({ error: "Bruger ikke fundet" });
    }
    await db.run("DELETE FROM users WHERE id = ?", id);
    return res.status(204).send();
  }
);

app.get(
  "/api/admin/billing/settings",
  requireUser,
  userRateLimiter,
  requireAdmin,
  validateRequest(emptySchema),
  async (_req, res) => {
    const config = await resolveBillingConfig();
    return res.json({
      stripePriceId: config.priceId,
      stripePublishableKey: config.publishableKey,
      successUrl: config.successUrl,
      cancelUrl: config.cancelUrl,
      stripePortalReturnUrl: config.portalReturnUrl,
      openaiModel: config.openaiModel ?? null,
      plan: config.plan,
    });
  }
);

app.put(
  "/api/admin/billing/settings",
  requireUser,
  userRateLimiter,
  requireAdmin,
  validateRequest(billingSettingsSchema),
  async (req, res) => {
    const {
      stripePriceId,
      stripePublishableKey,
      successUrl,
      cancelUrl,
      stripePortalReturnUrl,
      openaiModel,
      planName,
      planAmount,
      planCurrency,
      planInterval,
    } = req.validated.body;

    const now = new Date().toISOString();
    await db.run(
      `
        INSERT INTO billing_settings (
          id,
          stripe_price_id,
          stripe_publishable_key,
          stripe_success_url,
          stripe_cancel_url,
          stripe_portal_return_url,
          openai_model,
          plan_name,
          plan_amount,
          plan_currency,
          plan_interval,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      crypto.randomUUID(),
      stripePriceId ?? null,
      stripePublishableKey ?? null,
      successUrl ?? null,
      cancelUrl ?? null,
      stripePortalReturnUrl ?? null,
      openaiModel ?? null,
      planName ?? null,
      planAmount ?? null,
      planCurrency ?? null,
      planInterval ?? null,
      now,
      now
    );

    return res.status(201).json({ ok: true });
  }
);

app.post(
  "/api/chats",
  requireUser,
  userRateLimiter,
  validateRequest(emptySchema),
  async (req, res) => {
  const entitlements = await getUserEntitlements(req.userId);
  const hasSubscription =
    entitlements.subscriptionStatus === "active" ||
    entitlements.subscriptionStatus === "trialing";
  const freePeriodActive = entitlements.freePeriodActive;
  const hasFreeQuestions = entitlements.freeQuestionsRemaining > 0;

  if (!hasSubscription && !freePeriodActive && !hasFreeQuestions) {
    return res.status(402).json({ error: "Aktivt abonnement kræves" });
  }

  const chatId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const isFreeChat = !hasSubscription && !freePeriodActive;

  await db.run(
    "INSERT INTO chats (id, user_id, created_at, is_free) VALUES (?, ?, ?, ?)",
    chatId,
    req.userId,
    createdAt,
    isFreeChat
  );

  if (isFreeChat && hasFreeQuestions) {
    await db.run(
      `
        UPDATE users
        SET free_questions_remaining = free_questions_remaining - 1
        WHERE id = ? AND free_questions_remaining > 0
      `,
      req.userId
    );
  }

  res.status(201).json({ id: chatId, created_at: createdAt, is_free: isFreeChat });
  }
);

app.get(
  "/api/chats",
  requireUser,
  userRateLimiter,
  validateRequest(paginationSchema),
  async (req, res) => {
  const limit = clamp(Number(req.validated.query.limit ?? 20), 1, 50);
  const offset = clamp(Number(req.validated.query.offset ?? 0), 0, Number.MAX_SAFE_INTEGER);

  const totalRow = await db.get(
    "SELECT COUNT(1) as total FROM chats WHERE user_id = ?",
    req.userId
  );

  const chats = await db.all(
    `
      SELECT
        chats.id,
        chats.created_at,
        chats.is_free,
        (
          SELECT content
          FROM messages
          WHERE messages.chat_id = chats.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT created_at
          FROM messages
          WHERE messages.chat_id = chats.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message_at,
        (
          SELECT COUNT(1)
          FROM messages
          WHERE messages.chat_id = chats.id
        ) AS message_count
      FROM chats
      WHERE chats.user_id = ?
      ORDER BY COALESCE(last_message_at, chats.created_at) DESC
      LIMIT ? OFFSET ?
    `,
    req.userId,
    limit,
    offset
  );

  res.json({ chats, total: totalRow?.total ?? 0 });
  }
);

app.get(
  "/api/chats/:id",
  requireUser,
  userRateLimiter,
  validateRequest(
    paginationSchema.merge(
      z.object({
        params: z.object({ id: z.string().uuid() }),
      })
    )
  ),
  async (req, res) => {
  const chatId = req.validated.params.id;
  const chat = await db.get(
    "SELECT id, created_at, is_free FROM chats WHERE id = ? AND user_id = ?",
    chatId,
    req.userId
  );

  if (!chat) {
    return res.status(404).json({ error: "Chat not found" });
  }

  const limit = clamp(Number(req.validated.query.limit ?? 100), 1, 200);
  const offset = clamp(Number(req.validated.query.offset ?? 0), 0, Number.MAX_SAFE_INTEGER);

  const totalRow = await db.get(
    "SELECT COUNT(1) as total FROM messages WHERE chat_id = ?",
    chatId
  );

  const messages = await db.all(
    `
      SELECT id, role, content, created_at
      FROM messages
      WHERE chat_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `,
    chatId,
    limit,
    offset
  );

  return res.json({ chat, messages, total: totalRow?.total ?? 0 });
  }
);

app.post(
  "/api/chats/:id/messages",
  requireUser,
  userRateLimiter,
  validateRequest(messageSchema),
  async (req, res) => {
    const chatId = req.validated.params.id;
    const { role, content } = req.validated.body;

    const chat = await db.get(
      "SELECT id, is_free FROM chats WHERE id = ? AND user_id = ?",
      chatId,
      req.userId
    );

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (req.userRole !== "admin") {
      const entitlements = await getUserEntitlements(req.userId);
      const hasSubscription =
        entitlements.subscriptionStatus === "active" ||
        entitlements.subscriptionStatus === "trialing";
      const hasAccess = hasSubscription || entitlements.freePeriodActive;

      if (!hasAccess) {
        if (!chat.is_free) {
          return res.status(402).json({ error: "Aktivt abonnement kræves" });
        }

        if (role === "user") {
          const messageCount = await db.get(
            `
              SELECT COUNT(1) as total
              FROM messages
              WHERE chat_id = ? AND role = 'user'
            `,
            chatId
          );
          if ((messageCount?.total ?? 0) > 0) {
            return res.status(402).json({ error: "Gratis spørgsmål er brugt op" });
          }
        }

        if (role === "assistant") {
          const userMessageCount = await db.get(
            `
              SELECT COUNT(1) as total
              FROM messages
              WHERE chat_id = ? AND role = 'user'
            `,
            chatId
          );
          const assistantMessageCount = await db.get(
            `
              SELECT COUNT(1) as total
              FROM messages
              WHERE chat_id = ? AND role = 'assistant'
            `,
            chatId
          );
          if ((userMessageCount?.total ?? 0) === 0) {
            return res.status(400).json({ error: "Ingen brugerbesked fundet" });
          }
          if ((assistantMessageCount?.total ?? 0) > 0) {
            return res.status(402).json({ error: "Gratis spørgsmål er brugt op" });
          }
        }
      }
    }

    const messageId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db.run(
      "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      messageId,
      chatId,
      role,
      content,
      createdAt
    );

    return res.status(201).json({
      id: messageId,
      chat_id: chatId,
      role,
      content,
      created_at: createdAt,
    });
  }
);

app.use((err, _req, res, next) => {
  if (err?.message === "CORS origin not allowed") {
    return res.status(403).json({ error: "CORS origin not allowed" });
  }
  return next(err);
});

const HOST = "0.0.0.0";
const resolvedPort = process.env.PORT ? Number(process.env.PORT) : 3001;
const PORT =
  Number.isFinite(resolvedPort) && resolvedPort > 0 ? resolvedPort : 3001;
const shouldAutoStart = process.env.AUTO_START_SERVER !== "false";

if (shouldAutoStart) {
  app.listen(PORT, HOST, () => {
    console.log(`${APP_NAME} server listening on ${HOST}:${PORT}`);
  });
}

export default app;
