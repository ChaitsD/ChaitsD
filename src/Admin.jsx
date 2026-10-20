import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus, ArrowUpRight, Trash2, X } from "lucide-react";
import { api } from "./api";
import { useStore } from "./store";
import { money, productImage } from "./data";
import { Field, Message } from "./Commerce";
const paise = (v) => Math.round(Number(v) * 100);
const localDate = (v) =>
  v
    ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const isoDate = (v) => (v ? new Date(v).toISOString() : null);
function Upload({ label, value, onChange, video = false, onError }) {
  const [busy, setBusy] = useState(false);
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/admin/uploads", {
        method: "POST",
        body: form,
      });
      if ((video ? "video" : "image") !== result.type)
        throw Error(video ? "Choose a video file." : "Choose an image file.");
      onChange(result.url);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  return (
    <div className="upload-field">
      <span>{label}</span>
      {value &&
        (video ? (
          <video src={value} controls preload="metadata" />
        ) : (
          <img src={value} alt={label} />
        ))}
      <label className="outline-button">
        {busy ? "UPLOADING…" : "UPLOAD / REPLACE"}
        <input
          type="file"
          accept={
            video ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp"
          }
          onChange={upload}
          disabled={busy}
        />
      </label>
      {value && (
        <button
          type="button"
          className="underlined"
          onClick={() => onChange(null)}
        >
          REMOVE MEDIA
        </button>
      )}
      <small>
        {video ? "MP4 / WebM, up to 80 MB" : "PNG / JPEG / WebP, up to 10 MB"}
      </small>
    </div>
  );
}
function AdminLogin() {
  const { setUser } = useStore(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-page section-pad">
      <div className="eyebrow">MAYGREY / RESTRICTED ACCESS</div>
      <h1>BEHIND THE DROP.</h1>
      <p className="muted">
        Sign in with an admin account provisioned on the server.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api("/auth/login", {
              method: "POST",
              body: { email, password, admin: true },
            });
            setUser(r.user);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Admin email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Message error={error} />
        <button className="dark-button" disabled={busy}>
          {busy ? "SIGNING IN…" : "SIGN IN TO ADMIN"} <ArrowUpRight size={18} />
        </button>
      </form>
    </main>
  );
}
export default function Admin() {
  const { user, logout } = useStore(),
    location = useLocation();
  const [authError, setAuthError] = useState("");
  if (user?.role !== "admin") return <AdminLogin />;
  const tab = location.pathname.split("/")[2] || "dashboard";
  return (
    <main className="admin-page section-pad">
      <div className="admin-title">
        <div>
          <div className="eyebrow">MAYGREY / CONTROL ROOM</div>
          <h1>BEHIND THE DROP.</h1>
        </div>
        <button
          className="outline-button"
          onClick={async () => {
            try {
              await logout();
            } catch (e) {
              setAuthError(e.message);
            }
          }}
        >
          SIGN OUT
        </button>
      </div>
      <Message error={authError} />
      <div className="test-banner">
        TEST COMMERCE — Dashboard revenue includes mock orders. No live payment
        or courier integration.
      </div>
      <nav className="admin-nav" aria-label="Admin navigation">
        {[
          "dashboard",
          "products",
          "collections",
          "coupons",
          "orders",
          "settings",
        ].map((t) => (
          <Link
            key={t}
            className={t === tab ? "active" : ""}
            to={t === "dashboard" ? "/admin" : "/admin/" + t}
          >
            {t}
          </Link>
        ))}
      </nav>
      {tab === "dashboard" ? (
        <Dashboard />
      ) : tab === "products" ? (
        <ProductsAdmin />
      ) : tab === "collections" ? (
        <CollectionsAdmin />
      ) : tab === "coupons" ? (
        <CouponsAdmin />
      ) : tab === "orders" ? (
        <OrdersAdmin />
      ) : tab === "settings" ? (
        <SettingsAdmin />
      ) : (
        <p>Admin page not found.</p>
      )}
    </main>
  );
}
function Dashboard() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = () =>
    api("/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Message error={error} />
      <div className="admin-section-title">
        <h2>AT A GLANCE.</h2>
        <button className="outline-button" onClick={load}>
          REFRESH
        </button>
      </div>
      {data && (
        <>
          <div className="metric-grid">
            {[
              ["Total orders", data.totalOrders],
              ["Revenue (test)", money(data.revenue / 100)],
              ["Products sold", data.productsSold],
              ["Low-stock variants", data.lowStock.length],
            ].map(([t, v]) => (
              <div key={t}>
                <small>{t}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <h3>RECENT ORDERS</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ORDER</th>
                  <th>STATUS</th>
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to="/admin/orders">{o.id} ↗</Link>
                    </td>
                    <td>{o.status}</td>
                    <td>{money(o.total / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.recentOrders.length && (
              <p className="muted">No orders yet.</p>
            )}
          </div>
          <h3>LOW STOCK / SOLD OUT</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PRODUCT</th>
                  <th>VARIANT SKU</th>
                  <th>STOCK</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((v) => (
                  <tr key={v.sku}>
                    <td>{v.name}</td>
                    <td>{v.sku}</td>
                    <td>{v.stock === 0 ? "SOLD OUT" : v.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.lowStock.length && (
              <p className="muted">
                All active variants are above their low-stock threshold.
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
const newProduct = () => ({
  name: "",
  sku: "",
  description: "",
  fabric: "100% cotton",
  gsm: 240,
  fit: "Oversized, dropped shoulder",
  care: "Wash cold inside out. Dry in shade.",
  color: "Washed black",
  tone: "#333331",
  regular_price: 149900,
  sale_price: null,
  sale_active: false,
  sale_start: null,
  sale_end: null,
  status: "draft",
  featured: false,
  collection_id: "drop-001",
  images: { front: null, back: null, detail: null },
  variants: ["S", "M", "L", "XL"].map((size) => ({
    size,
    stock: 0,
    low_stock_threshold: 3,
  })),
});
function ProductsAdmin() {
  const { refresh } = useStore(),
    [list, setList] = useState([]),
    [collections, setCollections] = useState([]),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = async () => {
    const [p, c] = await Promise.all([
      api("/admin/products"),
      api("/admin/collections"),
    ]);
    setList(p);
    setCollections(c);
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function remove(p) {
    if (
      !window.confirm(`Delete ${p.name}? Historical orders will be retained.`)
    )
      return;
    try {
      await api("/admin/products/" + p.id, { method: "DELETE", body: {} });
      await load();
      await refresh();
      setMessage("Product deleted. Historical order records were retained.");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="admin-section-title">
        <h2>THE PIECES.</h2>
        <button
          className="dark-button"
          onClick={() => {
            setEditing(newProduct());
            setError("");
            setMessage("");
          }}
        >
          ADD PRODUCT <Plus size={18} />
        </button>
      </div>
      <Message error={error} message={message} />
      {editing ? (
        <ProductEditor
          key={editing.id || "new"}
          product={editing}
          collections={collections}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            await refresh();
            setMessage("Product saved. Storefront prices and stock refreshed.");
          }}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PRODUCT</th>
                <th>SKU</th>
                <th>STATUS</th>
                <th>PRICE</th>
                <th>STOCK</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="admin-product-name">
                      <img src={productImage(p)} alt="" />
                      <span>
                        {p.name}
                        {p.featured && <small>FEATURED</small>}
                      </span>
                    </div>
                  </td>
                  <td>{p.sku}</td>
                  <td>{p.status}</td>
                  <td>{money(p.price)}</td>
                  <td>{p.stock}</td>
                  <td>
                    <button
                      className="underlined"
                      onClick={() => {
                        setEditing({
                          ...p,
                          expected_updated_at: p.updated_at,
                          variants: p.variants.map((v) => ({
                            ...v,
                            expected_stock: v.stock,
                          })),
                        });
                        setMessage("");
                        setError("");
                      }}
                    >
                      EDIT
                    </button>
                    <button
                      className="underlined danger"
                      onClick={() => remove(p)}
                    >
                      DELETE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function ProductEditor({ product, collections, onCancel, onSaved }) {
  const [p, setP] = useState(() => structuredClone(product)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [size, setSize] = useState("");
  const set = (k, v) => setP((p) => ({ ...p, [k]: v }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin/products" + (p.id ? "/" + p.id : ""), {
        method: p.id ? "PUT" : "POST",
        body: p,
      });
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="admin-editor">
      <div className="admin-section-title">
        <h3>{p.id ? "EDIT PRODUCT" : "NEW PRODUCT"}</h3>
        <button type="button" className="outline-button" onClick={onCancel}>
          CANCEL
        </button>
      </div>
      <div className="form-grid">
        {[
          ["name", "Product name"],
          ["sku", "SKU"],
          ["color", "Color"],
          ["fabric", "Fabric"],
          ["fit", "Fit"],
        ].map(([key, label]) => (
          <Field
            key={key}
            label={label}
            required={["name", "sku", "color"].includes(key)}
            value={p[key]}
            onChange={(e) => set(key, e.target.value)}
          />
        ))}
        <Field
          label="GSM"
          required
          type="number"
          min="1"
          max="2000"
          value={p.gsm}
          onChange={(e) => set("gsm", Number(e.target.value))}
        />
        <Field
          label="Color swatch"
          type="color"
          value={p.tone}
          onChange={(e) => set("tone", e.target.value)}
        />
        <Field label="Status">
          <select
            value={p.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="draft">Draft — hidden</option>
            <option value="active">Active</option>
            <option value="sold_out">
              Sold out — visible, not purchasable
            </option>
          </select>
        </Field>
        <Field label="Collection / Drop">
          <select
            value={p.collection_id || ""}
            onChange={(e) => set("collection_id", e.target.value || null)}
          >
            <option value="">No collection</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea
          rows="4"
          value={p.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <Field label="Care instructions">
        <textarea
          rows="3"
          value={p.care}
          onChange={(e) => set("care", e.target.value)}
        />
      </Field>
      <label className="check-field">
        <input
          type="checkbox"
          checked={p.featured}
          onChange={(e) => set("featured", e.target.checked)}
        />
        Feature on homepage
      </label>
      <h3>PRICING / INR</h3>
      <div className="form-grid">
        <Field
          label="Regular price / MRP (₹)"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={p.regular_price / 100}
          onChange={(e) => set("regular_price", paise(e.target.value))}
        />
        <Field
          label="Optional sale price (₹)"
          type="number"
          min="0"
          max={p.regular_price / 100}
          step="0.01"
          value={p.sale_price === null ? "" : p.sale_price / 100}
          onChange={(e) =>
            set(
              "sale_price",
              e.target.value === "" ? null : paise(e.target.value),
            )
          }
        />
        <Field
          label="Sale starts (your local time)"
          type="datetime-local"
          value={localDate(p.sale_start)}
          onChange={(e) => set("sale_start", isoDate(e.target.value))}
        />
        <Field
          label="Sale ends (your local time)"
          type="datetime-local"
          value={localDate(p.sale_end)}
          onChange={(e) => set("sale_end", isoDate(e.target.value))}
        />
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={p.sale_active}
          onChange={(e) => set("sale_active", e.target.checked)}
        />
        Enable sale{" "}
        {p.sale_price !== null && p.regular_price > 0
          ? `— ${Math.round(((p.regular_price - p.sale_price) * 100) / p.regular_price)}% discount`
          : ""}
      </label>
      <h3>VARIANTS / INVENTORY</h3>
      <p className="muted">
        One color per product, stock tracked separately per size. Add XXL only
        if required. Removed sizes cannot be purchased; historical orders are
        preserved.
      </p>
      <div className="variant-list">
        {p.variants.map((v, i) => (
          <div key={v.size}>
            <strong>{v.size}</strong>
            <Field
              label="Stock"
              type="number"
              min="0"
              max="100000"
              required
              value={v.stock}
              onChange={(e) =>
                set(
                  "variants",
                  p.variants.map((x, j) =>
                    j === i ? { ...x, stock: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <Field
              label="Low stock at"
              type="number"
              min="0"
              required
              value={v.low_stock_threshold}
              onChange={(e) =>
                set(
                  "variants",
                  p.variants.map((x, j) =>
                    j === i
                      ? { ...x, low_stock_threshold: Number(e.target.value) }
                      : x,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={"Remove size " + v.size}
              onClick={() =>
                set(
                  "variants",
                  p.variants.filter((_, j) => j !== i),
                )
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <Field label="New size">
          <input
            value={size}
            onChange={(e) => setSize(e.target.value.toUpperCase())}
            maxLength={15}
            placeholder="e.g. XXL"
          />
        </Field>
        <button
          type="button"
          className="outline-button"
          onClick={() => {
            if (
              !/^[A-Z0-9-]+$/.test(size) ||
              p.variants.some((v) => v.size === size)
            ) {
              setError("Choose a unique size containing letters or numbers.");
              return;
            }
            set("variants", [
              ...p.variants,
              { size, stock: 0, low_stock_threshold: 3 },
            ]);
            setSize("");
          }}
        >
          ADD SIZE
        </button>
      </div>
      <h3>PRODUCT MEDIA</h3>
      <div className="upload-grid">
        {["front", "back", "detail"].map((v) => (
          <Upload
            key={v}
            label={v.toUpperCase() + " IMAGE"}
            value={p.images[v]}
            onError={setError}
            onChange={(url) =>
              setP((p) => ({ ...p, images: { ...p.images, [v]: url } }))
            }
          />
        ))}
      </div>
      <Message error={error} />
      <div className="editor-actions">
        <button className="dark-button" disabled={busy}>
          {busy ? "SAVING…" : "SAVE PRODUCT"} <ArrowUpRight size={18} />
        </button>
        <button type="button" className="outline-button" onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
function CollectionsAdmin() {
  const { refresh } = useStore(),
    [list, setList] = useState([]),
    [edit, setEdit] = useState({ name: "", description: "" }),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = () => api("/admin/collections").then(setList);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <h2>COLLECTIONS / DROPS.</h2>
      <Message error={error} message={message} />
      <form
        className="admin-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/admin/collections" + (edit.id ? "/" + edit.id : ""), {
              method: edit.id ? "PUT" : "POST",
              body: edit,
            });
            setEdit({ name: "", description: "" });
            setError("");
            setMessage("Collection saved.");
            await load();
            await refresh();
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <Field
          label="Collection name"
          required
          value={edit.name}
          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
        />
        <Field label="Description">
          <textarea
            value={edit.description}
            onChange={(e) => setEdit({ ...edit, description: e.target.value })}
          />
        </Field>
        <button className="dark-button">
          {edit.id ? "SAVE COLLECTION" : "ADD COLLECTION"} <Plus size={17} />
        </button>
        {edit.id && (
          <button
            className="outline-button"
            type="button"
            onClick={() => setEdit({ name: "", description: "" })}
          >
            CANCEL
          </button>
        )}
      </form>
      {list.map((c) => (
        <div key={c.id} className="collection-admin-row">
          <div>
            <h3>{c.name}</h3>
            <p>{c.description}</p>
          </div>
          <button className="underlined" onClick={() => setEdit(c)}>
            EDIT
          </button>
          <button
            className="underlined danger"
            onClick={async () => {
              if (!confirm("Delete this collection?")) return;
              try {
                await api("/admin/collections/" + c.id, {
                  method: "DELETE",
                  body: {},
                });
                await load();
                await refresh();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            DELETE
          </button>
        </div>
      ))}
    </>
  );
}
const newCoupon = () => ({
  code: "",
  type: "percent",
  value: 10,
  minimum: 0,
  maximum: null,
  expires_at: null,
  usage_limit: null,
  enabled: true,
  scope: "all",
  targets: [],
});
function CouponsAdmin() {
  const [list, setList] = useState([]),
    [edit, setEdit] = useState(null),
    [products, setProducts] = useState([]),
    [collections, setCollections] = useState([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const [c, p, d] = await Promise.all([
      api("/admin/coupons"),
      api("/admin/products"),
      api("/admin/collections"),
    ]);
    setList(c);
    setProducts(p);
    setCollections(d);
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const set = (k, v) => setEdit((e) => ({ ...e, [k]: v }));
  return (
    <>
      <div className="admin-section-title">
        <h2>GIVE A LITTLE.</h2>
        <button
          className="dark-button"
          onClick={() => {
            setEdit(newCoupon());
            setError("");
            setMessage("");
          }}
        >
          ADD COUPON <Plus size={18} />
        </button>
      </div>
      <Message error={error} message={message} />
      {edit ? (
        <form
          className="admin-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/admin/coupons" + (edit.id ? "/" + edit.id : ""), {
                method: edit.id ? "PUT" : "POST",
                body: edit,
              });
              setEdit(null);
              await load();
              setMessage("Coupon saved.");
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Field
              label="Code"
              required
              value={edit.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
            <Field label="Discount type">
              <select
                value={edit.type}
                onChange={(e) => {
                  set("type", e.target.value);
                  set("value", e.target.value === "percent" ? 10 : 10000);
                }}
              >
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed INR</option>
              </select>
            </Field>
            <Field
              label={
                edit.type === "percent"
                  ? "Percentage (1–100)"
                  : "Fixed discount (₹)"
              }
              type="number"
              required
              min={edit.type === "percent" ? 1 : 0.01}
              max={edit.type === "percent" ? 100 : 1000000}
              step={edit.type === "percent" ? 1 : 0.01}
              value={edit.type === "percent" ? edit.value : edit.value / 100}
              onChange={(e) =>
                set(
                  "value",
                  edit.type === "percent"
                    ? Number(e.target.value)
                    : paise(e.target.value),
                )
              }
            />
            <Field
              label="Minimum order (₹)"
              type="number"
              min="0"
              step="0.01"
              value={edit.minimum / 100}
              onChange={(e) => set("minimum", paise(e.target.value))}
            />
            <Field
              label="Maximum discount (₹, optional)"
              type="number"
              min="0"
              step="0.01"
              value={edit.maximum === null ? "" : edit.maximum / 100}
              onChange={(e) =>
                set(
                  "maximum",
                  e.target.value === "" ? null : paise(e.target.value),
                )
              }
            />
            <Field
              label="Expires (your local time)"
              type="datetime-local"
              value={localDate(edit.expires_at)}
              onChange={(e) => set("expires_at", isoDate(e.target.value))}
            />
            <Field
              label="Total usage limit (optional)"
              type="number"
              min="1"
              value={edit.usage_limit === null ? "" : edit.usage_limit}
              onChange={(e) =>
                set(
                  "usage_limit",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
            <Field label="Applies to">
              <select
                value={edit.scope}
                onChange={(e) => {
                  set("scope", e.target.value);
                  set("targets", []);
                }}
              >
                <option value="all">All products</option>
                <option value="products">Selected products</option>
                <option value="collections">Selected collections</option>
              </select>
            </Field>
          </div>
          {edit.scope !== "all" && (
            <fieldset className="target-options">
              <legend>ELIGIBLE {edit.scope.toUpperCase()}</legend>
              {(edit.scope === "products" ? products : collections).map((x) => (
                <label className="check-field" key={x.id}>
                  <input
                    type="checkbox"
                    checked={edit.targets.includes(x.id)}
                    onChange={(e) =>
                      set(
                        "targets",
                        e.target.checked
                          ? [...edit.targets, x.id]
                          : edit.targets.filter((id) => id !== x.id),
                      )
                    }
                  />
                  {x.name}
                </label>
              ))}
            </fieldset>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={edit.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            Enabled
          </label>
          <Message error={error} />
          <div className="editor-actions">
            <button className="dark-button" disabled={busy}>
              SAVE COUPON <ArrowUpRight size={18} />
            </button>
            <button
              className="outline-button"
              type="button"
              onClick={() => setEdit(null)}
            >
              CANCEL
            </button>
          </div>
        </form>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CODE</th>
                <th>DISCOUNT</th>
                <th>MINIMUM</th>
                <th>USES</th>
                <th>ENABLED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>
                    {c.type === "percent"
                      ? c.value + "%"
                      : money(c.value / 100)}
                  </td>
                  <td>{money(c.minimum / 100)}</td>
                  <td>
                    {c.used_count} / {c.usage_limit ?? "∞"}
                  </td>
                  <td>{c.enabled ? "YES" : "NO"}</td>
                  <td>
                    <button
                      className="underlined"
                      onClick={() => {
                        setEdit(c);
                        setError("");
                        setMessage("");
                      }}
                    >
                      EDIT
                    </button>
                    <button
                      className="underlined danger"
                      onClick={async () => {
                        try {
                          await api("/admin/coupons/" + c.id, {
                            method: "DELETE",
                            body: {},
                          });
                          await load();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      DISABLE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function OrdersAdmin() {
  const [list, setList] = useState([]),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => api("/admin/orders").then(setList);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="admin-section-title">
        <h2>THE ORDERS.</h2>
        <button
          className="outline-button"
          onClick={() => load().catch((e) => setError(e.message))}
        >
          REFRESH
        </button>
      </div>
      <Message error={error} message={message} />
      {selected ? (
        <form
          className="admin-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/admin/orders/" + selected.id, {
                method: "PUT",
                body: selected,
              });
              setSelected(null);
              await load();
              setMessage(
                "Order updated. Cancelled or returned stock is restored once.",
              );
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="admin-section-title">
            <h3>{selected.id}</h3>
            <button
              type="button"
              className="outline-button"
              onClick={() => setSelected(null)}
            >
              BACK
            </button>
          </div>
          <p className="muted">
            {selected.payment_status} / {money(selected.total / 100)}
          </p>
          <p className="address-block">
            {selected.address.name} / {selected.address.email} /{" "}
            {selected.address.phone}
            <br />
            {selected.address.address}, {selected.address.city},{" "}
            {selected.address.state}, {selected.address.pin}
          </p>
          {selected.items.map((i) => (
            <p key={i.id}>
              {i.sku} — {i.name} × {i.quantity} —{" "}
              {money((i.unit_price * i.quantity) / 100)}
            </p>
          ))}
          <div className="form-grid">
            <Field label="Order status">
              <select
                value={selected.status}
                onChange={(e) =>
                  setSelected({ ...selected, status: e.target.value })
                }
              >
                {[
                  "Pending",
                  "Confirmed",
                  "Packed",
                  "Shipped",
                  "Delivered",
                  "Cancelled",
                  "Returned",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            {[
              ["courier", "Courier name"],
              ["tracking_number", "Tracking number"],
              ["tracking_url", "Tracking URL (HTTPS)"],
            ].map(([key, label]) => (
              <Field
                key={key}
                label={label}
                type={key === "tracking_url" ? "url" : "text"}
                value={selected[key]}
                onChange={(e) =>
                  setSelected({ ...selected, [key]: e.target.value })
                }
              />
            ))}
          </div>
          <p className="muted">
            Status moves forward through Confirmed → Packed → Shipped →
            Delivered. Cancel before shipment, or mark shipped/delivered orders
            Returned. Cancellation and returns restore inventory once. All
            payments here are mock.
          </p>
          <Message error={error} />
          <button className="dark-button" disabled={busy}>
            SAVE ORDER <ArrowUpRight size={18} />
          </button>
        </form>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ORDER</th>
                <th>CUSTOMER</th>
                <th>STATUS</th>
                <th>TOTAL</th>
                <th>DATE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.id}
                    <small className="test-order-label">
                      TEST ORDER — {o.payment_status}
                    </small>
                  </td>
                  <td>{o.address.name}</td>
                  <td>{o.status}</td>
                  <td>{money(o.total / 100)}</td>
                  <td>
                    {new Date(o.created_at + "Z").toLocaleDateString("en-IN")}
                  </td>
                  <td>
                    <button
                      className="underlined"
                      onClick={() => {
                        setSelected(o);
                        setError("");
                        setMessage("");
                      }}
                    >
                      MANAGE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && (
            <p className="muted">
              No orders yet. Place a test order from the storefront.
            </p>
          )}
        </div>
      )}
    </>
  );
}
function SettingsAdmin() {
  const { refresh } = useStore(),
    [s, setS] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/admin/settings")
      .then(setS)
      .catch((e) => setError(e.message));
  }, []);
  if (!s) return <Message error={error} message="Loading settings…" />;
  return (
    <form
      className="admin-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("/admin/settings", { method: "PUT", body: s });
          await refresh();
          setMessage("Shipping, media and policy settings saved.");
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>MAKE IT YOURS.</h2>
      <h3>SHIPPING</h3>
      <div className="form-grid">
        <Field
          label="Flat shipping (₹)"
          type="number"
          required
          min="0"
          step="0.01"
          value={s.shipping.flat / 100}
          onChange={(e) =>
            setS({
              ...s,
              shipping: { ...s.shipping, flat: paise(e.target.value) },
            })
          }
        />
        <Field
          label="Free shipping threshold after discounts (₹)"
          type="number"
          required
          min="0"
          step="0.01"
          value={s.shipping.freeThreshold / 100}
          onChange={(e) =>
            setS({
              ...s,
              shipping: { ...s.shipping, freeThreshold: paise(e.target.value) },
            })
          }
        />
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={s.shipping.codEnabled}
          onChange={(e) =>
            setS({
              ...s,
              shipping: { ...s.shipping, codEnabled: e.target.checked },
            })
          }
        />
        Enable cash on delivery (test orders only)
      </label>
      <h3>CAMPAIGN MEDIA</h3>
      <div className="upload-grid">
        <Upload
          label="POSTER / FALLBACK IMAGE"
          value={s.campaign.poster}
          onError={setError}
          onChange={(url) =>
            setS((s) => ({ ...s, campaign: { ...s.campaign, poster: url } }))
          }
        />
        {["mp4", "webm"].map((type) => (
          <Upload
            key={type}
            label={type.toUpperCase() + " CAMPAIGN VIDEO"}
            value={s.campaign[type]}
            video
            onError={setError}
            onChange={(url) => {
              if (url && !url.endsWith("." + type)) {
                setError(
                  "Choose a " + type.toUpperCase() + " file for this slot.",
                );
                return;
              }
              setS((s) => ({ ...s, campaign: { ...s.campaign, [type]: url } }));
            }}
          />
        ))}
      </div>
      <h3>LOOKBOOK MEDIA</h3>
      <div className="upload-grid">
        {s.lookbook.map((url, i) => (
          <Upload
            key={i}
            label={"EDITORIAL IMAGE " + (i + 1)}
            value={url}
            onError={setError}
            onChange={(url) =>
              setS((s) => ({
                ...s,
                lookbook: s.lookbook.map((x, j) => (i === j ? url : x)),
              }))
            }
          />
        ))}
      </div>
      <h3>POLICIES / EDITABLE DRAFT COPY</h3>
      <p className="muted">
        Publish reviewed legal and business copy before enabling real orders.
        Plain text only.
      </p>
      {s.policies.map((p, i) => (
        <details className="policy-editor" key={p.slug}>
          <summary>
            {p.title}
            <Plus size={15} />
          </summary>
          <Field
            label="Page title"
            value={p.title}
            onChange={(e) =>
              setS({
                ...s,
                policies: s.policies.map((x, j) =>
                  i === j ? { ...x, title: e.target.value } : x,
                ),
              })
            }
          />
          <Field label="Policy copy">
            <textarea
              rows="10"
              value={p.body}
              onChange={(e) =>
                setS({
                  ...s,
                  policies: s.policies.map((x, j) =>
                    i === j ? { ...x, body: e.target.value } : x,
                  ),
                })
              }
            />
          </Field>
        </details>
      ))}
      <Message error={error} message={message} />
      <button className="dark-button" disabled={busy}>
        {busy ? "SAVING…" : "SAVE SETTINGS"} <ArrowUpRight size={18} />
      </button>
    </form>
  );
}
