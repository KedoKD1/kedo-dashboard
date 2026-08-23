const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const SESSION_SECRET =
  process.env.SESSION_SECRET || "temporary-development-secret";

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
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
   Health Check
========================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "KDBot Dashboard"
  });
});

/* =========================
   Configuration Check
========================= */

app.get("/api/config", (req, res) => {
  res.json({
    discordClientId: Boolean(DISCORD_CLIENT_ID),
    discordClientSecret: Boolean(DISCORD_CLIENT_SECRET),
    discordRedirectUri: Boolean(DISCORD_REDIRECT_URI),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
    redirectUri: DISCORD_REDIRECT_URI || null
  });
});

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
      loggedIn: false,
      user: null
    });
  }

  res.json({
    loggedIn: true,
    user: req.session.user
  });
});

/* =========================
   Discord OAuth Login
========================= */

app.get("/login", (req, res) => {
  if (
    !DISCORD_CLIENT_ID ||
    !DISCORD_CLIENT_SECRET ||
    !DISCORD_REDIRECT_URI
  ) {
    return res.status(500).json({
      error: "Discord OAuth is not configured.",
      missing: {
        DISCORD_CLIENT_ID: !DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET: !DISCORD_CLIENT_SECRET,
        DISCORD_REDIRECT_URI: !DISCORD_REDIRECT_URI
      }
    });
  }

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify"
  });

  const discordUrl =
    "https://discord.com/oauth2/authorize?" + params.toString();

  res.redirect(discordUrl);
});

/* =========================
   Discord OAuth Callback
========================= */

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).json({
      error: "Missing Discord authorization code."
    });
  }

  if (
    !DISCORD_CLIENT_ID ||
    !DISCORD_CLIENT_SECRET ||
    !DISCORD_REDIRECT_URI
  ) {
    return res.status(500).json({
      error: "Discord OAuth is not configured."
    });
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
          code: code,
          redirect_uri: DISCORD_REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Discord token error:", tokenData);

      return res.status(500).json({
        error: "Discord token exchange failed."
      });
    }

    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error("Discord user error:", userData);

      return res.status(500).json({
        error: "Failed to retrieve Discord user."
      });
    }

    req.session.user = {
      id: userData.id,
      username: userData.username,
      global_name: userData.global_name,
      avatar: userData.avatar,
      discriminator: userData.discriminator
    };

    req.session.save((error) => {
      if (error) {
        console.error("Session save error:", error);

        return res.status(500).json({
          error: "Failed to save login session."
        });
      }

      res.redirect("/");
    });
  } catch (error) {
    console.error("Discord OAuth error:", error);

    res.status(500).json({
      error: "Discord authentication failed."
    });
  }
});

/* =========================
   Logout
========================= */

app.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        error: "Logout failed."
      });
    }

    res.clearCookie("connect.sid");

    res.json({
      success: true
    });
  });
});

/* =========================
   Dashboard Page
========================= */

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   Start Server
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("KDBot Dashboard");
  console.log("=================================");
  console.log(`Port: ${PORT}`);
  console.log(
    `Discord Client ID: ${DISCORD_CLIENT_ID ? "Loaded" : "MISSING"}`
  );
  console.log(
    `Discord Client Secret: ${
      DISCORD_CLIENT_SECRET ? "Loaded" : "MISSING"
    }`
  );
  console.log(
    `Discord Redirect URI: ${
      DISCORD_REDIRECT_URI || "MISSING"
    }`
  );
  console.log(
    `Session Secret: ${
      process.env.SESSION_SECRET ? "Loaded" : "MISSING"
    }`
  );
  console.log("=================================");
});
