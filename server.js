const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "kdbot-dashboard-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    bot: "KDBot",
    version: "1.0.0"
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,
    user: req.session.user
  });
});

app.get("/login", (req, res) => {
  res.status(501).json({
    error: "Discord OAuth is not configured yet."
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true
    });
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`KDBot Dashboard running on port ${PORT}`);
});
