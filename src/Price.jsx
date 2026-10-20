import React from "react";
import { money } from "./data";
export default function Price({ product: p }) {
  const discounted = p.price < p.regularPrice;
  return (
    <span className="price-display">
      {discounted && <del>{money(p.regularPrice)}</del>}
      <span>{money(p.price)}</span>
      {discounted && (
        <small className="discount">{p.discountPercent}% OFF</small>
      )}
    </span>
  );
}
