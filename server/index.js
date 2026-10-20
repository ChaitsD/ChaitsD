import { app } from "./app.js";
const port = Number(process.env.API_PORT || 3001);
app.listen(port, "0.0.0.0", () =>
  console.log(
    `MAYGREY API listening on ${port}. Payment mode: ${process.env.PAYMENT_MODE || "mock"}.`,
  ),
);
