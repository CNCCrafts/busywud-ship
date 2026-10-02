const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Razorpay = require('razorpay');
const crypto   = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const db           = require('./db');
const cloudinary   = require('./config/cloudinary');
const { pushOrder, trackOrder, mapWebhookStatus } = require('./parcelguru');
const { sendOrderEmails, sendCustomOrderEmails } = require('./email');
const connectDB    = require('./config/db'); // Mongoose connection

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Upload storage: Cloudinary when configured, else local disk ─────────────
const CLOUDINARY_ENABLED =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET &&
  !process.env.CLOUDINARY_API_SECRET.includes('your_') &&
  !process.env.CLOUDINARY_API_SECRET.includes('here');

const uploadsDir = path.join(__dirname, 'uploads');
if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir, { recursive: true });

const storage = CLOUDINARY_ENABLED
  ? new CloudinaryStorage({
      cloudinary,
      params: async (req, file) => ({
        folder:          'busywud',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation:  [{ quality: 'auto', fetch_format: 'auto' }],
        public_id:       `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    })
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename:    (req, file, cb) => {
        const ext  = path.extname(file.originalname) || '.jpg';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});
const uploadMultiple = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
}).array('images', 10);

console.log(`📸 Image storage: ${CLOUDINARY_ENABLED ? 'Cloudinary' : 'Local disk'}`);

// Log ParcelGuru config status so "ready_to_ship" push failures are easy to spot in Render logs.
const PARCELGURU_READY =
  !!process.env.PARCELGURU_API_KEY &&
  !process.env.PARCELGURU_API_KEY.includes('your_') &&
  !process.env.PARCELGURU_API_KEY.includes('here');
console.log(`📦 ParcelGuru: ${PARCELGURU_READY ? 'configured (' + process.env.PARCELGURU_BASE_URL + ')' : 'NOT configured — "ready to ship" will skip the courier push. Add PARCELGURU_API_KEY env var.'}`);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(require('express-session')({
  secret: process.env.SESSION_SECRET || 'busywud-admin-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// ─── JWT auth (stateless — survives cold starts) ─────────────────────────────
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@cnccrafts.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@123';
const JWT_SECRET     = process.env.SESSION_SECRET || 'cnc-secret-default';
const TOKEN_TTL      = '30d';

const razorpay = new Razorpay({
  key_id:    process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

console.log(`🔐 Admin login: expected email="${ADMIN_EMAIL}" (from env: ${process.env.ADMIN_EMAIL ? 'YES' : 'NO — using default'})`);
console.log(`🔐 Admin login: expected password set=${ADMIN_PASSWORD ? 'YES' : 'NO'}`);

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}
function verifyToken(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Health
app.get('/api/health', async (req, res) => {
  res.json({ ok: true, mongo: 'connected', cloudinary: CLOUDINARY_ENABLED, ts: new Date().toISOString() });
});

// ─── Auth — Admin ─────────────────────────────────────────────────────────────
app.post('/api/auth/admin-login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
    return res.json({ token: signToken({ role: 'admin', email: ADMIN_EMAIL }) });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/auth/verify', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, role: decoded.role });
  } catch {
    return res.status(401).json({ valid: false });
  }
});

app.post('/api/auth/logout', (req, res) => { res.json({ success: true }); });

// ─── Backward-compat aliases for old CNC admin panel ─────────────────────────
// Old React admin panel expects POST /api/auth/login and POST /api/auth/google
const GOOGLE_CLIENT_ID = process.env.GAuth;

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.adminLoggedIn = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Google credential required' });
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const token = signToken({ role: 'admin', email: payload.email });
    res.json({ token, user: { name: payload.name, email: payload.email, picture: payload.picture } });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

app.get('/api/auth/verify', verifyToken, (req, res) => {
  res.json({ valid: true, user: { email: req.user.email, role: req.user.role } });
});

// ─── Auth — Customers ─────────────────────────────────────────────────────────
app.post('/api/auth/customer-register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
    if (password.length < 6)          return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const existing = await db.getCustomerByEmail(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const password_hash = await bcrypt.hash(password, 10);
    const customer = await db.addCustomer({ name, email, password: password_hash });
    const token    = signToken({ role: 'customer', email: customer.email, name: customer.name });
    res.json({ customer: { id: customer.id, name: customer.name, email: customer.email }, token });
  } catch (err) {
    console.error('register:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/customer-login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const customer = await db.getCustomerByEmail(email);
    if (!customer) return res.status(401).json({ error: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, customer.password || '');
    if (!ok)       return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken({ role: 'customer', email: customer.email, name: customer.name });
    res.json({ customer: { id: customer.id, name: customer.name, email: customer.email }, token });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── File Upload → Cloudinary or Local ───────────────────────────────────────
app.post('/api/upload', verifyToken, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (CLOUDINARY_ENABLED) {
    return res.json({ url: req.file.path, public_id: req.file.filename });
  }
  return res.json({ url: `/uploads/${req.file.filename}`, public_id: req.file.filename });
});

app.post('/api/upload-multiple', verifyToken, uploadMultiple, (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const results = req.files.map((file) => {
    if (CLOUDINARY_ENABLED) {
      return { url: file.path, image_id: file.filename };
    }
    return { url: `/uploads/${file.filename}`, image_id: file.filename };
  });
  res.json({ images: results });
});
app.use('/uploads', express.static(uploadsDir));

// ─── Razorpay Payments ─────────────────────────────────────────────────────────
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, customer, items, currency = "INR" } = req.body || {};
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const order = await razorpay.orders.create({
      amount:   Math.round(amount * 100),
      currency,
      receipt:  `rcpt_${Date.now()}`,
    });

    const pendingOrder = await db.addOrder({
      customerName:  customer?.name  || 'Guest Parent',
      customerEmail: customer?.email || 'parent@busywud.com',
      customerPhone: customer?.phone || '',
      address:       customer?.address || '',
      items:         JSON.stringify(items || []),
      total:         amount,
      status:        'CREATED',
      payment_id:    order.id,
    });

    res.json({ ...order, dbOrderId: pendingOrder.id });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, customer, items } = req.body || {};

    if (razorpay_signature) {
      const generated = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      if (generated !== razorpay_signature) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }
    }

    const list = await db.getAllOrders();
    const existing = list.find(o => o.payment_id === razorpay_order_id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    await db.updateOrder(existing.id, {
      status:      'PAID',
      payment_id:  razorpay_payment_id,
    });

    sendOrderEmails({ ...existing, items: JSON.parse(existing.items || '[]') }).catch(() => {});

    res.json({ success: true, order: existing });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: err.message || 'Payment verification failed' });
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const products = await db.getAllProducts({ activeOnly: true, category: req.query.category || null });
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/all', async (req, res) => {
  try { res.json(await db.getAllProducts()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', verifyToken, async (req, res) => {
  try {
    const { name, category, price, offer_price, description, image, image_id, stock, gallery } = req.body;
    const product = await db.addProduct({
      name, category,
      price:       parseFloat(price) || 0,
      offer_price: offer_price != null && offer_price !== '' ? parseFloat(offer_price) : null,
      description: description || '',
      image:       image || '',
      image_id:    image_id || '',
      gallery:     Array.isArray(gallery) ? gallery : [],
      stock:       parseInt(stock) || 0,
      active:      true,
    });
    res.json({ id: product.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id', verifyToken, async (req, res) => {
  try {
    const { name, category, price, offer_price, description, image, image_id, stock, active, gallery } = req.body;
    const updates = {
      name, category,
      price:       parseFloat(price) || 0,
      offer_price: offer_price != null && offer_price !== '' ? parseFloat(offer_price) : null,
      description, image,
      image_id:    image_id || '',
      stock:       parseInt(stock) || 0,
      active:      active ?? true,
    };
    if (Array.isArray(gallery)) updates.gallery = gallery;
    await db.updateProduct(req.params.id, updates);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', verifyToken, async (req, res) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (product?.image_id) {
      if (CLOUDINARY_ENABLED) cloudinary.uploader.destroy(product.image_id).catch(() => {});
      else                    try { require('fs').unlinkSync(path.join(uploadsDir, product.image_id)); } catch {}
    }
    await db.deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Orders ───────────────────────────────────────────────────────────────────
function parseItems(o) {
  return { ...o, items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []) };
}

app.get('/api/orders', verifyToken, async (req, res) => {
  try {
    const orders = (await db.getAllOrders()).map(parseItems);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders/track', async (req, res) => {
  try {
    const { id, email } = req.query;
    if (!id || !email) return res.status(400).json({ error: 'id and email required' });
    const order = await db.getOrder(id);
    if (!order || order.customerEmail !== email.toLowerCase()) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(parseItems(order));
  } catch (err) { res.status(404).json({ error: 'Order not found' }); }
});

app.get('/api/orders/mine', async (req, res) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    const list = (await db.getAllOrders())
      .filter(o => (o.customerEmail || '').toLowerCase() === email)
      .map(parseItems);
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, address, items, total } = req.body;
    const order = await db.addOrder({
      customerName, customerEmail, customerPhone: customerPhone || '',
      address: address || '',
      items: JSON.stringify(items),
      total,
    });
    for (const item of items) await db.decrementStock(item.id, item.quantity);
    res.json({ id: order.id });

    sendOrderEmails({ ...order, items: parseItems(order).items }).catch((err) => {
      console.error('Order email error (non-fatal):', err.message);
    });

    // Manifest the order to ParcelGuru immediately on placement so it shows up
    // in the courier dashboard right away. Admin can still re-push on
    // "ready_to_ship". Errors are non-fatal and stored on the order.
    pushOrder({ ...order, items: parseItems(order).items }).then((result) => {
      const updates = {
        parcelguru_push_status: result.status || 'error',
        parcelguru_pushed_at:   new Date().toISOString(),
      };
      if (result.error) updates.parcelguru_error = String(result.error).slice(0, 500);
      const awb = result?.awb_number || result?.awb || result?.data?.awb_number || result?.data?.trackingNo;
      if (awb) updates.awb_number = String(awb);
      db.updateOrderShipment(order.id, updates).catch(() => {});
    }).catch((err) => {
      console.error('ParcelGuru push error (non-fatal):', err.message);
      db.updateOrderShipment(order.id, {
        parcelguru_push_status: 'error',
        parcelguru_error:       String(err.message).slice(0, 500),
        parcelguru_pushed_at:   new Date().toISOString(),
      }).catch(() => {});
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/orders/:id/status', verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    await db.updateOrderStatus(req.params.id, status);

    // When admin marks an order "ready_to_ship", create the ParcelGuru
    // shipment request (manifests the order against the configured carrier).
    if (status === 'ready_to_ship') {
      const order = await db.getOrder(req.params.id);
      if (order && order.items) {
        // Fire the push asynchronously so the admin UI isn't blocked.
        pushOrder({ ...order, items: parseItems(order).items }).then((body) => {
          const updates = {
            parcelguru_push_status: body.status || 'error',
            parcelguru_pushed_at:   new Date().toISOString(),
          };
          if (body.error) updates.parcelguru_error = String(body.error).slice(0, 500);
          // If the push returned an AWB number, store it on the order.
          const awb = body?.awb_number || body?.awb || body?.data?.awb_number || body?.data?.trackingNo;
          if (awb) updates.awb_number = String(awb);
          db.updateOrderShipment(req.params.id, updates).catch(() => {});
        }).catch((err) => {
          console.error('ParcelGuru push error (non-fatal):', err.message);
          db.updateOrderShipment(req.params.id, {
            parcelguru_push_status: 'error',
            parcelguru_error:       String(err.message).slice(0, 500),
            parcelguru_pushed_at:   new Date().toISOString(),
          }).catch(() => {});
        });
      }
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ParcelGuru Webhook (real-time shipment status updates) ─────────────────
// ParcelGuru POSTs shipment status events to this endpoint. The request is
// authenticated via the `x-access-token` header, which must match
// PARCELGURU_WEBHOOK_TOKEN (set in .env). ParcelGuru also sends the AWB number
// back, which we store on the order so it can be surfaced in the admin panel.
app.post('/api/v1/channel/event/hook', async (req, res) => {
  const token = req.headers['x-access-token'] || '';
  const expected = process.env.PARCELGURU_WEBHOOK_TOKEN || '';
  if (expected && token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { event, order_id, awb_number } = req.body || {};
    const shipmentStatus = event?.status || '';

    // Map the ParcelGuru shipment status to our internal order status.
    const internalStatus = mapWebhookStatus(shipmentStatus);
    if (!internalStatus) {
      console.warn(`⚠️ ParcelGuru webhook: unknown shipment status "${shipmentStatus}" — ignoring.`);
      return res.json({ success: true, ignored: true });
    }

    // Find the order by its ParcelGuru order_id (stored as "#CNC-<id>") or by
    // original order id. Order ids are numeric local ids.
    let orderId;
    const idMatch = String(order_id || '').match(/#CNC-(\d+)/);
    if (idMatch) {
      orderId = Number(idMatch[1]);
    } else {
      orderId = Number(order_id);
    }

    if (!orderId) {
      console.warn('⚠️ ParcelGuru webhook: no resolvable order_id — ignoring.');
      return res.json({ success: true, ignored: true });
    }

    const updates = { status: internalStatus };
    if (awb_number) {
      updates.awb_number = String(awb_number);
      updates.awb_updated_at = new Date().toISOString();
    }

    await db.updateOrderShipment(orderId, updates);
    console.log(`🔔 ParcelGuru webhook → order #${orderId} status="${internalStatus}"` + (awb_number ? ` awb=${awb_number}` : ''));
    res.json({ success: true });
  } catch (err) {
    console.error('parcelguru webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Inventory ────────────────────────────────────────────────────────────────
app.get('/api/inventory/', async (req, res) => {
  try {
    const products = await db.getAllProducts();
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    await db.updateProduct(req.params.id, { stock: parseInt(req.body.stock) || 0 });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try { res.json(await db.getSettings()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', verifyToken, async (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body || {})) await db.setSetting(k, v);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Contact form ─────────────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message, type } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required.' });
    const entry = await db.addContact({
      name:    String(name).trim(),
      email:   String(email).toLowerCase().trim(),
      phone:   phone   ? String(phone).trim()   : '',
      subject: subject ? String(subject).trim() : '',
      message: String(message).trim(),
      type:    type    ? String(type).trim()    : 'contact',
      status:  'new',
    });
    res.json({ success: true, id: entry.id });
  } catch (err) {
    console.error('contact:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contact', verifyToken, async (req, res) => {
  try { res.json(await db.getAllContacts()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Custom Orders (customer submissions) ─────────────────────────────────────
// Images go to Cloudinary (when configured) — text stays in Mongo (contact_forms).
app.post('/api/custom-order', upload.single('image'), async (req, res) => {
  try {
    const { name, email, phone, category, material, dimensions, quantity, budget, timeline, message, imageUrl } = req.body || {};

    if (!name || !email || !message) {
      // Free the uploaded file if validation fails
      if (req.file?.path && !CLOUDINARY_ENABLED) {
        try { require('fs').unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ error: 'Name, email and design brief are required.' });
    }

    // Resolve final image reference: uploaded file (Cloudinary) > pasted URL
    let image = '';
    if (req.file) {
      image = CLOUDINARY_ENABLED ? req.file.path : `/uploads/${req.file.filename}`;
    } else if (imageUrl) {
      image = String(imageUrl).trim();
    }

    const entry = await db.addContact({
      name:    String(name).trim(),
      email:   String(email).toLowerCase().trim(),
      phone:   phone   ? String(phone).trim()   : '',
      subject: `Custom Order — ${category || 'General'}`,
      message: String(message).trim(),
      type:    'custom-order',
      status:  'new',
      custom:  {
        category, material, dimensions,
        quantity, budget, timeline,
        image,
      },
    });

    sendCustomOrderEmails({
      name, email, phone, category, material,
      dimensions, quantity, budget, timeline, message, image,
    }).catch((err) => {
      console.error('Custom order email error (non-fatal):', err.message);
    });

    res.json({ success: true, id: entry.id });
  } catch (err) {
    console.error('custom-order:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Customer Order History & Account ─────────────────────────────────────────
app.get('/api/my-orders', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const list = (await db.getAllOrders())
      .filter(o => (o.customerEmail || '').toLowerCase() === email.toLowerCase())
      .map(parseItems)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/my-account', async (req, res) => {
  try {
    const { email, name, phone, address, pincode } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const list = (await db.getAllOrders())
      .filter(o => (o.customerEmail || '').toLowerCase() === email.toLowerCase());
    for (const order of list) {
      await db.updateOrder(order.id, {
        customerName:  name || order.customerName,
        customerPhone: phone || order.customerPhone,
        address:       address || order.address,
      });
    }
    const updated = list[0] || {};
    res.json({ success: true, customer: { name: updated.customerName, email, phone, address, pincode } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BusyWud Storefront Aliases ────────────────────────────────────────────────
app.get('/api/product', async (req, res) => {
  try {
    const p = await db.getActiveProduct();
    if (p) return res.json(p);
    res.status(404).json({ error: 'No active product' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/video', (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const publicId = process.env.CLOUDINARY_VIDEO_PUBLIC_ID || 'generate_a_video';
  if (!cloudName) return res.status(500).json({ error: 'Cloudinary not configured' });
  res.json({
    url: `https://res.cloudinary.com/${cloudName}/video/upload/v1788360996/${publicId}.mp4`,
    publicId
  });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.adminLoggedIn = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/check', (req, res) => {
  res.json({ loggedIn: !!req.session.adminLoggedIn });
});

// ─── Categories ───────────────────────────────────────────────────────────────
app.get('/api/categories', (req, res) => {
  res.json([
    { id: 'busy-board', label: 'Busy Board' },
  ]);
});

// ─── Static (production) ──────────────────────────────────────────────────────
// Serve the built React app (client/dist) if it exists, with SPA fallback so
// that client-side routes (/about, /admin, /categories, etc.) work on reload.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const adminDist  = path.join(__dirname, 'admin-dist');
const fs = require('fs');
if (fs.existsSync(adminDist)) {
  app.use('/admin', express.static(adminDist));
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(adminDist, 'index.html'));
  });
  // SPA fallback for old React admin panel client-side routes
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(adminDist, 'index.html'));
  });
}
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  // API health / root check (kept for deployment health checks)
  app.get('/', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  // SPA fallback: any non-API GET that isn't a static asset → index.html
  app.get(/^\/(?!api\b|uploads\b|admin\b).*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/admin')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  // Final catch-all for any remaining unmatched GET
  app.use((req, res, next) => {
    if (req.method === 'GET' &&
        !req.path.startsWith('/api') &&
        !req.path.startsWith('/uploads') &&
        !req.path.startsWith('/admin') &&
        !path.extname(req.path)) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    next();
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'BusyWud Backend API is running.'
    });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    await db.connect();
    console.log('✅ Native MongoDB driver connected.');
  } catch (err) {
    console.error('⚠️ Native MongoDB driver connection failed:', err.message);
    console.log('⚠️ Server will start in degraded mode — admin login still works.');
  }

  // Also try Mongoose connection (non-blocking)
  connectDB().catch(err => {
    console.warn('⚠️ Mongoose connection failed (non-fatal):', err.message);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BusyWud server running on http://localhost:${PORT}`);
  });
}

boot();
