const express = require("express");
const fs = require("fs");
const path = require("path");
const products = require("./products");

const app = express();
const PORT = process.env.PORT || 3000;
const ORDERS_FILE = path.join(__dirname, "orders.json");
const SHIPPING_FREE_ABOVE = 1000;
const SHIPPING_FEE = 60;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const readOrders = () => {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); }
  catch { return []; }
};

// Products with optional ?search=...&category=...
app.get("/api/products", (req, res) => {
  const search = (req.query.search || "").toLowerCase().trim();
  const category = req.query.category || "All";
  const list = products.filter((p) =>
    (category === "All" || p.category === category) &&
    (!search || p.name.toLowerCase().includes(search) || p.desc.toLowerCase().includes(search))
  );
  res.json(list);
});

app.get("/api/categories", (req, res) => {
  res.json(["All", ...new Set(products.map((p) => p.category))]);
});

// Checkout: totals are calculated on the server using real prices
app.post("/api/orders", (req, res) => {
  const { name, email, address, items } = req.body;
  if (!name || !email || !address || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "Name, email, address and at least one item are required." });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: "Enter a valid email address." });

  const lines = [];
  for (const { id, qty } of items) {
    const p = products.find((x) => x.id === id);
    const q = Math.floor(Number(qty));
    if (!p || !(q > 0 && q <= 50)) return res.status(400).json({ error: "Invalid item in cart." });
    lines.push({ id: p.id, name: p.name, icon: p.icon, price: p.price, qty: q });
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const shipping = subtotal >= SHIPPING_FREE_ABOVE ? 0 : SHIPPING_FEE;

  const order = {
    id: "ORD" + Date.now().toString().slice(-8),
    name: String(name).slice(0, 60),
    email: String(email).toLowerCase().slice(0, 80),
    address: String(address).slice(0, 200),
    items: lines, subtotal, shipping, total: subtotal + shipping,
    date: new Date().toISOString()
  };
  const orders = readOrders();
  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  res.json(order);
});

// Order history by email
app.get("/api/orders", (req, res) => {
  const email = (req.query.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "Email is required." });
  res.json(readOrders().filter((o) => o.email === email).reverse());
});

app.listen(PORT, () => console.log(`FastCart running at http://localhost:${PORT}`));
