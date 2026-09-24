import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { registerBusinessRoutes } from "./backend";
import { verifyIntaSendWebhook } from "./intasend";

const app = express();
app.use(express.json({
  limit: "32kb",
  verify: (req, _res, buffer) => {
    (req as any).rawBody = buffer.toString("utf8");
  },
}));
app.use((_req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://payment.intasend.com https://sandbox.intasend.com"
  );
  next();
});

const getEnvString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const jsonError = (res: any, status: number, error: string) =>
  res.status(status).json({ success: false, error });

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FAVOURWELD ELECTRONICS</title>
    <style>
      :root {
        --navy: #10243a;
        --blue: #1264b5;
        --gold: #ffbd3d;
        --ink: #1c2937;
        --muted: #66758a;
        --bg: #f4f7fb;
        --line: #e3eaf2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: var(--ink);
        background: var(--bg);
      }
      header {
        background: var(--navy);
        color: white;
        padding: 1rem 2rem;
      }
      nav {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        align-items: center;
      }
      nav a {
        color: white;
        text-decoration: none;
        font-weight: 600;
      }
      .container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1rem 4rem;
      }
      .hero {
        background: linear-gradient(135deg, #11355a, #1d5aa4);
        color: white;
        border-radius: 18px;
        padding: 2rem;
        margin-bottom: 2rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
      }
      .card {
        background: white;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 1.2rem;
      }
      .pill {
        display: inline-block;
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 999px;
        padding: 0.45rem 0.8rem;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      form {
        display: grid;
        gap: 0.85rem;
      }
      input, button, textarea {
        width: 100%;
        padding: 0.9rem 1rem;
        border-radius: 10px;
        border: 1px solid var(--line);
        font: inherit;
      }
      button {
        background: var(--gold);
        color: #10243a;
        font-weight: 700;
        border: none;
        cursor: pointer;
      }
      .muted { color: var(--muted); }
      .status {
        margin-top: 0.8rem;
        border-radius: 8px;
        padding: 0.8rem 1rem;
        display: none;
      }
      .status.success {
        background: #eafaf0;
        color: #176d3d;
        display: block;
      }
      .status.error {
        background: #fdecec;
        color: #8a1f1f;
        display: block;
      }
      .contact {
        line-height: 1.8;
      }
    </style>
  </head>
  <body>
    <header>
      <nav>
        <strong>⚡ FAVOURWELD ELECTRONICS</strong>
        <a href="#home">Home</a>
        <a href="#services">Services</a>
        <a href="#invoice">Invoice / Cash Sale</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>

    <main class="container" id="home">
      <section class="hero">
        <span class="pill">Trusted repairs</span>
        <h1>FAVOURWELD ELECTRONICS</h1>
        <p>Professional electronics repair, diagnostics, sales support, and business invoicing for customers in Nairobi.</p>
      </section>

      <section id="services" class="grid" style="margin-bottom: 2rem;">
        <div class="card">
          <h3>Repair & diagnostics</h3>
          <p class="muted">Fast fault detection, honest assessment, and transparent repair progress updates.</p>
        </div>
        <div class="card">
          <h3>Sales & support</h3>
          <p class="muted">Customer support for purchases, replacements, and service follow-up.</p>
        </div>
        <div class="card">
          <h3>Invoice / cash sale</h3>
          <p class="muted">Create and track invoice balances, payments, and status updates in one place.</p>
        </div>
      </section>

      <section id="invoice" class="card">
        <h2>Invoice payment</h2>
        <form id="paymentForm">
          <input id="invoiceId" name="invoice_id" type="number" placeholder="Invoice ID" required />
          <input id="amount" name="amount" type="number" min="1" step="1" placeholder="Amount in KES" required />
          <input id="phone" name="phone" type="tel" placeholder="Phone number (e.g. 2547... )" required />
          <input id="email" name="email" type="email" placeholder="Email address" />
          <button type="submit">Pay with IntaSend (M-Pesa)</button>
        </form>
        <div id="paymentStatus" class="status" role="status" aria-live="polite"></div>
      </section>

      <section id="contact" class="card" style="margin-top: 2rem;">
        <h2>Contact</h2>
        <div class="contact">
          <div><strong>FAVOURWELD ELECTRONICS</strong></div>
          <div>Pipeline Kware, Nairobi</div>
          <div>Till No. 8004897</div>
          <div>Contact details available on-site</div>
        </div>
      </section>
    </main>

    <script>
      const form = document.getElementById('paymentForm');
      const paymentStatus = document.getElementById('paymentStatus');

      function setStatus(type, message) {
        paymentStatus.className = 'status ' + type;
        paymentStatus.textContent = message;
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('payment') === 'complete') {
        setStatus('success', 'You have returned from IntaSend. Your payment is being confirmed. The invoice will update after the IntaSend webhook is received.');
      }

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const payload = {
          invoice_id: Number(document.getElementById('invoiceId').value),
          amount: Number(document.getElementById('amount').value),
          phone: document.getElementById('phone').value,
          email: document.getElementById('email').value
        };

        setStatus('error', '');
        try {
          const response = await fetch('/api/payments/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Payment initiation failed.');
          }

          if (data.checkout_url) {
            setStatus('success', 'Opening the secure IntaSend checkout. Complete your M-Pesa payment there.');
            window.location.assign(data.checkout_url);
            return;
          }

          setStatus('success', 'Payment checkout was created, but no checkout URL was returned. Please contact FAVOURWELD support.');
        } catch (error) {
          setStatus('error', error.message || 'Unable to start payment request.');
        }
      });
    </script>
  </body>
</html>`;

app.get("/", (_req, res) => res.status(200).type("html").send(page));
app.get("/api/health", (_req, res) =>
  res.json({ success: true, service: "FAVOURWELD ELECTRONICS" })
);

registerBusinessRoutes(app, (env as any).DB);

app.post("/api/payments/initiate", async (req, res) => {
  try {
    // IntaSend checkout creation uses the publishable/public API key.
    // Keep this value server-side here so the client never controls payment parameters.
    const publicKey = getEnvString((env as any).INTASEND_API_KEY);
    const apiBaseUrl = getEnvString((env as any).INTASEND_API_BASE_URL).replace(/\\/$/, "");
    if (!publicKey || !apiBaseUrl) {
      return jsonError(res, 500, "IntaSend settings are missing. Configure INTASEND_API_KEY and INTASEND_API_BASE_URL.");
    }

    const invoiceId = Number(req.body?.invoice_id);
    const amount = Number(req.body?.amount);
    const phone = String(req.body?.phone || "").replace(/\\s+/g, "");
    const email = String(req.body?.email || "").trim();

    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
      return jsonError(res, 400, "A valid invoice_id is required.");
    }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) {
      return jsonError(res, 400, "A valid whole KES amount is required.");
    }
    if (!/^254\\d{9}$/.test(phone)) {
      return jsonError(res, 400, "Phone number must be in the format 2547XXXXXXXX.");
    }
    if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return jsonError(res, 400, "Email address is not valid.");
    }

    const db: any = (env as any).DB;
    const invoice = await db
      .prepare("SELECT id, total, amount_paid, balance, status FROM invoices WHERE id = ?")
      .bind(invoiceId)
      .first();

    if (!invoice) return jsonError(res, 404, "Invoice not found.");

    const balance = Number(invoice.balance);
    if (!Number.isFinite(balance) || balance <= 0) {
      return jsonError(res, 400, "This invoice has no outstanding balance.");
    }
    if (amount > balance) {
      return jsonError(res, 400, "Payment amount cannot exceed the outstanding invoice balance.");
    }

    const apiRef = `FW-INVOICE-${invoiceId}-${crypto.randomUUID()}`;
    const origin = new URL(req.url).origin;

    const requestPayload = {
      amount: amount.toFixed(2),
      currency: "KES",
      phone_number: phone,
      email: email || null,
      country: "KE",
      api_ref: apiRef,
      method: "M-PESA",
      channel: "WEBSITE",
      host: origin,
      is_mobile: true,
      mobile_tarrif: "BUSINESS-PAYS",
      redirect_url: `${origin}/?payment=complete&invoice_id=${invoiceId}`,
    };

    const response = await fetch(`${apiBaseUrl}/api/v1/checkout/`, {
      method: "POST",
      headers: {
        "X-IntaSend-Public-API-Key": publicKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return jsonError(
        res,
        response.status,
        data?.detail || data?.message || data?.error || "IntaSend checkout creation failed."
      );
    }

    const checkoutUrl = data?.url ?? data?.data?.url ?? data?.checkout_url ?? null;
    await db
      .prepare(
        "INSERT INTO payments (invoice_id, provider, method, amount, currency, provider_reference, payer_phone, status, raw_callback, created_at) VALUES (?, 'intasend', 'mpesa', ?, 'KES', ?, ?, 'pending', ?, datetime('now'))"
      )
      .bind(invoiceId, amount, apiRef, phone, JSON.stringify({ request: requestPayload, response: data }))
      .run();

    return res.status(201).json({
      success: true,
      reference: apiRef,
      checkout_url: checkoutUrl,
      data,
    });
  } catch (error) {
    return jsonError(
      res,
      500,
      error instanceof Error ? error.message : "Unable to initiate IntaSend payment."
    );
  }
});

app.post("/api/payments/callback", async (req, res) => {
  try {
    const rawBody = (req as any).rawBody ?? "";
    const challenge = getEnvString((env as any).INTASEND_WEBHOOK_SECRET);

    if (!challenge) {
      return jsonError(res, 500, "INTASEND_WEBHOOK_SECRET is not configured.");
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonError(res, 400, "Invalid callback JSON payload.");
    }

    // IntaSend webhook setup uses a dashboard-configured challenge.
    // The same challenge is included in webhook payloads.
    if (String(payload?.challenge ?? "") !== challenge) {
      return jsonError(res, 401, "Invalid IntaSend webhook challenge.");
    }

    const state = String(payload?.state ?? "").toUpperCase();
    const apiRef = String(payload?.api_ref ?? "").trim();
    const amount = Number(payload?.value ?? 0);
    const currency = String(payload?.currency ?? "").toUpperCase();

    if (!apiRef) return jsonError(res, 400, "Callback does not include api_ref.");
    if (!Number.isFinite(amount) || amount <= 0) return jsonError(res, 400, "Callback does not include a valid payment amount.");
    if (currency !== "KES") return jsonError(res, 400, "Unsupported payment currency.");

    const db: any = (env as any).DB;
    const payment = await db
      .prepare("SELECT id, invoice_id, amount, status FROM payments WHERE provider_reference = ? LIMIT 1")
      .bind(apiRef)
      .first();

    if (!payment) {
      return jsonError(res, 404, "Payment reference was not found.");
    }

    const invoice = await db
      .prepare("SELECT id, total, amount_paid, balance, status FROM invoices WHERE id = ?")
      .bind(payment.invoice_id)
      .first();

    if (!invoice) return jsonError(res, 404, "Invoice for payment was not found.");

    if (state === "COMPLETE") {
      if (amount > Number(invoice.balance)) {
        return jsonError(res, 409, "Confirmed payment exceeds the outstanding invoice balance.");
      }

      await db
        .prepare(
          "UPDATE payments SET status = 'completed', amount = ?, currency = 'KES', raw_callback = ?, completed_at = datetime('now') WHERE id = ?"
        )
        .bind(amount, rawBody, payment.id)
        .run();

      const totals = await db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = ? AND status = 'completed'")
        .bind(invoice.id)
        .first();

      const totalPaid = Number(totals?.total_paid ?? 0);
      const newBalance = Math.max(0, Number(invoice.total) - totalPaid);
      const nextStatus = totalPaid >= Number(invoice.total) ? "paid" : "part_paid";

      await db
        .prepare("UPDATE invoices SET amount_paid = ?, balance = ?, status = ? WHERE id = ?")
        .bind(totalPaid, newBalance, nextStatus, invoice.id)
        .run();
    } else if (state === "FAILED") {
      await db
        .prepare("UPDATE payments SET status = 'failed', raw_callback = ? WHERE id = ?")
        .bind(rawBody, payment.id)
        .run();
    } else if (state === "PENDING" || state === "PROCESSING") {
      await db
        .prepare("UPDATE payments SET status = 'pending', raw_callback = ? WHERE id = ?")
        .bind(rawBody, payment.id)
        .run();
    }

    return res.status(200).json({ success: true, processed: true, state, api_ref: apiRef });
  } catch (error) {
    return jsonError(
      res,
      500,
      error instanceof Error ? error.message : "Unable to process IntaSend callback."
    );
  }
});

app.use((_req, res) => res.status(404).json({ success: false, error: "Not found" }));

app.listen(3000);
export default httpServerHandler({ port: 3000 });
