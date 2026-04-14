/**
 * server.js — JWM Photography
 * Node.js / Express static server with booking & contact API routes
 *
 * Usage:
 *   npm install express cors nodemailer
 *   node server.js
 *
 * Environment variables (create a .env file or set in your host):
 *   PORT          - Port to listen on (default: 3000)
 *   SMTP_HOST     - SMTP server hostname (e.g. smtp.brevo.com)
 *   SMTP_PORT     - SMTP port (e.g. 587)
 *   SMTP_USER     - SMTP username / API key login
 *   SMTP_PASS     - SMTP password / API key
 *   EMAIL_FROM    - Sender address (e.g. noreply@jwmphotography.com)
 *   EMAIL_TO      - Destination for booking/contact notifications
 *   STRIPE_SECRET - Stripe secret key (for future payment routes)
 */

'use strict';

require('dotenv').config(); // npm install dotenv  — optional but recommended

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const nodemailer = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve all static files from the project root
app.use(express.static(path.join(__dirname)));

// ─────────────────────────────────────────────
// Email transporter (Nodemailer)
// Replace SMTP credentials with your provider.
// Works with Brevo, Gmail, SendGrid, Mailgun, etc.
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.brevo.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,  // true for port 465, false for 587
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
});

// Helper: send an email (returns a promise)
async function sendMail(subject, html, replyTo) {
    if (!process.env.SMTP_USER) {
        // No SMTP configured — log to console in development
        console.log('[MAIL]', subject);
        return;
    }
    return transporter.sendMail({
        from:    process.env.EMAIL_FROM || 'JWM Photography <noreply@jwmphotography.com>',
        to:      process.env.EMAIL_TO   || 'info@jwmphotography.com',
        replyTo: replyTo || undefined,
        subject,
        html,
    });
}

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────

/**
 * POST /api/booking
 * Accepts a booking request from the pricing page modal form.
 *
 * Expected body:
 * {
 *   firstName, lastName, email, phone,
 *   service, date, time, location, notes
 * }
 */
app.post('/api/booking', async (req, res) => {
    const {
        firstName = '', lastName = '', email = '',
        phone = '', service = '', date = '',
        time = '', location = '', notes = ''
    } = req.body;

    // Basic validation
    if (!firstName || !email || !service) {
        return res.status(400).json({ ok: false, message: 'Missing required fields.' });
    }

    const html = `
        <h2 style="font-family:sans-serif;color:#2A1005;">New Booking Request — JWM Photography</h2>
        <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:600px;">
            <tr><td style="padding:8px;font-weight:600;width:140px;">Name</td><td style="padding:8px;">${firstName} ${lastName}</td></tr>
            <tr style="background:#f9f5ee;"><td style="padding:8px;font-weight:600;">Email</td><td style="padding:8px;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px;font-weight:600;">Phone</td><td style="padding:8px;">${phone || '—'}</td></tr>
            <tr style="background:#f9f5ee;"><td style="padding:8px;font-weight:600;">Service</td><td style="padding:8px;">${service}</td></tr>
            <tr><td style="padding:8px;font-weight:600;">Requested Date</td><td style="padding:8px;">${date || '—'}</td></tr>
            <tr style="background:#f9f5ee;"><td style="padding:8px;font-weight:600;">Preferred Time</td><td style="padding:8px;">${time || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:600;">Location</td><td style="padding:8px;">${location || '—'}</td></tr>
            <tr style="background:#f9f5ee;"><td style="padding:8px;font-weight:600;">Notes</td><td style="padding:8px;">${notes || '—'}</td></tr>
        </table>
    `;

    try {
        await sendMail(`Booking Request: ${service} — ${firstName} ${lastName}`, html, email);
        return res.json({ ok: true, message: 'Booking request received.' });
    } catch (err) {
        console.error('[booking] email error:', err.message);
        return res.status(500).json({ ok: false, message: 'Failed to send email.' });
    }
});

/**
 * POST /api/contact
 * General contact form submission.
 *
 * Expected body: { name, email, message }
 */
app.post('/api/contact', async (req, res) => {
    const { name = '', email = '', message = '' } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ ok: false, message: 'Missing required fields.' });
    }

    const html = `
        <h2 style="font-family:sans-serif;color:#2A1005;">New Contact Message — JWM Photography</h2>
        <p style="font-family:sans-serif;font-size:14px;"><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;">${message}</p>
    `;

    try {
        await sendMail(`Contact: ${name}`, html, email);
        return res.json({ ok: true, message: 'Message received.' });
    } catch (err) {
        console.error('[contact] email error:', err.message);
        return res.status(500).json({ ok: false, message: 'Failed to send email.' });
    }
});

/**
 * POST /api/order
 * Print order submission (cart checkout).
 * In a real integration you'd process a Stripe PaymentIntent here.
 *
 * Expected body:
 * {
 *   customerName, email, phone,
 *   address, city, state, zip,
 *   shippingMode, selectedSize,
 *   items: [{ id, title, price, qty }]
 * }
 */
app.post('/api/order', async (req, res) => {
    const {
        customerName = '', email = '',
        items = [], shippingMode = 'digital',
        selectedSize = '', address = '',
        address2 = '', city = '', state = '', zip = ''
    } = req.body;

    if (!customerName || !email || !items.length) {
        return res.status(400).json({ ok: false, message: 'Missing required order fields.' });
    }

    const subtotal      = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const shipping      = shippingMode === 'mail' ? 18 : 0;
    const preTax        = subtotal + shipping;
    const TX_TAX_RATE   = 0.0825;                          // Texas state sales tax
    const taxAmount     = preTax * TX_TAX_RATE;
    const stripeFee     = (preTax + taxAmount) * 0.029 + 0.30;  // Stripe 2.9% + $0.30
    const total         = preTax + taxAmount + stripeFee;

    // Build ship-to string from separate fields
    const shipParts = [address, address2, city, state ? `${state}${zip ? ' ' + zip : ''}` : zip].filter(Boolean);
    const shipTo    = shipParts.join(', ');

    const itemRows = items.map(i =>
        `<tr>
            <td style="padding:8px;border-bottom:1px solid #f0e8d8;">${i.title}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #f0e8d8;">${i.qty}</td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #f0e8d8;">$${(i.price * i.qty).toFixed(2)}</td>
        </tr>`
    ).join('');

    const confirmCode = 'JWM-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const html = `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#fff;border:1px solid #e8d4b0;border-radius:8px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#2A1005,#4A2510);padding:32px 36px;">
                <h1 style="margin:0;font-size:22px;color:#fff;font-weight:700;letter-spacing:-0.3px;">New Print Order</h1>
                <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.5);letter-spacing:1px;text-transform:uppercase;">JWM Photography</p>
            </div>
            <div style="padding:32px 36px;">
                <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
                    <tr><td style="padding:7px 0;color:#888;width:140px;">Order Code</td><td style="padding:7px 0;font-weight:700;color:#2A1005;font-size:15px;">${confirmCode}</td></tr>
                    <tr><td style="padding:7px 0;color:#888;">Customer</td><td style="padding:7px 0;font-weight:600;color:#333;">${customerName}</td></tr>
                    <tr><td style="padding:7px 0;color:#888;">Email</td><td style="padding:7px 0;"><a href="mailto:${email}" style="color:#7B4422;">${email}</a></td></tr>
                    <tr><td style="padding:7px 0;color:#888;">Delivery</td><td style="padding:7px 0;color:#333;">${shippingMode === 'mail' ? `Physical Mail — ${selectedSize}" archival print` : 'Digital Download Only'}</td></tr>
                    ${shippingMode === 'mail' ? `<tr><td style="padding:7px 0;color:#888;">Ship To</td><td style="padding:7px 0;color:#333;">${shipTo || '—'}</td></tr>` : ''}
                </table>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <thead>
                        <tr style="background:#f9f5ee;">
                            <th style="padding:10px 8px;text-align:left;color:#7B4422;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Item</th>
                            <th style="padding:10px 8px;text-align:center;color:#7B4422;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Qty</th>
                            <th style="padding:10px 8px;text-align:right;color:#7B4422;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Price</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                    <tfoot style="background:#f9f5ee;">
                        <tr><td colspan="2" style="padding:8px;text-align:right;color:#777;">Subtotal</td><td style="padding:8px;text-align:right;">$${subtotal.toFixed(2)}</td></tr>
                        <tr><td colspan="2" style="padding:8px;text-align:right;color:#777;">Shipping</td><td style="padding:8px;text-align:right;">${shipping > 0 ? '$' + shipping.toFixed(2) : 'Free'}</td></tr>
                        <tr><td colspan="2" style="padding:8px;text-align:right;color:#777;">Texas Sales Tax (8.25%)</td><td style="padding:8px;text-align:right;">$${taxAmount.toFixed(2)}</td></tr>
                        <tr><td colspan="2" style="padding:8px;text-align:right;color:#777;">Stripe Processing Fee (2.9% + $0.30)</td><td style="padding:8px;text-align:right;">$${stripeFee.toFixed(2)}</td></tr>
                        <tr style="font-weight:700;font-size:15px;">
                            <td colspan="2" style="padding:12px 8px;text-align:right;border-top:2px solid #7B4422;color:#2A1005;">Total Charged</td>
                            <td style="padding:12px 8px;text-align:right;border-top:2px solid #7B4422;color:#2A1005;">$${total.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div style="background:#f9f5ee;padding:20px 36px;font-size:12px;color:#aaa;text-align:center;border-top:1px solid #e8d4b0;">
                JWM Photography &bull; (512) 980-0393 &bull; hello@jwmphoto.com
            </div>
        </div>
    `;

    try {
        await sendMail(`Print Order ${confirmCode} — ${customerName}`, html, email);
        return res.json({ ok: true, confirmCode, message: 'Order received.' });
    } catch (err) {
        console.error('[order] email error:', err.message);
        // Still return the confirm code so the client UX does not break
        return res.json({ ok: true, confirmCode, message: 'Order received (email notification failed).' });
    }
});

// ─────────────────────────────────────────────
// Catch-all: serve index.html for any unknown routes
// (useful if you later add client-side routing)
// ─────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  JWM Photography server running`);
    console.log(`  → http://localhost:${PORT}\n`);
});

module.exports = app;