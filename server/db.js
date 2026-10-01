/**
 * MongoDB-backed data layer for BusyWud Store.
 * All persistent app data lives in MongoDB Atlas. Images stay on Cloudinary.
 */
const { MongoClient } = require('mongodb');

const uri    = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'busywud';

if (!uri) {
  console.error('❌ MONGODB_URI missing in env — server will start in degraded mode (no DB operations work).');
  console.error('⚠️  Set MONGODB_URI in your .env file and restart.');
}

let client, db;
let productsCol, ordersCol, customersCol, contactsCol, settingsCol, countersCol;

// ─── Counters (auto-increment ids) ───────────────────────────────────────────
async function nextId(name) {
  if (!countersCol) throw new Error('Database not connected');
  const res = await countersCol.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return res.value ? res.value.seq : res.seq;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ─── Boot ────────────────────────────────────────────────────────────────────
async function connect() {
  if (!uri) {
    throw new Error('MONGODB_URI not set — cannot connect to database');
  }
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10,
  });
  await client.connect();
  db           = client.db(dbName);
  productsCol  = db.collection('products');
  ordersCol    = db.collection('orders');
  customersCol = db.collection('customers');
  contactsCol  = db.collection('contact_forms');
  settingsCol  = db.collection('settings');
  countersCol  = db.collection('counters');

  await Promise.all([
    productsCol.createIndex({ id: 1 }, { unique: true, background: true }).catch(() => {}),
    productsCol.createIndex({ category: 1 }, { background: true }).catch(() => {}),
    ordersCol.createIndex({ id: 1 }, { unique: true, background: true }).catch(() => {}),
    ordersCol.createIndex({ customerEmail: 1 }, { background: true }).catch(() => {}),
    customersCol.createIndex({ email: 1 }, { unique: true, background: true }).catch(() => {}),
    contactsCol.createIndex({ created_at: -1 }, { background: true }).catch(() => {}),
    settingsCol.createIndex({ key: 1 }, { unique: true, background: true }).catch(() => {}),
  ]);

  await seedIfEmpty();
  console.log(`✅ Mongo connected → db="${dbName}"`);
}

// ─── Seeding ────────────────────────────────────────────────────────────────
async function seedIfEmpty() {
  const count = await productsCol.countDocuments();
  if (count > 0) return;

  const now = new Date().toISOString();
  const seed = [
    {
      id: 1,
      name: 'GlowLogic Busy Board',
      category: 'busy-board',
      price: 1499,
      offer_price: null,
      description: 'Crafted from 100% natural, non-toxic wood with smooth rounded edges.',
      image: 'https://res.cloudinary.com/epwhlldb/image/upload/f_auto,q_auto/v1788360758/glowlogic_busy_board.webp',
      image_id: '',
      stock: 50,
      active: true,
      created_at: now
    }
  ];

  await productsCol.insertMany(seed);
  console.log('✅ Seeded BusyWud GlowLogic product.');
}

function customOrderProduct(id) {
  return {
    id,
    name:        'Custom Order — Bring Your Vision',
    category:    'custom',
    price:       0,
    offer_price: null,
    description: 'Have something unique in mind? Submit a custom order with your design brief, materials, dimensions and timeline — our craft team will get back with a personalised quote.',
    image:       'https://images.unsplash.com/photo-1607988795691-3d0147b43231?w=600&q=80',
    image_id:    '',
    stock:       999,
    active:      true,
    is_custom:   true,
    created_at:  new Date().toISOString(),
  };
}

// ─── Products ────────────────────────────────────────────────────────────────
async function getAllProducts({ activeOnly = false, category = null } = {}) {
  if (!productsCol) return [];
  const q = {};
  if (activeOnly) q.active = true;
  if (category)   q.category = category;
  return productsCol.find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
}
async function getProduct(id) {
  if (!productsCol) return null;
  const num = Number(id);
  const query = Number.isNaN(num) ? { id } : { id: num };
  return productsCol.findOne(query, { projection: { _id: 0 } });
}
async function getActiveProduct() {
  if (!productsCol) return null;
  return productsCol.findOne({ active: true }, { projection: { _id: 0 } });
}
async function addProduct(product) {
  const id = randomId();
  const entry = { id, ...product, created_at: new Date().toISOString() };
  await productsCol.insertOne(entry);
  const { _id, ...rest } = entry;
  return rest;
}
async function updateProduct(id, updates) {
  const num = Number(id);
  const query = Number.isNaN(num) ? { id } : { id: num };
  await productsCol.updateOne(query, { $set: updates });
  return getProduct(id);
}
async function deleteProduct(id) {
  const num = Number(id);
  const query = Number.isNaN(num) ? { id } : { id: num };
  const r = await productsCol.findOneAndDelete(query);
  return r?.value || null;
}

// ─── Orders ─────────────────────────────────────────────────────────────────
async function getAllOrders() {
  if (!ordersCol) return [];
  return ordersCol.find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
}
async function getOrder(id) {
  if (!ordersCol) return null;
  return ordersCol.findOne({ id: Number(id) }, { projection: { _id: 0 } });
}
async function addOrder(order) {
  const id = await nextId('orders');
  const entry = {
    id,
    ...order,
    customerEmail: (order.customerEmail || '').toLowerCase(),
    status: order.status || 'pending',
    created_at: new Date().toISOString(),
  };
  await ordersCol.insertOne(entry);
  const { _id, ...rest } = entry;
  return rest;
}
async function updateOrderStatus(id, status) {
  await ordersCol.updateOne({ id: Number(id) }, { $set: { status } });
  return getOrder(id);
}
async function updateOrder(id, updates) {
  await ordersCol.updateOne({ id: Number(id) }, { $set: updates });
  return getOrder(id);
}
async function updateOrderShipment(id, updates) {
  await ordersCol.updateOne({ id: Number(id) }, { $set: updates });
  return getOrder(id);
}

// ─── Customers ──────────────────────────────────────────────────────────────
async function getAllCustomers() {
  if (!customersCol) return [];
  return customersCol.find({}, { projection: { _id: 0, password: 0 } }).toArray();
}
async function getCustomerByEmail(email) {
  if (!customersCol) return null;
  return customersCol.findOne({ email: email.toLowerCase() });
}
async function getCustomer(id) {
  if (!customersCol) return null;
  return customersCol.findOne({ id: Number(id) }, { projection: { _id: 0, password: 0 } });
}
async function addCustomer(customer) {
  const id = await nextId('customers');
  const entry = { id, ...customer, email: customer.email.toLowerCase(), created_at: new Date().toISOString() };
  await customersCol.insertOne(entry);
  const { _id, password, ...rest } = entry;
  return rest;
}

// ─── Contact Forms ──────────────────────────────────────────────────────────
async function addContact(payload) {
  const id = await nextId('contacts');
  const entry = { id, ...payload, created_at: new Date().toISOString() };
  await contactsCol.insertOne(entry);
  const { _id, ...rest } = entry;
  return rest;
}
async function getAllContacts() {
  if (!contactsCol) return [];
  return contactsCol.find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
}

// ─── Settings ───────────────────────────────────────────────────────────────
async function getSettings() {
  if (!settingsCol) return {};
  const rows = await settingsCol.find({}, { projection: { _id: 0 } }).toArray();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}
async function setSetting(key, value) {
  await settingsCol.updateOne({ key }, { $set: { key, value } }, { upsert: true });
}

// ─── Stock ──────────────────────────────────────────────────────────────────
async function decrementStock(productId, quantity) {
  if (!productsCol) return;
  await productsCol.updateOne(
    { id: Number(productId), stock: { $gt: 0 } },
    { $inc: { stock: -Math.abs(quantity) } },
  );
}

module.exports = {
  connect,
  getAllProducts, getProduct, getActiveProduct, addProduct, updateProduct, deleteProduct,
  getAllOrders, getOrder, addOrder, updateOrder, updateOrderStatus, updateOrderShipment,
  getAllCustomers, getCustomerByEmail, getCustomer, addCustomer,
  addContact, getAllContacts,
  getSettings, setSetting,
  decrementStock,
};
