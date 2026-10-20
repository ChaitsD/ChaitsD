import React, { useState, useEffect, useRef, useId } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Trash2 } from "lucide-react";
import { api } from "./api";
import { useStore, read } from "./store";
import { money } from "./data";
export function Field({ label, children, ...props }) {
  const id = useId();
  const control = children || <input {...props} />;
  return (
    <label className="field" htmlFor={id}>
      <span id={id + "-label"}>{label}</span>
      {React.cloneElement(control, { id, "aria-labelledby": id + "-label" })}
    </label>
  );
}
export function Message({ error, message }) {
  return error ? (
    <p className="feedback error" role="alert">
      {error}
    </p>
  ) : message ? (
    <p className="feedback" role="status">
      {message}
    </p>
  ) : null;
}
export const emptyAddress = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pin: "",
};
export function AddressFields({ value, onChange }) {
  return (
    <div className="form-grid">
      {[
        ["name", "Full name", "name"],
        ["phone", "Phone", "tel"],
        ["email", "Email", "email"],
        ["address", "Address", "street-address"],
        ["city", "City", "address-level2"],
        ["state", "State", "address-level1"],
        ["pin", "PIN code", "postal-code"],
      ].map(([key, label, auto]) => (
        <Field
          key={key}
          label={label}
          required
          value={value[key]}
          type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
          autoComplete={auto}
          maxLength={key === "address" ? 500 : 150}
          pattern={
            key === "phone"
              ? "[6-9][0-9]{9}"
              : key === "pin"
                ? "[1-9][0-9]{5}"
                : undefined
          }
          inputMode={["phone", "pin"].includes(key) ? "numeric" : undefined}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      ))}
    </div>
  );
}
function Totals({ quote: q }) {
  return (
    <div className="checkout-totals">
      {[
        ["Subtotal", q.subtotal],
        ["Coupon discount", -q.discount],
        ["Shipping", q.shipping],
        ["Total", q.total],
      ].map(([label, val]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{money(val / 100)}</strong>
        </div>
      ))}
    </div>
  );
}
export function CouponEntry() {
  const { cart, coupon, setCoupon } = useStore();
  const [value, setValue] = useState(coupon),
    [error, setError] = useState("");
  useEffect(() => setValue(coupon), [coupon]);
  return (
    <section className="cart-coupon">
      <form
        className="coupon-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await api("/checkout/quote", {
              method: "POST",
              body: { items: cart, coupon: value.trim() },
            });
            setCoupon(value.trim());
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <Field label="Coupon code">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={40}
            placeholder="MAYGREY10"
          />
        </Field>
        <button className="outline-button">APPLY</button>
      </form>
      {coupon && (
        <p className="coupon-applied">
          {coupon} applied{" "}
          <button
            onClick={() => {
              setCoupon("");
              setError("");
            }}
          >
            REMOVE
          </button>
        </p>
      )}
      <Message error={error} />
    </section>
  );
}
export function Checkout() {
  const {
      cart,
      setCart,
      user,
      refresh,
      products,
      coupon: applied,
      setCoupon: setApplied,
    } = useStore(),
    navigate = useNavigate();
  const [address, setAddress] = useState({
      ...emptyAddress,
      name: user?.name || "",
      email: user?.email || "",
    }),
    [addresses, setAddresses] = useState([]),
    [saveAddress, setSaveAddress] = useState(false),
    [coupon, setCoupon] = useState(applied),
    [q, setQ] = useState(null),
    [quoteError, setQuoteError] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [payment, setPayment] = useState("mock"),
    [mockResult, setMockResult] = useState("success"),
    [accepted, setAccepted] = useState(false);
  const request = useRef(
    (() => {
      try {
        return (
          JSON.parse(sessionStorage.getItem("mg-checkout-request")) || {
            key: crypto.randomUUID(),
            hash: "",
          }
        );
      } catch {
        return { key: crypto.randomUUID(), hash: "" };
      }
    })(),
  );
  useEffect(() => {
    if (user?.role === "customer")
      api("/account")
        .then((a) => setAddresses(a.addresses))
        .catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    let valid = true;
    setQ(null);
    if (!cart.length) {
      setQuoteError("");
      return;
    }
    api("/checkout/quote", {
      method: "POST",
      body: { items: cart, coupon: applied },
    })
      .then((q) => {
        if (valid) {
          setQ(q);
          setQuoteError("");
        }
      })
      .catch((e) => valid && setQuoteError(e.message));
    return () => {
      valid = false;
    };
  }, [cart, applied, products]);
  async function apply(e) {
    e.preventDefault();
    setError("");
    try {
      const quote = await api("/checkout/quote", {
        method: "POST",
        body: { items: cart, coupon: coupon.trim() },
      });
      setApplied(coupon.trim());
      setQ(quote);
    } catch (e) {
      setError(e.message);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (!accepted) return;
    setBusy(true);
    setError("");
    const body = {
      items: cart,
      coupon: applied,
      address,
      paymentMethod: payment,
      mockResult,
      expectedTotal: q?.total,
    };
    try {
      const serialized = JSON.stringify(body);
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(serialized),
          ),
        ),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (request.current.hash !== hash)
        request.current = { key: crypto.randomUUID(), hash };
      sessionStorage.setItem(
        "mg-checkout-request",
        JSON.stringify(request.current),
      );
      const result = await api("/checkout", {
        method: "POST",
        headers: { "Idempotency-Key": request.current.key },
        body,
      });
      localStorage.setItem("mg-order-" + result.order.id, result.accessToken);
      setCart([]);
      setApplied("");
      sessionStorage.removeItem("mg-checkout-request");
      if (saveAddress && user?.role === "customer")
        await api("/account/addresses", {
          method: "POST",
          body: address,
        }).catch(() => {});
      await refresh().catch(() => {});
      navigate("/orders/" + result.order.id, { replace: true });
    } catch (e) {
      setError(e.message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length)
    return (
      <main className="empty section-pad">
        <h1>YOUR BAG IS EMPTY.</h1>
        <Link className="dark-button" to="/shop">
          FIND YOUR PIECE <ArrowRight size={18} />
        </Link>
      </main>
    );
  return (
    <main className="commerce-page section-pad">
      <div className="eyebrow">YOUR NEXT CHAPTER / TEST CHECKOUT</div>
      <h1>MAKE IT YOURS.</h1>
      <div className="test-banner">
        TEST / MOCK PAYMENT MODE — No real charge. Do not enter card or UPI
        details.
      </div>
      <div className="checkout-layout">
        <section>
          <h2>01 / YOUR DETAILS</h2>
          {!user && (
            <p className="muted">
              Guest checkout is available. <Link to="/account">Sign in</Link>{" "}
              for saved addresses and order history.
            </p>
          )}
          {addresses.length > 0 && (
            <Field label="Use a saved address">
              <select
                defaultValue=""
                onChange={(e) => {
                  const a = addresses.find((x) => x.id === e.target.value);
                  if (a) setAddress(a.data);
                }}
              >
                <option value="">Enter a new address</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.data.name} — {a.data.address}, {a.data.city}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <form onSubmit={submit}>
            <AddressFields value={address} onChange={setAddress} />
            {user?.role === "customer" && (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(e) => setSaveAddress(e.target.checked)}
                />
                Save this address to my account
              </label>
            )}
            <h2>02 / PAYMENT — TEST ONLY</h2>
            <Field label="Payment method">
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              >
                <option value="mock">Mock payment — no charge</option>
                {q?.codEnabled && (
                  <option value="cod">Cash on delivery — test order</option>
                )}
              </select>
            </Field>
            <Field label="Simulate payment result">
              <select
                value={mockResult}
                onChange={(e) => setMockResult(e.target.value)}
              >
                <option value="success">Successful test payment</option>
                <option value="failure">Failed test payment</option>
              </select>
            </Field>
            <label className="check-field">
              <input
                required
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                I understand this is a test order and accept the{" "}
                <Link to="/terms-conditions">draft terms</Link> and{" "}
                <Link to="/privacy-policy">privacy policy</Link>.
              </span>
            </label>
            <Message error={error || quoteError} />
            <button className="dark-button" disabled={busy || !q || !accepted}>
              {busy ? "PLACING TEST ORDER…" : "PLACE TEST ORDER"}{" "}
              <ArrowUpRight size={18} />
            </button>
          </form>
        </section>
        <aside className="order-summary">
          <div className="eyebrow">YOUR SELECTION / LIVE SERVER PRICES</div>
          {q?.lines.map((l) => (
            <div className="summary-line" key={l.variant_id}>
              <div>
                <strong>{l.name}</strong>
                <small>
                  {l.color} / {l.size} / QTY {l.quantity}
                </small>
              </div>
              <span>{money((l.unit_price * l.quantity) / 100)}</span>
            </div>
          ))}
          <form className="coupon-form" onSubmit={apply}>
            <Field label="Coupon code">
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="MAYGREY10"
                maxLength={40}
              />
            </Field>
            <button className="outline-button">APPLY</button>
          </form>
          {applied && (
            <p className="coupon-applied">
              {applied} applied{" "}
              <button
                onClick={() => {
                  setApplied("");
                  setCoupon("");
                }}
              >
                REMOVE
              </button>
            </p>
          )}
          {q && <Totals quote={q} />}
          <p className="muted">
            Prices, stock and coupon usage are revalidated when your order is
            placed. Shipping is calculated after discounts.
          </p>
          <Link className="text-link" to="/cart">
            EDIT BAG <ArrowRight size={16} />
          </Link>
        </aside>
      </div>
    </main>
  );
}
export function OrderConfirmation() {
  const { id } = useParams(),
    [order, setOrder] = useState(null),
    [error, setError] = useState("");
  const load = () =>
    api("/orders/" + id, {
      headers: {
        "X-Order-Token": localStorage.getItem("mg-order-" + id) || "",
      },
    })
      .then((o) => {
        setOrder(o);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);
  return (
    <main className="commerce-page section-pad">
      <div className="eyebrow">YOUR NEXT CHAPTER / ORDER CONFIRMATION</div>
      <h1>{order ? "YOU’RE IN." : "YOUR ORDER."}</h1>
      <Message error={error} />
      {order ? (
        <>
          <div className="test-banner">
            TEST ORDER —{" "}
            {order.payment_status.replaceAll("_", " ").toUpperCase()}. No real
            payment collected.
          </div>
          <div className="order-header">
            <div>
              <small>ORDER ID</small>
              <strong>{order.id}</strong>
            </div>
            <span className="status-badge">{order.status}</span>
          </div>
          <div className="checkout-layout">
            <section>
              {order.items.map((i) => (
                <div className="summary-line" key={i.id}>
                  <div>
                    <strong>{i.name}</strong>
                    <small>
                      {i.color} / {i.size} / QTY {i.quantity}
                    </small>
                  </div>
                  <span>{money((i.unit_price * i.quantity) / 100)}</span>
                </div>
              ))}
              <Totals quote={order} />
              <h2>SHIPPING TO</h2>
              <p className="address-block">
                {order.address.name}
                <br />
                {order.address.address}
                <br />
                {order.address.city}, {order.address.state} —{" "}
                {order.address.pin}
              </p>
              {order.courier && <p>Courier: {order.courier}</p>}
              {order.tracking_number && (
                <p>Tracking: {order.tracking_number}</p>
              )}
              {order.tracking_url && (
                <a
                  className="text-link"
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  TRACK SHIPMENT ↗
                </a>
              )}
            </section>
            <aside>
              <p className="muted">
                Guest? Keep this confirmation on this device. Access is
                protected by a private token stored in your browser. Signed-in
                customers can also find orders in their account.
              </p>
              <button className="outline-button" onClick={load}>
                REFRESH STATUS
              </button>
              <Link className="dark-button" to="/shop">
                KEEP EXPLORING <ArrowUpRight size={18} />
              </Link>
            </aside>
          </div>
        </>
      ) : (
        !error && <p>Loading your order…</p>
      )}
    </main>
  );
}
export function Account({ mode }) {
  const { user, setUser, logout, wishlist } = useStore(),
    navigate = useNavigate(),
    location = useLocation();
  const [signup, setSignup] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [pw, setPw] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [data, setData] = useState(null),
    [address, setAddress] = useState(emptyAddress);
  const load = () =>
    api("/account")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    setError("");
    setMessage("");
    if (user?.role === "customer" && !mode) load();
  }, [user, mode]);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const r = await api("/auth/forgot-password", {
          method: "POST",
          body: { email },
        });
        setMessage(r.message);
      } else if (mode === "reset") {
        await api("/auth/reset-password", {
          method: "POST",
          body: {
            password: pw,
            token: new URLSearchParams(location.search).get("token"),
          },
        });
        setMessage("Password updated. You can now sign in.");
        setUser(null);
      } else {
        const r = await api("/auth/" + (signup ? "signup" : "login"), {
          method: "POST",
          body: { name, email, password: pw },
        });
        setUser(r.user);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (user && !mode)
    return (
      <main className="commerce-page section-pad">
        <div className="eyebrow">YOUR SPACE / {user.role}</div>
        <h1>HEY, {user.name.split(" ")[0].toUpperCase()}.</h1>
        <div className="account-actions">
          <button
            className="outline-button"
            onClick={async () => {
              try {
                await logout();
                setData(null);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            SIGN OUT
          </button>
          <Link className="text-link" to="/shop?saved=1">
            WISHLIST ({wishlist.length}) ↗
          </Link>
          {user.role === "admin" && (
            <Link className="dark-button" to="/admin">
              ADMIN DASHBOARD ↗
            </Link>
          )}
        </div>
        <Message error={error} />
        {data && (
          <>
            <section className="account-section">
              <h2>YOUR ORDERS</h2>
              {!data.orders.length ? (
                <p className="muted">
                  Your next chapter starts with your first order.
                </p>
              ) : (
                data.orders.map((o) => (
                  <Link
                    className="account-order"
                    to={"/orders/" + o.id}
                    key={o.id}
                  >
                    <div>
                      <strong>{o.id}</strong>
                      <small className="test-order-label">
                        TEST ORDER — NO REAL PAYMENT
                      </small>
                      <small>
                        {new Date(o.created_at + "Z").toLocaleDateString(
                          "en-IN",
                        )}
                      </small>
                    </div>
                    <span>{o.status}</span>
                    <strong>{money(o.total / 100)} ↗</strong>
                  </Link>
                ))
              )}
            </section>
            <section className="account-section">
              <h2>SAVED ADDRESSES</h2>
              <div className="address-grid">
                {data.addresses.map((a) => (
                  <div key={a.id}>
                    <p>
                      {a.data.name}
                      <br />
                      {a.data.address}
                      <br />
                      {a.data.city}, {a.data.state} {a.data.pin}
                    </p>
                    <button
                      className="underlined"
                      onClick={async () => {
                        try {
                          await api("/account/addresses/" + a.id, {
                            method: "DELETE",
                            body: {},
                          });
                          load();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      REMOVE
                    </button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api("/account/addresses", {
                      method: "POST",
                      body: address,
                    });
                    setAddress(emptyAddress);
                    load();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <h3>ADD AN ADDRESS</h3>
                <AddressFields value={address} onChange={setAddress} />
                <button className="dark-button">
                  SAVE ADDRESS <ArrowRight size={18} />
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    );
  return (
    <main className="auth-page section-pad">
      <div className="eyebrow">YOUR SPACE IN THE IN-BETWEEN</div>
      <h1>
        {mode === "forgot"
          ? "FIND YOUR WAY BACK."
          : mode === "reset"
            ? "A FRESH START."
            : signup
              ? "COME AS YOU ARE."
              : "WELCOME BACK."}
      </h1>
      <form onSubmit={submit}>
        {signup && !mode && (
          <Field
            label="Full name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        {mode !== "reset" && (
          <Field
            label="Email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        )}
        {mode !== "forgot" && (
          <Field
            label={
              signup || mode === "reset"
                ? "Password (12+ characters)"
                : "Password"
            }
            type="password"
            required
            minLength={signup || mode === "reset" ? 12 : 1}
            maxLength={128}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete={
              signup || mode === "reset" ? "new-password" : "current-password"
            }
          />
        )}
        <Message error={error} message={message} />
        <button className="dark-button" disabled={busy}>
          {busy
            ? "PLEASE WAIT…"
            : mode === "forgot"
              ? "REQUEST RESET"
              : mode === "reset"
                ? "RESET PASSWORD"
                : signup
                  ? "CREATE ACCOUNT"
                  : "SIGN IN"}{" "}
          <ArrowUpRight size={18} />
        </button>
      </form>
      {!mode && (
        <>
          <button
            className="underlined auth-switch"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup
              ? "ALREADY HAVE AN ACCOUNT? SIGN IN"
              : "NEW HERE? CREATE AN ACCOUNT"}
          </button>
          <Link className="underlined" to="/forgot-password">
            FORGOT PASSWORD?
          </Link>
        </>
      )}
      <Link className="text-link" to={mode ? "/account" : "/shop"}>
        {mode ? "BACK TO SIGN IN" : "CONTINUE AS GUEST"} ↗
      </Link>
    </main>
  );
}
export function PolicyPage({ slug }) {
  const { policies } = useStore(),
    p = policies.find((x) => x.slug === slug);
  return (
    <main className="policy-page section-pad">
      <div className="eyebrow">MAYGREY / THE DETAILS</div>
      <h1>{p?.title.toUpperCase()}</h1>
      <div className="policy-body">{p?.body}</div>
      <Link className="text-link" to="/shop">
        BACK TO THE COLLECTION ↗
      </Link>
    </main>
  );
}
