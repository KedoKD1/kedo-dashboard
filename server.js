const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  SESSION_SECRET
} = process.env;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET || "development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   Bot Status
========================= */

app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    bot: "KDBot",
    version: "1.0.0"
  });
});

/* =========================
   Current User
========================= */

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

/* =========================
   Discord Login
========================= */

app.get("/login", (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).send("Discord OAuth is not configured.");
  }

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify"
  });

  res.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
});

/* =========================
   Discord OAuth Callback
========================= */

app.get("/auth/discord/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  try {
    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: DISCORD_REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Discord token error:", tokenData);
      return res.status(500).send("Discord authentication failed.");
    }

    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const user = await userResponse.json();

    if (!userResponse.ok) {
      console.error("Discord user error:", user);
      return res.status(500).send("Could not get Discord user.");
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar
    };

    res.redirect("/");
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("Authentication error.");
  }
});

/* =========================
   Logout
========================= */

app.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false
      });
    }

    res.json({
      success: true
    });
  });
});

/* =========================
   Dashboard
========================= */

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   Start Server
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`KDBot Dashboard running on port ${PORT}`);
});
