import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import React, { useEffect, useState, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Minus,
  X,
  Menu,
  ShoppingBag,
  Heart,
  ChevronDown,
  Check,
} from "lucide-react";
import { money, productImage } from "./data";
import { Provider, useStore } from "./store";
import Price from "./Price";
import BrandLogo from "./BrandLogo";
import { api } from "./api";
import {
  CouponEntry,
  Checkout,
  OrderConfirmation,
  Account,
  PolicyPage,
} from "./Commerce";
import Admin from "./Admin";
import "./commerce.css";
import "./styles.css";
function Scroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title =
      "MAYGREY — " +
      (pathname === "/"
        ? "SOMEWHERE BETWEEN."
        : pathname.split("/")[1].toUpperCase());
  }, [pathname]);
  return null;
}
function Header() {
  const { cart, setOpen } = useStore(),
    [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenu(false), [pathname]);
  return (
    <>
      <div className="announcement">
        INDEPENDENT BY DESIGN. <span>UNDEFINED BY NATURE.</span>
        <span className="announcement-right">DROP 001 / NOW LIVE ↗</span>
      </div>
      <header>
        <BrandLogo placement="header" />
        <nav
          className={menu ? "navigation mobile-open" : "navigation"}
          aria-label="Main navigation"
        >
          {[
            ["/shop", "SHOP"],
            ["/lookbook", "LOOKBOOK"],
            ["/about", "THE IN-BETWEEN"],
          ].map(([url, name]) => (
            <Link
              className={pathname === url ? "active" : ""}
              key={url}
              to={url}
            >
              {name}
            </Link>
          ))}
        </nav>
        <div className="nav-tools">
          <Link className="account-link" to="/account">
            ACCOUNT
          </Link>
          <span className="region">IND / ₹</span>
          <button
            className="bag"
            onClick={() => setOpen(true)}
            aria-label="Open shopping bag"
          >
            BAG <span>({cart.reduce((s, x) => s + x.qty, 0)})</span>
            <ShoppingBag size={16} />
          </button>
          <button
            className="mobile-toggle"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
    </>
  );
}
function Campaign({ className = "" }) {
  const { media } = useStore();
  return (
    <div className={"campaign " + className}>
      {media.campaign.mp4 || media.campaign.webm ? (
        <video autoPlay muted loop playsInline poster={media.campaign.poster}>
          {media.campaign.webm && (
            <source src={media.campaign.webm} type="video/webm" />
          )}
          {media.campaign.mp4 && (
            <source src={media.campaign.mp4} type="video/mp4" />
          )}
        </video>
      ) : (
        <img src={media.campaign.poster} alt="MAYGREY campaign editorial" />
      )}
      {media.campaign.poster?.includes("placeholder") &&
        !media.campaign.mp4 &&
        !media.campaign.webm && (
          <span className="media-label">CAMPAIGN MEDIA / PLACEHOLDER</span>
        )}
    </div>
  );
}
function Home() {
  const { products, media } = useStore();
  return (
    <>
      <section className="hero">
        <Campaign />
        <div className="hero-top">
          <span>EST. IN THE IN-BETWEEN</span>
          <span>001 — 2026</span>
        </div>
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="red-dot" /> A NEW STATE OF BEING
          </div>
          <h1>
            SOMEWHERE
            <br />
            <span>BETWEEN.</span>
          </h1>
          <div className="hero-bottom">
            <p>
              Not black. Not white.
              <br />
              Everything in between.
            </p>
            <Link className="light-button" to="/shop">
              EXPLORE DROP 001 <ArrowUpRight size={20} />
            </Link>
          </div>
        </div>
        <div className="hero-side">MAYGREY — AN INDEPENDENT EXPRESSION</div>
        <span className="hero-coordinate">19°07′ N &nbsp; 72°52′ E</span>
      </section>
      <div className="ticker">
        <span>NO FIXED IDENTITY</span>
        <span>✦</span>
        <span>MADE FOR THE IN-BETWEEN</span>
        <span>✦</span>
        <span>WEAR YOUR CONTRADICTIONS</span>
        <span>✦</span>
        <span>NO FIXED IDENTITY</span>
        <span>✦</span>
      </div>
      <section className="collection section-pad">
        <div className="section-heading">
          <div>
            <div className="eyebrow">THE FIRST CHAPTER / 001</div>
            <h2>
              NOT QUITE ANYTHING.
              <br />A LITTLE OF EVERYTHING.
            </h2>
          </div>
          <Link className="text-link" to="/shop">
            SHOP THE DROP <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="product-grid">
          {products
            .filter((p) => p.featured)
            .map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
        </div>
        <div className="collection-note">
          <span>DROP 001 — SOMEWHERE BETWEEN</span>
          <span>4 EXPRESSIONS. ONE STATE OF MIND.</span>
        </div>
      </section>
      <section className="manifesto">
        <div className="orbit">
          ✦<span>THERE IS NO STRAIGHT LINE</span>
        </div>
        <div>
          <div className="eyebrow">A NOTE FROM THE IN-BETWEEN</div>
          <h2>
            YOU DON’T HAVE TO
            <br />
            FIT THE <i>FRAME.</i>
          </h2>
          <p>
            For the versions of you that don’t have a name yet.
            <br />
            We make clothes for the space between who you were
            <br />
            and who you’re becoming.
          </p>
          <Link className="text-link" to="/about">
            THIS IS MAYGREY <ArrowUpRight size={18} />
          </Link>
        </div>
        <span className="manifesto-index">[ MG / 001 ]</span>
      </section>
      <section className="editorial section-pad">
        <div className="section-heading">
          <div>
            <div className="eyebrow">FIELD NOTES / VOL. 01</div>
            <h2>
              OUT OF PLACE.
              <br />
              RIGHT WHERE WE BELONG.
            </h2>
          </div>
          <Link className="text-link" to="/lookbook">
            VIEW LOOKBOOK <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="editorial-grid">
          {media.lookbook.slice(0, 2).map((src, i) => (
            <Link to="/lookbook" className="editorial-image" key={src}>
              <img
                src={src}
                alt={`Editorial placeholder ${i + 1}: brutalist streetwear study`}
              />
              <span>
                0{i + 1} / BETWEEN STRUCTURES <ArrowUpRight size={19} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
function ProductCard({ product: p }) {
  const { wishlist, wish } = useStore();
  return (
    <article className="product-card">
      <div className="product-visual">
        <Link to={"/product/" + p.id}>
          <img
            src={productImage(p)}
            alt={`${p.name} front — placeholder garment illustration`}
            loading="lazy"
          />
        </Link>
        <span className="product-code">
          {p.code} /{" "}
          {p.status === "sold_out" || p.stock === 0
            ? "SOLD OUT"
            : p.variants.some(
                  (v) => v.stock > 0 && v.stock <= v.low_stock_threshold,
                )
              ? "LOW STOCK"
              : "DROP 001"}
        </span>
        <button
          className={wishlist.includes(p.id) ? "wish selected" : "wish"}
          onClick={() => wish(p.id)}
          aria-label={`${wishlist.includes(p.id) ? "Remove" : "Save"} ${p.name} ${wishlist.includes(p.id) ? "from" : "to"} wishlist`}
        >
          <Heart
            size={18}
            fill={wishlist.includes(p.id) ? "currentColor" : "none"}
          />
        </button>
        {productImage(p).startsWith("/media/") && (
          <span className="placeholder-tag">CONCEPT / PLACEHOLDER</span>
        )}
        <Link className="quick-shop" to={"/product/" + p.id}>
          DISCOVER PIECE <Plus size={16} />
        </Link>
      </div>
      <Link className="product-info" to={"/product/" + p.id}>
        <h3>{p.name}</h3>
        <Price product={p} />
      </Link>
      <p className="product-meta">
        <span className="swatch" style={{ background: p.tone }} />
        {p.color} / Oversized tee
      </p>
    </article>
  );
}
function Shop() {
  const location = useLocation();
  const [filter, setFilter] = useState(
    new URLSearchParams(location.search).has("saved") ? "wishlist" : "all",
  );
  useEffect(() => {
    setFilter(
      new URLSearchParams(location.search).has("saved") ? "wishlist" : "all",
    );
  }, [location.search]);
  const [sort, setSort] = useState("featured");
  const { wishlist, products } = useStore();
  let list = products.filter(
    (p) => filter !== "wishlist" || wishlist.includes(p.id),
  );
  if (sort === "low") list = [...list].sort((a, b) => a.price - b.price);
  if (sort === "high") list = [...list].sort((a, b) => b.price - a.price);
  return (
    <main className="section-pad shop">
      <div className="page-heading">
        <div className="eyebrow">COLLECTION 001 / FOUR EXPRESSIONS</div>
        <h1>
          THE IN-BETWEEN
          <br />
          <span>IS YOURS.</span>
        </h1>
        <p>
          DROP 001 — SOMEWHERE BETWEEN.
          <br />
          Everyday silhouettes. Unresolved ideas.
        </p>
      </div>
      <div className="shop-toolbar">
        <div>
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            ALL PIECES ({products.length})
          </button>
          <button
            className={filter === "wishlist" ? "active" : ""}
            onClick={() => setFilter("wishlist")}
          >
            SAVED ({wishlist.length})
          </button>
        </div>
        <label>
          SORT BY{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="featured">Featured</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
        </label>
      </div>
      <div className="product-grid">
        {list.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {!list.length && (
        <div className="empty">
          <Heart />
          <h2>NOTHING SAVED. YET.</h2>
          <p>Tap a heart on any piece to keep it here.</p>
          <button className="dark-button" onClick={() => setFilter("all")}>
            EXPLORE THE DROP <ArrowRight size={18} />
          </button>
        </div>
      )}
    </main>
  );
}
function Product() {
  const { products, collections } = useStore();
  const location = useLocation(),
    p = products.find((x) => x.id === location.pathname.split("/").pop());
  const [size, setSize] = useState(""),
    [qty, setQty] = useState(1),
    [view, setView] = useState("front"),
    [error, setError] = useState(""),
    [guide, setGuide] = useState(false);
  const { add, wishlist, wish, setOpen } = useStore();
  const navigate = useNavigate();
  useEffect(() => {
    setSize("");
    setQty(1);
    setView("front");
    setError("");
  }, [p?.id]);
  if (!p) return <NotFound />;
  function purchase(buy) {
    if (!size) {
      setError("Choose your size to continue.");
      return;
    }
    try {
      add(p.id, size, qty);
    } catch (e) {
      setError(e.message);
      return;
    }
    setError("");
    if (buy) {
      setOpen(false);
      navigate("/checkout");
    }
  }
  return (
    <main>
      <div className="breadcrumb">
        <Link to="/shop">SHOP</Link> / DROP 001 / {p.code}
      </div>
      <section className="product-detail">
        <div className="gallery">
          <div className="main-image">
            <img
              src={productImage(p, view)}
              alt={`${p.name} ${view} — placeholder artwork`}
            />
            <span className="product-code">
              {p.code} / {view.toUpperCase()} VIEW
            </span>
            {productImage(p, view).startsWith("/media/") && (
              <span className="placeholder-tag">
                PLACEHOLDER — FINAL ARTWORK TO FOLLOW
              </span>
            )}
          </div>
          <div className="thumbnails">
            {["front", "back", "detail"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={view === v ? "selected" : ""}
                aria-label={`View ${v}`}
              >
                <img src={productImage(p, v)} alt={`${v} placeholder`} />
                <span>{v}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="product-description">
          <div className="eyebrow">
            {collections.find((c) => c.id === p.collection_id)?.name ||
              "MAYGREY / INDEPENDENT EXPRESSION"}
          </div>
          <h1>{p.name.toUpperCase()}</h1>
          <div className="price">
            <Price product={p} /> <small>INCLUSIVE OF ALL TAXES</small>
          </div>
          <p>{p.description}</p>
          <div className="color-description">
            <span className="swatch" style={{ background: p.tone }} />{" "}
            {p.color.toUpperCase()}
          </div>
          <div className="size-heading">
            <span>SELECT SIZE {size && `/ ${size}`}</span>
            <button className="underlined" onClick={() => setGuide(true)}>
              SIZE GUIDE ↗
            </button>
          </div>
          <div className="sizes">
            {p.variants.map((variant) => {
              const s = variant.size;
              return (
                <button
                  key={s}
                  className={size === s ? "selected" : ""}
                  disabled={variant.stock === 0 || p.status !== "active"}
                  onClick={() => {
                    setSize(s);
                    setError("");
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <p className="stock-status">
            {p.status === "sold_out" || !p.stock
              ? "SOLD OUT"
              : size &&
                  p.variants.find((v) => v.size === size)?.stock <=
                    p.variants.find((v) => v.size === size)?.low_stock_threshold
                ? "LOW STOCK — " +
                  p.variants.find((v) => v.size === size).stock +
                  " LEFT"
                : "IN STOCK"}
          </p>
          <div className="form-error" role="alert">
            {error}
          </div>
          <div className="purchase-row">
            <Quantity qty={qty} onChange={setQty} />
            <button
              className="dark-button"
              disabled={p.status !== "active" || !p.stock}
              onClick={() => purchase(false)}
            >
              ADD TO BAG <Plus size={18} />
            </button>
            <button
              className="wishlist-button"
              onClick={() => wish(p.id)}
              aria-label="Toggle wishlist"
            >
              <Heart
                size={20}
                fill={wishlist.includes(p.id) ? "currentColor" : "none"}
              />
            </button>
          </div>
          <button
            className="buy-now"
            disabled={p.status !== "active" || !p.stock}
            onClick={() => purchase(true)}
          >
            BUY NOW <ArrowUpRight size={17} />
          </button>
          <div className="purchase-note">
            TEST CHECKOUT IS OPEN. NO REAL PAYMENT WILL BE TAKEN.
          </div>
          {[
            ["THE DETAILS", p.description],
            ["FABRIC & FIT", `${p.fabric}. ${p.gsm} GSM. ${p.fit}.`],
            ["CARE", p.care],
            [
              "SHIPPING & RETURNS",
              "See Shipping Policy and Returns & Exchange in the footer for the current draft terms. Checkout operates in test payment mode.",
            ],
          ].map(([title, text]) => (
            <details key={title}>
              <summary>
                {title}
                <Plus size={15} />
              </summary>
              <p>{text}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="section-pad">
        <div className="section-heading">
          <h2>ALSO IN THE IN-BETWEEN.</h2>
          <Link className="text-link" to="/shop">
            VIEW ALL <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="product-grid related">
          {products
            .filter((x) => x.id !== p.id)
            .map((x) => (
              <ProductCard key={x.id} product={x} />
            ))}
        </div>
      </section>
      {guide && (
        <div className="modal-backdrop" onClick={() => setGuide(false)}>
          <section
            className="size-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Size guide"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close size guide"
              onClick={() => setGuide(false)}
            >
              <X />
            </button>
            <div className="eyebrow">FIND YOUR FIT</div>
            <h2>ROOM TO BE YOU.</h2>
            <p>
              Provisional oversized measurements in inches. Final garment
              measurements will be confirmed before launch.
            </p>
            <table>
              <thead>
                <tr>
                  <th>SIZE</th>
                  <th>CHEST</th>
                  <th>LENGTH</th>
                </tr>
              </thead>
              <tbody>
                {p.variants.map(({ size: s }, i) => (
                  <tr key={s}>
                    <td>{s}</td>
                    <td>{42 + i * 2}</td>
                    <td>{27 + i}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </main>
  );
}
function Quantity({ qty, onChange }) {
  return (
    <div className="quantity">
      <button
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, qty - 1))}
        disabled={qty <= 1}
      >
        <Minus size={14} />
      </button>
      <span>{qty}</span>
      <button aria-label="Increase quantity" onClick={() => onChange(qty + 1)}>
        <Plus size={14} />
      </button>
    </div>
  );
}
function About() {
  const { media } = useStore();
  return (
    <main>
      <section className="about-hero section-pad">
        <div className="eyebrow">THIS IS MAYGREY / EST. 2026</div>
        <h1>
          NEVER ONE THING.
          <br />
          ALWAYS <i>BECOMING.</i>
        </h1>
        <div className="about-intro">
          <span className="large-star">✦</span>
          <p>
            Black and white have their answers.
            <br />
            We’re here for the questions.
          </p>
        </div>
      </section>
      <section className="about-body">
        <img
          src={media.lookbook[2]}
          alt="Placeholder concrete architecture and streetwear silhouette"
        />
        <div>
          <div className="eyebrow">SOMEWHERE BETWEEN.</div>
          <h2>
            THERE’S A SPACE
            <br />
            THAT’S ONLY YOURS.
          </h2>
          <p>
            Between chaos and calm. Between the past you carry and the future
            you can almost see. Between who you were and who you’re becoming.
          </p>
          <p>
            MAYGREY lives there. An independent streetwear label for people who
            won’t be reduced to a single definition. We work with familiar
            shapes and unfamiliar perspectives. Pieces that feel lived in, even
            on day one.
          </p>
          <p>No fixed identity. No perfect version. Just room to become.</p>
          <Link className="text-link" to="/shop">
            FIND YOUR IN-BETWEEN <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <div className="about-values section-pad">
        {[
          [
            "01",
            "CONTRADICTION",
            "Soft edges. Strong opinions. We make room for both.",
          ],
          [
            "02",
            "EXPRESSION",
            "Wear what feels like you. Even when that changes.",
          ],
          ["03", "EVOLUTION", "Never finished. Never fixed. Always in motion."],
        ].map(([n, t, p]) => (
          <div key={n}>
            <span>{n} /</span>
            <h3>{t}</h3>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
function Lookbook() {
  const { products, media } = useStore();
  return (
    <main className="lookbook section-pad">
      <div className="page-heading">
        <div className="eyebrow">FIELD NOTES / VOL. 01 — 2026</div>
        <h1>
          BETWEEN
          <br />
          <span>STRUCTURES.</span>
        </h1>
        <div className="lookbook-sub">
          <p>
            A visual study in finding your place.
            <br />
            DROP 001 — SOMEWHERE BETWEEN.
          </p>
          <span>CONCEPT EDITORIAL / PLACEHOLDER MEDIA</span>
        </div>
      </div>
      <div className="lookbook-grid">
        {[...media.lookbook, media.campaign.poster].map((src, i) => (
          <figure key={i}>
            <img
              src={src}
              alt={`Editorial placeholder ${i + 1} — monochrome architecture and oversized silhouette`}
            />
            <figcaption>
              <span>
                FIG. 0{i + 1} /{" "}
                {
                  [
                    "STILL IN MOTION",
                    "AFTER THE NOISE",
                    "UNDEFINED SPACE",
                    "A NEW STATE",
                  ][i]
                }
              </span>
              <Link
                to={"/product/" + (products[i]?.id || products[0]?.id || "")}
              >
                SHOP THE LOOK <ArrowUpRight size={16} />
              </Link>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="lookbook-end">
        <span>END OF FIELD NOTES / VOL. 01</span>
        <h2>TAKE UP SPACE.</h2>
        <Link className="dark-button" to="/shop">
          EXPLORE DROP 001 <ArrowUpRight size={18} />
        </Link>
      </div>
    </main>
  );
}
function CartItems({ quote }) {
  const { cart, update, setOpen, products } = useStore();
  return (
    <div className="cart-items">
      {cart.map((item) => {
        const p = products.find((p) => p.id === item.id);
        if (!p)
          return (
            <div className="cart-item" key={item.id + item.size}>
              <div>
                <h3>Unavailable product</h3>
                <p>This piece is no longer available.</p>
                <button
                  className="underlined"
                  onClick={() => update(item.id, item.size, 0)}
                >
                  REMOVE
                </button>
              </div>
            </div>
          );
        return (
          <div className="cart-item" key={item.id + item.size}>
            <Link to={"/product/" + p.id} onClick={() => setOpen(false)}>
              <img src={productImage(p)} alt={p.name + " placeholder"} />
            </Link>
            <div>
              <span className="eyebrow">{p.code}</span>
              <Link to={"/product/" + p.id} onClick={() => setOpen(false)}>
                <h3>{p.name}</h3>
              </Link>
              <p>
                {p.color} / {item.size}
              </p>
              {(!p.variants.some(
                (v) => v.size === item.size && v.stock >= item.qty,
              ) ||
                p.status !== "active") && (
                <p className="form-error">
                  Selected size or quantity unavailable
                </p>
              )}
              <Quantity
                qty={item.qty}
                onChange={(n) => update(item.id, item.size, n)}
              />
              <button
                className="underlined remove"
                onClick={() => update(item.id, item.size, 0)}
              >
                REMOVE
              </button>
            </div>
            <span>
              {money(
                ((quote?.lines.find(
                  (l) => l.product_id === p.id && l.size === item.size,
                )?.unit_price ?? p.price * 100) /
                  100) *
                  item.qty,
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function Cart({ drawer = false }) {
  const { cart, setOpen, products, coupon } = useStore();
  const [quote, setQuote] = useState(null),
    [quoteError, setQuoteError] = useState("");
  useEffect(() => {
    let active = true;
    setQuote(null);
    if (!cart.length) {
      setQuoteError("");
      return;
    }
    api("/checkout/quote", { method: "POST", body: { items: cart, coupon } })
      .then((q) => {
        if (active) {
          setQuote(q);
          setQuoteError("");
        }
      })
      .catch((e) => active && setQuoteError(e.message));
    return () => {
      active = false;
    };
  }, [cart, products, coupon]);
  const total = quote ? quote.subtotal / 100 : null;
  return (
    <div className={drawer ? "cart-content" : "cart-page section-pad"}>
      <div className="cart-heading">
        <div>
          <div className="eyebrow">YOUR SELECTION / DROP 001</div>
          <h1>
            THE BAG. <small>({cart.reduce((s, x) => s + x.qty, 0)})</small>
          </h1>
        </div>
        {drawer && (
          <button aria-label="Close bag" onClick={() => setOpen(false)}>
            <X />
          </button>
        )}
      </div>
      {cart.length ? (
        <>
          <CartItems quote={quote} />
          {quoteError && (
            <p className="feedback error" role="alert">
              {quoteError}
            </p>
          )}
          {!drawer && <CouponEntry />}
          <div className="cart-summary">
            <div>
              <span>SUBTOTAL</span>
              <strong>{total === null ? "—" : money(total)}</strong>
            </div>
            {quote && (
              <>
                {[
                  ["DISCOUNT", -quote.discount],
                  ["SHIPPING", quote.shipping],
                  ["TOTAL — TEST ORDER", quote.total],
                ].map(([label, amount]) => (
                  <div className="cart-total-row" key={label}>
                    <span>{label}</span>
                    <strong>{money(amount / 100)}</strong>
                  </div>
                ))}
              </>
            )}
            <p>
              Taxes included. Final prices, discounts and shipping are verified
              at checkout.
            </p>
            {drawer ? (
              <Link
                className="dark-button"
                to="/cart"
                onClick={() => setOpen(false)}
              >
                VIEW YOUR BAG <ArrowRight size={18} />
              </Link>
            ) : (
              <>
                <Link className="dark-button" to="/checkout">
                  CHECKOUT — TEST MODE <ArrowRight size={18} />
                </Link>
                <p className="checkout-note">
                  Test orders can be placed. No real payment is collected.
                </p>
              </>
            )}
            <Link
              className="continue"
              to="/shop"
              onClick={() => setOpen(false)}
            >
              CONTINUE EXPLORING ↗
            </Link>
          </div>
        </>
      ) : (
        <div className="empty">
          <ShoppingBag size={36} strokeWidth={1} />
          <h2>SPACE FOR SOMETHING.</h2>
          <p>Your bag is empty. Find a piece that feels like you.</p>
          <Link
            className="dark-button"
            to="/shop"
            onClick={() => setOpen(false)}
          >
            EXPLORE DROP 001 <ArrowUpRight size={18} />
          </Link>
        </div>
      )}
    </div>
  );
}
function Drawer() {
  const { open, setOpen } = useStore();
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previous = document.activeElement;
    const dialog = document.querySelector(".drawer");
    const focusable = () =>
      [...dialog.querySelectorAll("a,button,select,input,[tabindex]")].filter(
        (e) => !e.disabled && e.tabIndex !== -1,
      );
    focusable()[0]?.focus();
    const key = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const f = focusable(),
          first = f[0],
          last = f.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      previous?.focus();
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return open ? (
    <div className="drawer-backdrop" onClick={() => setOpen(false)}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        onClick={(e) => e.stopPropagation()}
      >
        <Cart drawer />
      </aside>
    </div>
  ) : null;
}
function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <div>
          <div className="eyebrow">STAY UNDEFINED.</div>
          <h2>
            MEET US IN
            <br />
            THE IN-BETWEEN.
          </h2>
          <p>No rules for becoming. Just a place to start.</p>
        </div>
        <div className="footer-links">
          <div>
            <span>EXPLORE</span>
            <Link to="/shop">The collection ↗</Link>
            <Link to="/lookbook">Lookbook ↗</Link>
            <Link to="/about">Our story ↗</Link>
          </div>
          <div>
            <span>THE DETAILS</span>
            <Link to="/cart">Your bag ↗</Link>
            <Link to="/shop?saved=1">Saved pieces ↗</Link>
            <Link to="/account">Your account ↗</Link>
            <span className="footer-small">
              Independent streetwear.
              <br />
              Made for the in-between.
            </span>
          </div>
          <div>
            <span>HELP & POLICIES</span>
            {[
              ["shipping-policy", "Shipping Policy"],
              ["returns-exchange", "Returns & Exchange"],
              ["privacy-policy", "Privacy Policy"],
              ["terms-conditions", "Terms & Conditions"],
              ["faq", "FAQ"],
              ["size-guide", "Size Guide"],
            ].map(([slug, title]) => (
              <Link key={slug} to={"/" + slug}>
                {title} ↗
              </Link>
            ))}
          </div>
        </div>
      </div>
      <BrandLogo placement="footer" />
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} MAYGREY</span>
        <span>SOMEWHERE BETWEEN.</span>
        <span>IND / ₹ &nbsp; ↗</span>
      </div>
    </footer>
  );
}
function NotFound() {
  return (
    <main className="empty not-found">
      <div className="eyebrow">404 / OUT OF FRAME</div>
      <h1>SOMEWHERE ELSE.</h1>
      <p>This page has drifted out of reach.</p>
      <Link className="dark-button" to="/">
        BACK TO MAYGREY <ArrowUpRight size={18} />
      </Link>
    </main>
  );
}
function App() {
  return (
    <BrowserRouter>
      <Provider>
        <Scroll />
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/about" element={<About />} />
          <Route path="/lookbook" element={<Lookbook />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders/:id" element={<OrderConfirmation />} />
          <Route path="/account" element={<Account />} />
          <Route path="/forgot-password" element={<Account mode="forgot" />} />
          <Route path="/reset-password" element={<Account mode="reset" />} />
          <Route path="/admin/*" element={<Admin />} />
          {[
            "shipping-policy",
            "returns-exchange",
            "privacy-policy",
            "terms-conditions",
            "faq",
            "size-guide",
          ].map((slug) => (
            <Route
              key={slug}
              path={"/" + slug}
              element={<PolicyPage slug={slug} />}
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
        <Drawer />
      </Provider>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")).render(<App />);
