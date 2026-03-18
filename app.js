require("dotenv").config();
const express = require("express");
const expressLayout = require("express-ejs-layouts");
const createError = require("http-errors");
const http = require("http");
const path = require("path");
const cookieParser = require("cookie-parser");
const morgan = require('morgan');

const ws = require("./services/ws_server");
const tcp = require("./services/tcp_server");
const bridge = require("./services/io_bridge");

const apiRouter = require("./routes/api");
const indexRouter = require("./routes/index");

const app = express();
app.use(morgan('dev'));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Static files
app.use("/", express.static("public"));
app.use("/img", express.static("public/images"));
//app.use("/node_modules", express.static("node_modules"));

// View engine setup
app.use(expressLayout);
app.set("layout", "./layout");
app.set("views", "./views");
app.set("view engine", "ejs");

app.use("/", indexRouter);
app.use(`/app`, apiRouter);



// ----------------------------------------------------
// Error Handling
// ----------------------------------------------------

app.use((req, res, next) => {
  res.locals.hideShell = false; // default
  next();
});
app.use((req, res, next) => {
  next(createError(404));
});
app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.render("error", { error: { status: err.status }, layout: false });
});

// ----------------------------------------------------
// Server Setup (HTTP / HTTPS)
// ----------------------------------------------------
if (process.env.WEB_ENABLE === "true") {
  let server;
  const isSecure = process.env.WEB_SECURE === "true";
  const port = process.env.WEB_PORT || 3000;
  const host = process.env.WEB_HOST || "0.0.0.0";

  server = http.createServer(app);

  server.listen(port, host, () => {
    const protocol = isSecure ? "https" : "http";
    console.log(`[WEB]\tServer running at ${protocol}://${host}:${port}`);

    if (process.env.NODE_ENV === "developer") {
      console.log(`[WEB]*\tServer also accessible at ${protocol}://localhost:${port}`);
    }
  });
}
//=====================================================================================================
//=====================================================================================================
//=====================================================================================================

// if (process.env.BRIDGE_ENABLE === "true") {
//   const host = process.env.BRIDGE_HOST || '127.0.0.1';
//   const port = process.env.BRIDGE_PORT || '8888';
//   bridge.start(host, port);
// }

// if (process.env.WS_ENABLE === "true") {
//   const host = process.env.WS_HOST || '127.0.0.1';
//   const port = process.env.WS_PORT || '8000';
//   ws.start(host, port);
// }

// if (process.env.TCP_ENABLE === "true") {
//   const host = process.env.TCP_HOST || '127.0.0.1';
//   const port = process.env.TCP_PORT || '20133';
//   tcp.start(host, port);
// }