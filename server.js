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
        city = '', state = '', zip = ''
    } = req.body;

    if (!customerName || !email || !items.length) {
        return res.status(400).json({ ok: false, message: 'Missing required order fields.' });
    }

    const subtotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const shipping = shippingMode === 'mail' ? 18 : 0;
    const total    = subtotal + shipping;

    const itemRows = items.map(i =>
        `<tr><td style="padding:6px;">${i.title}</td><td style="padding:6px;text-align:center;">${i.qty}</td><td style="padding:6px;text-align:right;">$${(i.price * i.qty).toFixed(2)}</td></tr>`
    ).join('');

    const confirmCode = 'JWM-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const html = `
        <h2 style="font-family:sans-serif;color:#2A1005;">New Print Order — JWM Photography</h2>
        <p style="font-family:sans-serif;font-size:14px;"><strong>Order Code:</strong> ${confirmCode}</p>
        <p style="font-family:sans-serif;font-size:14px;"><strong>Customer:</strong> ${customerName} &lt;${email}&gt;</p>
        <p style="font-family:sans-serif;font-size:14px;"><strong>Delivery:</strong> ${shippingMode === 'mail' ? `Physical Mail — ${selectedSize}" print` : 'Digital Download Only'}</p>
        ${shippingMode === 'mail' ? `<p style="font-family:sans-serif;font-size:14px;"><strong>Ship To:</strong> ${address}, ${city}, ${state} ${zip}</p>` : ''}
        <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:500px;margin-top:12px;">
            <thead><tr style="background:#f9f5ee;"><th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Price</th></tr></thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
                <tr><td colspan="2" style="padding:8px;text-align:right;">Subtotal</td><td style="padding:8px;text-align:right;">$${subtotal.toFixed(2)}</td></tr>
                <tr><td colspan="2" style="padding:8px;text-align:right;">Shipping</td><td style="padding:8px;text-align:right;">${shipping > 0 ? '$' + shipping.toFixed(2) : 'Free'}</td></tr>
                <tr style="font-weight:700;"><td colspan="2" style="padding:8px;text-align:right;border-top:1px solid #ddd;">Total</td><td style="padding:8px;text-align:right;border-top:1px solid #ddd;">$${total.toFixed(2)}</td></tr>
            </tfoot>
        </table>
    `;

    try {
        await sendMail(`Print Order ${confirmCode} — ${customerName}`, html, email);
        return res.json({ ok: true, confirmCode, message: 'Order received.' });
    } catch (err) {
        console.error('[order] email error:', err.message);
        // Still return the confirm code so the client UX doesn't break
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