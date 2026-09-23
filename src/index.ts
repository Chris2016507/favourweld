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
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://payment.intasend.com"
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

          setStatus('success', 'Payment request has been initiated successfully. Please complete the M-Pesa prompt on your phone.');
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
    const apiKey = getEnvString((env as any).INTASEND_API_KEY);
    const secretKey = getEnvString((env as any).INTASEND_SECRET_KEY);
    const callbackUrl = getEnvString((env as any).INTASEND_CALLBACK_URL);

    if (!apiKey || !secretKey || !callbackUrl) {
      return jsonError(
        res,
        500,
        "IntaSend settings are missing. Configure INTASEND_API_KEY, INTASEND_SECRET_KEY and INTASEND_CALLBACK_URL."
      );
    }

    const invoiceId = Number(req.body?.invoice_id);
    const amount = Number(req.body?.amount);
    const phone = String(req.body?.phone || "").trim();
    const email = String(req.body?.email || "").trim();

    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
      return jsonError(res, 400, "A valid invoice_id is required.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonError(res, 400, "A valid amount in KES is required.");
    }

    if (!/^254\d{9}$/.test(phone.replace(/\s+/g, ""))) {
      return jsonError(res, 400, "Phone number must be in the format 2547XXXXXXXX.");
    }

    const db: any = (env as any).DB;
    const invoice = await db
      .prepare("SELECT id, total, amount_paid, balance, status FROM invoices WHERE id = ?")
      .bind(invoiceId)
      .first();

    if (!invoice) {
      return jsonError(res, 404, "Invoice not found.");
    }

    const requestPayload = {
      amount,
      currency: "KES",
      email: email || "customer@example.com",
      phone_number: phone,
      description: `Invoice payment ${invoiceId}`,
      callback_url: callbackUrl,
      metadata: { invoice_id: invoiceId },
    };

    const response = await fetch("https://payment.intasend.com/api/v1/checkout/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
        data?.message || data?.error || "IntaSend checkout initialization failed."
      );
    }

    const reference =
      data?.data?.checkout_id ??
      data?.data?.transaction_id ??
      data?.data?.reference ??
      data?.checkout_id ??
      data?.transaction_id ??
      data?.reference ??
      `intasend-${Date.now()}`;

    await db
      .prepare(
        "INSERT INTO payments (invoice_id, provider, method, amount, currency, provider_reference, payer_phone, status, raw_callback, created_at) VALUES (?, 'mpesa', 'mpesa', ?, 'KES', ?, ?, 'pending', ?, datetime('now'))"
      )
      .bind(invoiceId, amount, reference, phone, JSON.stringify({ request: requestPayload, response: data }))
      .run();

    return res.status(200).json({ success: true, data, reference });
  } catch (error) {
    return jsonError(
      res,
      500,
      error instanceof Error ? error.message : "Unable to initiate payment request."
    );
  }
});

app.post("/api/payments/callback", async (req, res) => {
  try {
    const rawBody = (req as any).rawBody ?? "";
    const signature = req.header("x-intasend-signature");
    const apiKey = getEnvString((env as any).INTASEND_API_KEY);

    if (!apiKey) {
      return jsonError(
        res,
        500,
        "INTASEND_API_KEY is not configured. Configure the API key before accepting callbacks."
      );
    }

    const isValid = await verifyIntaSendWebhook(rawBody, signature, apiKey);
    if (!isValid) {
      return jsonError(res, 401, "Invalid IntaSend callback signature.");
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonError(res, 400, "Invalid callback JSON payload.");
    }

    const payloadData = payload?.data ?? payload;
    const paymentStatus = String(payloadData?.status ?? payload?.status ?? "pending").toLowerCase();
    const amount = Number(payloadData?.amount ?? payload?.amount ?? 0);
    const invoiceId = Number(
      payloadData?.metadata?.invoice_id ??
        payload?.metadata?.invoice_id ??
        payloadData?.invoice_id ??
        payload?.invoice_id ??
        0
    );
    const providerReference = String(
      payloadData?.transaction_id ??
        payloadData?.reference ??
        payloadData?.checkout_id ??
        payload?.transaction_id ??
        payload?.reference ??
        ""
    );

    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
      return jsonError(res, 400, "Callback does not include a valid invoice identifier.");
    }

    const db: any = (env as any).DB;
    const existingPayment = await db
      .prepare(
        "SELECT id, provider_reference, status, amount FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1"
      )
      .bind(invoiceId)
      .first();

    if (existingPayment && existingPayment.provider_reference && existingPayment.provider_reference === providerReference) {
      return res.status(200).json({ success: true, already_processed: true });
    }

    await db
      .prepare(
        "INSERT INTO payments (invoice_id, provider, method, amount, currency, provider_reference, status, raw_callback, created_at) VALUES (?, 'mpesa', 'mpesa', ?, 'KES', ?, ?, ?, datetime('now'))"
      )
      .bind(
        invoiceId,
        Number.isFinite(amount) && amount > 0 ? amount : 0,
        providerReference || null,
        ["paid", "completed", "success"].includes(paymentStatus) ? "completed" : "pending",
        JSON.stringify(payload)
      )
      .run();

    const totals = await db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = ? AND status = 'completed'")
      .bind(invoiceId)
      .first();

    const invoice = await db
      .prepare("SELECT id, total, amount_paid, balance, status FROM invoices WHERE id = ?")
      .bind(invoiceId)
      .first();

    if (invoice) {
      const totalPaid = Number(totals?.total_paid ?? 0);
      const newBalance = Math.max(0, Number(invoice.total) - totalPaid);
      const nextStatus = totalPaid >= Number(invoice.total) ? "paid" : "part_paid";

      await db
        .prepare(
          "UPDATE invoices SET amount_paid = ?, balance = ?, status = ? WHERE id = ?"
        )
        .bind(totalPaid, newBalance, nextStatus, invoiceId)
        .run();
    }

    return res.status(200).json({ success: true, processed: true });
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
