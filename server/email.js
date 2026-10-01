const { Resend } = require('resend');

const ADMIN_EMAIL  = process.env.ADMIN_EMAIL  || 'admin@cnccrafts.in';
const FROM_ADDRESS = process.env.EMAIL_FROM   || 'CNC Crafts <orders@cnccrafts.in>';
const RESEND_KEY   = process.env.RESEND_API_KEY || '';
const SUPPORT_EMAIL = 'orders@cnccrafts.in';

const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function orderItemsList(order) {
  const items = (typeof order.items === 'string' ? JSON.parse(order.items) : order.items) || [];
  return items
    .map(i => `- ${i.name} x${i.quantity} @ ${formatCurrency(i.price)} = ${formatCurrency((i.price || 0) * (i.quantity || 1))}`)
    .join('\n');
}

function buildAdminOrderHtml(order) {
  const items = (typeof order.items === 'string' ? JSON.parse(order.items) : order.items) || [];
  const itemRows = items.map(i => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">${escapeHtml(i.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;text-align:center">${i.quantity}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;text-align:right">${formatCurrency(i.price)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;text-align:right;font-weight:700">${formatCurrency((i.price || 0) * (i.quantity || 1))}</td></tr>`).join('');

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:32px 0">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:#0f172a;padding:28px 32px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.02em">CNC Crafts</div>
            <div style="color:#94a3b8;font-size:12px;font-weight:600;margin-top:4px">New Order Received</div>
          </div>
          <div style="background:#C7451F;color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700">ORDER</div>
        </div>
        <div style="padding:28px 32px">
          <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6">A new order has been placed on the storefront.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px">
              <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Customer</div>
              <div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(order.customerName)}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">${escapeHtml(order.customerEmail || '')}</div>
              <div style="font-size:12px;color:#64748b">${escapeHtml(order.customerPhone || '')}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px">
              <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Order</div>
              <div style="font-size:14px;font-weight:700;color:#0f172a">#${String(order.id).slice(-12).toUpperCase()}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">${new Date(order.created_at || Date.now()).toLocaleString('en-IN')}</div>
              <div style="font-size:12px;color:#64748b">Status: ${String(order.status || 'pending').replace(/_/g, ' ').toUpperCase()}</div>
            </div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin-bottom:18px">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#f1f5f9">
                  <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Item</th>
                  <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Qty</th>
                  <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Unit</th>
                  <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No items</td></tr>'}</tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:2px solid #0f172a">
            <span style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Total Yield</span>
            <span style="font-size:22px;font-weight:900;color:#0f172a;letter-spacing:-0.02em">${formatCurrency(order.total)}</span>
          </div>
          <div style="margin-top:18px;padding:14px;background:#fff7ed;border:1px solid #ffedd5;border-radius:14px;font-size:12px;color:#9a3412;font-weight:600">
            Shipping Address: ${escapeHtml(order.address || 'N/A')}
          </div>
        </div>
        <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
          <span style="font-size:11px;color:#94a3b8;font-weight:600">CNC Crafts Admin Notification</span>
        </div>
      </div>
    </div>
  `;
}

function buildCustomerOrderHtml(order) {
  const items = (typeof order.items === 'string' ? JSON.parse(order.items) : order.items) || [];
  const itemRows = items.map(i => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">${escapeHtml(i.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;text-align:center">${i.quantity}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;text-align:right">${formatCurrency(i.price)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;text-align:right;font-weight:700">${formatCurrency((i.price || 0) * (i.quantity || 1))}</td></tr>`).join('');

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:32px 0">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:#0f172a;padding:28px 32px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.02em">CNC Crafts</div>
            <div style="color:#94a3b8;font-size:12px;font-weight:600;margin-top:4px">Order Confirmation</div>
          </div>
          <div style="background:#10b981;color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700">CONFIRMED</div>
        </div>
        <div style="padding:28px 32px">
          <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6">Thank you for your order. Here are your order details:</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:18px">
            <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Order Reference</div>
            <div style="font-size:14px;font-weight:700;color:#0f172a">#${String(order.id).slice(-12).toUpperCase()}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px">${new Date(order.created_at || Date.now()).toLocaleString('en-IN')}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin-bottom:18px">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#f1f5f9">
                  <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Item</th>
                  <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Qty</th>
                  <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Unit</th>
                  <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No items</td></tr>'}</tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:2px solid #0f172a">
            <span style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Total</span>
            <span style="font-size:22px;font-weight:900;color:#0f172a;letter-spacing:-0.02em">${formatCurrency(order.total)}</span>
          </div>
          <div style="margin-top:18px;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;font-size:12px;color:#166534;font-weight:600">
            Shipping to: ${escapeHtml(order.address || 'N/A')}
          </div>
          <p style="margin:18px 0 0;color:#64748b;font-size:13px;line-height:1.6">We'll notify you when your order ships. For questions, reply to this email or contact us at <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#C7451F;text-decoration:none;font-weight:700">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>
        </div>
        <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
          <span style="font-size:11px;color:#94a3b8;font-weight:600">CNC Crafts — Precision in every cut.</span>
        </div>
      </div>
    </div>
  `;
}

function buildAdminText(order) {
  return [
    'NEW ORDER RECEIVED — CNC CRAFTS',
    '',
    `Order:     #${String(order.id).slice(-12).toUpperCase()}`,
    `Placed:    ${new Date(order.created_at || Date.now()).toLocaleString('en-IN')}`,
    `Status:    ${String(order.status || 'pending').replace(/_/g, ' ').toUpperCase()}`,
    '',
    `Customer:  ${order.customerName || ''}`,
    `Email:     ${order.customerEmail || ''}`,
    `Phone:     ${order.customerPhone || ''}`,
    '',
    'Items:',
    orderItemsList(order),
    '',
    `Total Yield: ${formatCurrency(order.total)}`,
    '',
    `Shipping Address: ${order.address || 'N/A'}`,
  ].join('\n');
}

function buildCustomerText(order) {
  return [
    'ORDER CONFIRMED — CNC CRAFTS',
    '',
    'Thank you for your order. Here are your order details:',
    '',
    `Order Reference: #${String(order.id).slice(-12).toUpperCase()}`,
    `Placed:          ${new Date(order.created_at || Date.now()).toLocaleString('en-IN')}`,
    '',
    'Items:',
    orderItemsList(order),
    '',
    `Total: ${formatCurrency(order.total)}`,
    '',
    `Shipping to: ${order.address || 'N/A'}`,
    '',
    `We'll notify you when your order ships. For questions, contact us at ${SUPPORT_EMAIL}.`,
  ].join('\n');
}

async function sendOrderEmails(order) {
  if (!resend) {
    console.warn('⚠️  RESEND_API_KEY not set — skipping order emails.');
    return;
  }

  const ref = `#${String(order.id).slice(-12).toUpperCase()}`;
  const customerEmail = (order.customerEmail || '').trim();

  const jobs = [];

  if (customerEmail) {
    jobs.push(
      resend.emails.send({
        from: FROM_ADDRESS,
        replyTo: 'orders@cnccrafts.in',
        to: customerEmail,
        subject: `Order Confirmed ${ref} — CNC Crafts`,
        html: buildCustomerOrderHtml(order),
        text: buildCustomerText(order),
      }).then(() => console.log(`📧 Order confirmation → customer ${customerEmail}`))
    );
  } else {
    console.warn('⚠️  No customer email on order — skipping customer email.');
  }

  jobs.push(
    resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAIL,
      subject: `New Order ${ref} — CNC Crafts`,
      html: buildAdminOrderHtml(order),
      text: buildAdminText(order),
    }).then(() => console.log(`📧 Order notification → admin ${ADMIN_EMAIL}`))
  );

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('❌ Failed to send order email:', r.reason?.message || r.reason);
    }
  }
}

function buildCustomAdminHtml(data) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:32px 0">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:#0f172a;padding:28px 32px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.02em">CNC Crafts</div>
            <div style="color:#94a3b8;font-size:12px;font-weight:600;margin-top:4px">New Custom Order Request</div>
          </div>
          <div style="background:#C7451F;color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700">CUSTOM</div>
        </div>
        <div style="padding:28px 32px">
          <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6">A new custom order request has been submitted via the storefront.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px">
              <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Customer</div>
              <div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(data.name)}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">${escapeHtml(data.email)}</div>
              <div style="font-size:12px;color:#64748b">${escapeHtml(data.phone || '')}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px">
              <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Spec</div>
              <div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(data.category || '')} / ${escapeHtml(data.material || '')}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Qty: ${data.quantity || 1} &middot; Timeline: ${escapeHtml(data.timeline || 'N/A')}</div>
            </div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:18px;font-size:13px;color:#334155;line-height:1.6">
            <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Design Brief</div>
            ${escapeHtml(data.message || '')}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:2px solid #0f172a">
            <span style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.18em">Timeline</span>
            <span style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(data.timeline || 'N/A')}</span>
          </div>
        </div>
        <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
          <span style="font-size:11px;color:#94a3b8;font-weight:600">CNC Crafts Admin Notification</span>
        </div>
      </div>
    </div>
  `;
}

function buildCustomCustomerHtml(data) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:32px 0">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:#0f172a;padding:28px 32px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.02em">CNC Crafts</div>
            <div style="color:#94a3b8;font-size:12px;font-weight:600;margin-top:4px">Custom Order Request Received</div>
          </div>
          <div style="background:#10b981;color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700">RECEIVED</div>
        </div>
        <div style="padding:28px 32px">
          <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6">Thanks for your custom order request. Our craft team will review your brief and get back with a quote within 24 hours.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:18px">
            <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Reference</div>
            <div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(data.category || 'Custom')} — ${escapeHtml(data.material || 'General')}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px">Qty: ${data.quantity || 1} &middot; Timeline: ${escapeHtml(data.timeline || 'N/A')}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:18px;font-size:13px;color:#334155;line-height:1.6">
            <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.18em;margin-bottom:8px">Your Brief</div>
            ${escapeHtml(data.message || '')}
          </div>
          <p style="margin:18px 0 0;color:#64748b;font-size:13px;line-height:1.6">For questions, reply to this email or contact us at <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#C7451F;text-decoration:none;font-weight:700">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>
        </div>
        <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
          <span style="font-size:11px;color:#94a3b8;font-weight:600">CNC Crafts — Precision in every cut.</span>
        </div>
      </div>
    </div>
  `;
}

async function sendCustomOrderEmails(data) {
  if (!resend) {
    console.warn('⚠️  RESEND_API_KEY not set — skipping custom order emails.');
    return;
  }

  const customerEmail = (data.email || '').trim();

  const jobs = [];

  if (customerEmail) {
    jobs.push(
      resend.emails.send({
        from: FROM_ADDRESS,
        replyTo: 'orders@cnccrafts.in',
        to: customerEmail,
        subject: 'Custom Order Request Received — CNC Crafts',
        html: buildCustomCustomerHtml(data),
        text: `Custom Order Request\n\nThank you for your custom order request. Our craft team will review your brief and get back with a quote within 24 hours.\n\nCategory: ${data.category || ''}\nMaterial: ${data.material || ''}\nQty: ${data.quantity || 1}\nTimeline: ${data.timeline || 'N/A'}\nBudget: ${data.budget || 'N/A'}\nBrief: ${data.message || ''}`,
      }).then(() => console.log(`📧 Custom order confirmation → customer ${customerEmail}`))
    );
  } else {
    console.warn('⚠️  No customer email on custom order — skipping customer email.');
  }

  jobs.push(
    resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAIL,
      subject: 'New Custom Order Request — CNC Crafts',
      html: buildCustomAdminHtml(data),
      text: `New Custom Order Request\n\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || ''}\nCategory: ${data.category || ''}\nMaterial: ${data.material || ''}\nQty: ${data.quantity || 1}\nTimeline: ${data.timeline || ''}\nBudget: ${data.budget || ''}\nBrief: ${data.message || ''}`,
    }).then(() => console.log(`📧 Custom order request → admin ${ADMIN_EMAIL}`))
  );

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('❌ Failed to send custom order email:', r.reason?.message || r.reason);
    }
  }
}

module.exports = { sendOrderEmails, sendCustomOrderEmails };
