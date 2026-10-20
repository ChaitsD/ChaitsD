import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { api } from "./api";
const Store = createContext();
export const useStore = () => useContext(Store);
export function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
const ids = (value) =>
  Array.isArray(value) ? value.filter((x) => typeof x === "string") : [];
const cartItems = (value) =>
  Array.isArray(value)
    ? value.filter(
        (x) =>
          x &&
          typeof x.id === "string" &&
          typeof x.size === "string" &&
          Number.isInteger(x.qty) &&
          x.qty > 0 &&
          x.qty <= 99,
      )
    : [];
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be disabled. Server accounts still work. */
  }
};
export function Provider({ children }) {
  const [cart, setCart] = useState(() => cartItems(read("mg-cart", []))),
    [coupon, setCoupon] = useState(() =>
      typeof read("mg-coupon", "") === "string" ? read("mg-coupon", "") : "",
    ),
    [wishlist, setWishlist] = useState(() => ids(read("mg-wishlist", []))),
    [open, setOpen] = useState(false),
    [catalog, setCatalog] = useState(null),
    [user, setUserState] = useState(null),
    [authReady, setAuthReady] = useState(false),
    [wishlistReady, setWishlistReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const userRef = useRef(null),
    wishRef = useRef(wishlist),
    wishQueue = useRef(Promise.resolve());
  const setUser = useCallback((next) => {
    if (next?.id !== userRef.current?.id) {
      setWishlistReady(next?.role !== "customer");
      const guest = ids(read("mg-wishlist", []));
      setWishlist(guest);
      wishRef.current = guest;
    }
    userRef.current = next;
    setUserState(next);
    setAuthReady(true);
  }, []);
  const refresh = useCallback(async () => {
    const c = await api("/catalog");
    setCatalog(c);
    setError("");
    return c;
  }, []);
  const refreshSession = useCallback(
    () => api("/auth/me").then((x) => setUser(x.user)),
    [setUser],
  );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    refreshSession().catch((e) => {
      setError(e.message);
      setAuthReady(true);
    });
    const timer = setInterval(() => refresh().catch(() => {}), 30000);
    const focus = () => {
      refresh().catch(() => {});
      refreshSession().catch(() => {});
    };
    window.addEventListener("focus", focus);
    const authChanged = () => refreshSession().catch(() => {});
    window.addEventListener("mg-auth-changed", authChanged);
    const storage = (e) => {
      if (e.key === "mg-auth-change") refreshSession().catch(() => {});
      if (e.key === "mg-cart") setCart(cartItems(read("mg-cart", [])));
      if (e.key === "mg-coupon") {
        const v = read("mg-coupon", "");
        setCoupon(typeof v === "string" ? v : "");
      }
      if (
        e.key === "mg-wishlist-change" &&
        userRef.current?.role === "customer"
      ) {
        const owner = userRef.current.id;
        api("/account")
          .then((a) => {
            if (userRef.current?.id !== owner) return;
            setWishlist(a.wishlist);
            wishRef.current = a.wishlist;
          })
          .catch(() => {});
      }
    };
    window.addEventListener("storage", storage);
    let debounce;
    const events = new EventSource("/api/catalog/events");
    events.addEventListener("catalog", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => refresh().catch(() => {}), 80);
    });
    return () => {
      clearInterval(timer);
      clearTimeout(debounce);
      events.close();
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", storage);
      window.removeEventListener("mg-auth-changed", authChanged);
    };
  }, [refresh, refreshSession]);
  useEffect(() => write("mg-cart", cart), [cart]);
  useEffect(() => write("mg-coupon", coupon), [coupon]);
  useEffect(() => {
    if (authReady && !user) write("mg-wishlist", wishlist);
  }, [wishlist, user, authReady]);
  useEffect(() => {
    let active = true;
    if (user?.role === "customer") {
      const owner = user.id;
      api("/account")
        .then(async (a) => {
          if (!active || userRef.current?.id !== owner) return;
          const guest = ids(read("mg-wishlist", []));
          const merged = [...new Set([...guest, ...a.wishlist])];
          if (guest.length) {
            await api("/account/wishlist", {
              method: "PUT",
              body: { ids: merged },
            });
            if (!active || userRef.current?.id !== owner) return;
            write("mg-wishlist", []);
          }
          setWishlist(merged);
          wishRef.current = merged;
          setWishlistReady(true);
        })
        .catch((e) => {
          if (active) {
            setNotice(e.message);
            setWishlistReady(true);
          }
        });
    } else setWishlistReady(true);
    return () => {
      active = false;
    };
  }, [user?.id]);
  const add = (id, size, qty) => {
    const p = catalog.products.find((p) => p.id === id),
      variant = p?.variants.find((v) => v.size === size),
      old = cart.find((x) => x.id === id && x.size === size);
    if (
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty + (old?.qty || 0) > 99 ||
      p?.status !== "active" ||
      !variant ||
      qty + (old?.qty || 0) > variant.stock
    )
      throw Error("Not enough stock for this size. Please update your bag.");
    setCart((c) =>
      old
        ? c.map((x) =>
            x.id === id && x.size === size ? { ...x, qty: x.qty + qty } : x,
          )
        : [...c, { id, size, qty }],
    );
    setOpen(true);
  };
  const update = (id, size, qty) => {
    if (qty < 1) {
      setCart((c) => c.filter((x) => !(x.id === id && x.size === size)));
      return;
    }
    const p = catalog.products.find((p) => p.id === id),
      v = p?.variants.find((v) => v.size === size);
    if (
      !Number.isInteger(qty) ||
      qty > 99 ||
      !v ||
      p.status !== "active" ||
      qty > v.stock
    ) {
      setNotice(
        "Requested quantity is unavailable. Please choose a smaller quantity or remove this item.",
      );
      return;
    }
    setCart((c) =>
      c.map((x) => (x.id === id && x.size === size ? { ...x, qty } : x)),
    );
  };
  const wish = (id) => {
    const current = wishRef.current;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    wishRef.current = next;
    setWishlist(next);
    if (user?.role === "customer") {
      const owner = user.id;
      wishQueue.current = wishQueue.current
        .then(async () => {
          if (userRef.current?.id !== owner) return;
          await api("/account/wishlist", {
            method: "PUT",
            body: { ids: next },
          });
        })
        .catch((e) => setNotice(e.message));
    }
  };
  const logout = async () => {
    await wishQueue.current;
    await api("/auth/logout", { method: "POST", body: {} });
    setUser(null);
    setWishlist([]);
    wishRef.current = [];
    write("mg-wishlist", []);
  };
  if (!catalog || !authReady || (user?.role === "customer" && !wishlistReady))
    return (
      <main className="empty">
        <h1>MAYGREY</h1>
        <p role="status">{error || "Entering the in-between…"}</p>
        {error && (
          <button
            className="dark-button"
            onClick={() => {
              refresh().catch((e) => setError(e.message));
              refreshSession().catch((e) => setError(e.message));
            }}
          >
            RETRY
          </button>
        )}
      </main>
    );
  return (
    <Store.Provider
      value={{
        ...catalog,
        cart,
        setCart,
        coupon,
        setCoupon,
        add,
        update,
        open,
        setOpen,
        wishlist,
        wish,
        refresh,
        user,
        setUser,
        logout,
      }}
    >
      {notice && (
        <div className="store-notice" role="alert">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      {children}
    </Store.Provider>
  );
}
