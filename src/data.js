export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
export const productImage = (product, view = "front") =>
  product.images?.[view] || "/media/campaign-placeholder.svg";
