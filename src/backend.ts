import type { Request, Response } from "express";

/** Cloudflare D1 binding shape used by this module. */
type D1 = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

const clean = (v: unknown, max = 250): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const jsonError = (res: Response, status: number, error: string) =>
  res.status(status).json({ success: false, error });

/**
 * Register write endpoints on the existing Express app.
 * Important: these endpoints are deliberately not wired into the public app
 * until authentication/rate limiting and deployment configuration are added.
 */
export function registerBusinessRoutes(app: {
  post(path: string, handler: (req: Request, res: Response) => unknown): unknown;
}, db: D1): void {
  // Public repair intake: records only the information needed to contact the customer.
  app.post("/api/repair-enquiries", async (req, res) => {
    try {
      const name = clean(req.body?.name, 120);
      const phone = clean(req.body?.phone, 30);
      const email = clean(req.body?.email, 180);
      const equipment = clean(req.body?.equipment_type, 120);
      const model = clean(req.body?.brand_model, 120);
      const fault = clean(req.body?.reported_fault, 1500);
      if (name.length < 2 || !/^[+0-9()\-\s]{7,20}$/.test(phone) || equipment.length < 2 || fault.length < 5) {
        return jsonError(res, 400, "Provide a name, valid phone number, equipment type and fault description.");
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonError(res, 400, "Email address is not valid.");
      }
      const customer = await db.prepare(
        "INSERT INTO customers (name, phone, email) VALUES (?, ?, ?) RETURNING id"
      ).bind(name, phone, email || null).first<{ id: number }>();
      if (!customer?.id) return jsonError(res, 500, "Could not create customer record.");

      const jobNumber = `FW-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const job = await db.prepare(
        "INSERT INTO repair_jobs (job_number, customer_id, equipment_type, brand_model, reported_fault) VALUES (?, ?, ?, ?, ?) RETURNING id, job_number, status, received_at"
      ).bind(jobNumber, customer.id, equipment, model || null, fault).first();
      if (!job) return jsonError(res, 500, "Could not create repair job.");
      return res.status(201).json({ success: true, job });
    } catch {
      return jsonError(res, 500, "Repair enquiry could not be saved.");
    }
  });

  // Invoice creation is intended for authenticated staff/admin callers only.
  // Middleware enforcing that requirement must be attached before enabling this route.
  app.post("/api/invoices", async (req, res) => {
    try {
      const customerId = Number(req.body?.customer_id);
      const invoiceType = clean(req.body?.invoice_type, 20) || "invoice";
      const notes = clean(req.body?.notes, 1000);
      const items = req.body?.items;
      if (!Number.isSafeInteger(customerId) || customerId < 1 || !["invoice", "cash_sale", "estimate"].includes(invoiceType)) {
        return jsonError(res, 400, "A valid customer_id and invoice_type are required.");
      }
      if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
        return jsonError(res, 400, "Provide between 1 and 50 invoice items.");
      }
      const parsed = items.map((item: unknown) => {
        const row = item as Record<string, unknown>;
        const description = clean(row?.description, 250);
        const quantity = Number(row?.quantity);
        const unitPrice = Number(row?.unit_price);
        if (!description || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || !Number.isSafeInteger(unitPrice) || unitPrice < 0 || unitPrice > 100000000) return null;
        const lineTotal = quantity * unitPrice;
        if (!Number.isSafeInteger(lineTotal)) return null;
        return { description, quantity, unitPrice, lineTotal };
      });
      if (parsed.some((item) => item === null)) return jsonError(res, 400, "Invoice item values are invalid; use whole KSh amounts and positive quantities.");
      const validItems = parsed as Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
      const subtotal = validItems.reduce((sum, item) => sum + item.lineTotal, 0);
      if (!Number.isSafeInteger(subtotal) || subtotal > 1000000000) return jsonError(res, 400, "Invoice total is outside the allowed range.");

      const invoiceNumber = `FWI-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const invoice = await db.prepare(
        "INSERT INTO invoices (invoice_number, customer_id, invoice_type, subtotal, discount, total, amount_paid, balance, status, notes) VALUES (?, ?, ?, ?, 0, ?, 0, ?, 'unpaid', ?) RETURNING id, invoice_number, total, balance, status, created_at"
      ).bind(invoiceNumber, customerId, invoiceType, subtotal, subtotal, subtotal, notes || null).first<{ id: number }>();
      if (!invoice) return jsonError(res, 500, "Could not create invoice.");
      for (const item of validItems) {
        await db.prepare(
          "INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?)"
        ).bind(invoice.id, item.description, item.quantity, item.unitPrice, item.lineTotal).run();
      }
      return res.status(201).json({ success: true, invoice, items: validItems });
    } catch {
      return jsonError(res, 500, "Invoice could not be saved.");
    }
  });
}
