export async function api(path, options = {}) {
  const form = options.body instanceof FormData;
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "X-MG-Request": "1",
      ...(!form ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body
      ? form
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error("Server is unavailable. Please try again.");
  }
  if (!res.ok) {
    if (res.status === 401 || data.error === "Admin access required.")
      window.dispatchEvent(new Event("mg-auth-changed"));
    throw Error(data.error || "Request failed.");
  }
  if (
    [
      "/auth/login",
      "/auth/signup",
      "/auth/logout",
      "/auth/reset-password",
    ].includes(path)
  ) {
    try {
      localStorage.setItem("mg-auth-change", Date.now() + ":" + Math.random());
    } catch {}
    window.dispatchEvent(new Event("mg-auth-changed"));
  }
  if (path === "/account/wishlist" && options.method === "PUT")
    try {
      localStorage.setItem(
        "mg-wishlist-change",
        Date.now() + ":" + Math.random(),
      );
    } catch {}
  return data;
}
