const $ = (id) => document.getElementById(id);
const views = ["shop", "cart", "checkout", "done", "orders"];
const show = (v) => { views.forEach((x) => $(x).classList.toggle("active", x === v)); window.scrollTo(0, 0); };
const money = (n) => "₹" + n.toLocaleString("en-IN");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let catalog = {};                 // id -> product (for the cart)
let category = "All";
let cart = JSON.parse(localStorage.getItem("cart") || "[]");   // [{id, qty}]
const FREE_SHIP = 1000, SHIP_FEE = 60;

const saveCart = () => { localStorage.setItem("cart", JSON.stringify(cart)); $("cartCount").textContent = cart.reduce((s, i) => s + i.qty, 0); };
function toast(msg) { $("toast").textContent = msg; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 1600); }

/* ---------- Catalog ---------- */
async function init() {
  const all = await (await fetch("/api/products")).json();
  all.forEach((p) => (catalog[p.id] = p));
  const cats = await (await fetch("/api/categories")).json();
  $("filters").innerHTML = cats.map((c) => `<button class="chip ${c === category ? "on" : ""}" data-cat="${c}">${c}</button>`).join("");
  $("filters").onclick = (e) => {
    if (!e.target.dataset.cat) return;
    category = e.target.dataset.cat;
    document.querySelectorAll(".chip").forEach((b) => b.classList.toggle("on", b.dataset.cat === category));
    loadProducts();
  };
  saveCart();
  loadProducts();
}

async function loadProducts() {
  const q = new URLSearchParams({ search: $("search").value, category });
  const list = await (await fetch("/api/products?" + q)).json();
  $("grid").innerHTML = list.length ? list.map((p) => `
    <article class="card">
      <div class="pic" aria-hidden="true">${p.icon}</div>
      <h3>${p.name}</h3>
      <span class="cat">${p.category}</span>
      <p>${p.desc}</p>
      <div class="foot"><span class="price">${money(p.price)}</span><button data-add="${p.id}">Add to cart</button></div>
    </article>`).join("") : `<p class="empty">No products match your search. Try a different word or category.</p>`;
}

$("grid").onclick = (e) => { if (e.target.dataset.add) addToCart(Number(e.target.dataset.add)); };
let t; $("search").oninput = () => { clearTimeout(t); t = setTimeout(() => { show("shop"); loadProducts(); }, 250); };

/* ---------- Cart ---------- */
function addToCart(id) {
  const line = cart.find((i) => i.id === id);
  line ? line.qty++ : cart.push({ id, qty: 1 });
  saveCart(); toast(catalog[id].name + " added to cart");
}

function totals() {
  const subtotal = cart.reduce((s, i) => s + catalog[i.id].price * i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIP ? 0 : SHIP_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

function renderCart() {
  if (!cart.length) { $("cartItems").innerHTML = `<p class="empty">Your cart is empty. Pick something from the shop.</p><button id="goShop">Browse products</button>`; $("goShop").onclick = () => show("shop"); return; }
  const t = totals();
  $("cartItems").innerHTML = cart.map((i) => { const p = catalog[i.id]; return `
    <div class="cartRow">
      <span class="ic" aria-hidden="true">${p.icon}</span>
      <div><strong>${p.name}</strong><br><small>${money(p.price)} each</small></div>
      <div class="qty"><button data-dec="${p.id}" aria-label="Decrease quantity">-</button><span>${i.qty}</span><button data-inc="${p.id}" aria-label="Increase quantity">+</button></div>
      <strong>${money(p.price * i.qty)}</strong>
      <button class="rm" data-rm="${p.id}">Remove</button>
    </div>`; }).join("") + `
    <div class="totals">
      <div>Subtotal: ${money(t.subtotal)}</div>
      <div>Shipping: ${t.shipping ? money(t.shipping) : "Free"}</div>
      <div class="grand">Total: ${money(t.total)}</div>
      <button id="toCheckout">Go to checkout</button>
    </div>`;
  $("toCheckout").onclick = openCheckout;
}

$("cartItems").onclick = (e) => {
  const d = e.target.dataset;
  if (d.inc) cart.find((i) => i.id == d.inc).qty++;
  if (d.dec) { const l = cart.find((i) => i.id == d.dec); l.qty--; if (l.qty < 1) cart = cart.filter((i) => i !== l); }
  if (d.rm) cart = cart.filter((i) => i.id != d.rm);
  if (d.inc || d.dec || d.rm) { saveCart(); renderCart(); }
};

/* ---------- Checkout ---------- */
function openCheckout() {
  const t = totals();
  $("summary").innerHTML = `<h3>Order summary</h3>` + cart.map((i) => `<div>${catalog[i.id].name} x ${i.qty} <span style="float:right">${money(catalog[i.id].price * i.qty)}</span></div>`).join("") +
    `<hr><div>Shipping <span style="float:right">${t.shipping ? money(t.shipping) : "Free"}</span></div><div class="price">Total <span style="float:right">${money(t.total)}</span></div>`;
  $("formError").textContent = "";
  $("cEmail").value = localStorage.getItem("email") || "";
  show("checkout");
}

$("placeBtn").onclick = async () => {
  const body = { name: $("cName").value.trim(), email: $("cEmail").value.trim(), address: $("cAddress").value.trim(), items: cart };
  const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { $("formError").textContent = data.error; return; }
  localStorage.setItem("email", data.email);
  cart = []; saveCart();
  $("doneBody").innerHTML = `<p>Thank you, ${esc(data.name)}. Your order <strong>${data.id}</strong> is confirmed.</p><p>Total paid on delivery: <strong>${money(data.total)}</strong></p><p>We'll deliver to: ${esc(data.address)}</p>`;
  show("done");
};

/* ---------- Order history ---------- */
async function loadOrders() {
  const email = $("oEmail").value.trim();
  if (!email) { $("orderList").innerHTML = `<p class="empty">Enter the email you used at checkout.</p>`; return; }
  const res = await fetch("/api/orders?email=" + encodeURIComponent(email));
  const list = await res.json();
  $("orderList").innerHTML = list.length ? list.map((o) => `
    <div class="box order">
      <header><span>${o.id}</span><span>${new Date(o.date).toLocaleString()}</span></header>
      <ul>${o.items.map((i) => `<li>${i.icon} ${esc(i.name)} x ${i.qty} - ${money(i.price * i.qty)}</li>`).join("")}</ul>
      <strong>Total: ${money(o.total)}</strong>
    </div>`).join("") : `<p class="empty">No orders found for this email.</p>`;
}

/* ---------- Navigation ---------- */
$("logo").onclick = (e) => { e.preventDefault(); show("shop"); };
$("navCart").onclick = () => { renderCart(); show("cart"); };
$("navOrders").onclick = () => { $("oEmail").value = localStorage.getItem("email") || ""; show("orders"); if ($("oEmail").value) loadOrders(); };
$("findOrders").onclick = loadOrders;
$("keepShopping").onclick = () => show("shop");

init();
