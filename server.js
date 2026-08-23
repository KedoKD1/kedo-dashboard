const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 3000;

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  SESSION_SECRET,
  NODE_ENV
} = process.env;

const IS_PRODUCTION = NODE_ENV === "production";

/* =========================================================
   SAFE DIAGNOSTICS
   Never print secrets or their actual values.
========================================================= */

function checkEnv(name, value) {
  return {
    configured: Boolean(value),
    length: value ? String(value).length : 0
  };
}

const envStatus = {
  DISCORD_CLIENT_ID: checkEnv(
    "DISCORD_CLIENT_ID",
    DISCORD_CLIENT_ID
  ),

  DISCORD_CLIENT_SECRET: checkEnv(
    "DISCORD_CLIENT_SECRET",
    DISCORD_CLIENT_SECRET
  ),

  DISCORD_REDIRECT_URI: checkEnv(
    "DISCORD_REDIRECT_URI",
    DISCORD_REDIRECT_URI
  ),

  SESSION_SECRET: checkEnv(
    "SESSION_SECRET",
    SESSION_SECRET
  )
};

console.log("========================================");
console.log("🚀 KDBot Dashboard Starting");
console.log("========================================");

console.log("Environment:");
console.log("NODE_ENV:", NODE_ENV || "not set");
console.log("PORT:", PORT);

console.log("OAuth configuration:");

console.log(
  "DISCORD_CLIENT_ID:",
  envStatus.DISCORD_CLIENT_ID
);

console.log(
  "DISCORD_CLIENT_SECRET:",
  envStatus.DISCORD_CLIENT_SECRET
);

console.log(
  "DISCORD_REDIRECT_URI:",
  envStatus.DISCORD_REDIRECT_URI
);

console.log(
  "SESSION_SECRET:",
  envStatus.SESSION_SECRET
);

console.log("========================================");

/* =========================================================
   OAUTH CONFIGURATION CHECK
========================================================= */

function getOAuthStatus() {
  const missing = [];

  if (!DISCORD_CLIENT_ID) {
    missing.push("DISCORD_CLIENT_ID");
  }

  if (!DISCORD_CLIENT_SECRET) {
    missing.push("DISCORD_CLIENT_SECRET");
  }

  if (!DISCORD_REDIRECT_URI) {
    missing.push("DISCORD_REDIRECT_URI");
  }

  if (!SESSION_SECRET) {
    missing.push("SESSION_SECRET");
  }

  return {
    configured: missing.length === 0,
    missing
  };
}

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

/* =========================================================
   SESSION
========================================================= */

app.use(
  session({
    secret:
      SESSION_SECRET ||
      "development-only-secret-change-me",

    resave: false,

    saveUninitialized: false,

    cookie: {
      secure: IS_PRODUCTION,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* =========================================================
   BASIC HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  const oauth = getOAuthStatus();

  res.json({
    success: true,

    service: "KDBot Dashboard",

    status: "online",

    timestamp: new Date().toISOString(),

    node: process.version,

    environment:
      NODE_ENV || "not-set",

    port: PORT,

    oauth: {
      configured: oauth.configured,

      missing: oauth.missing,

      clientId:
        envStatus.DISCORD_CLIENT_ID.configured,

      clientSecret:
        envStatus.DISCORD_CLIENT_SECRET.configured,

      redirectUri:
        envStatus.DISCORD_REDIRECT_URI.configured,

      sessionSecret:
        envStatus.SESSION_SECRET.configured
    }
  });
});

/* =========================================================
   BOT STATUS
========================================================= */

app.get("/api/status", (req, res) => {
  res.json({
    online: true,

    bot: "KDBot",

    version: "1.0.0",

    dashboard: "online",

    timestamp:
      new Date().toISOString()
  });
});

/* =========================================================
   CURRENT USER
========================================================= */

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

/* =========================================================
   DISCORD LOGIN
========================================================= */

app.get("/login", (req, res) => {
  console.log("🔐 Discord login requested");

  const oauth = getOAuthStatus();

  if (!oauth.configured) {
    console.error(
      "❌ Discord OAuth is not configured."
    );

    console.error(
      "Missing:",
      oauth.missing
    );

    return res.status(500).json({
      error:
        "Discord OAuth is not configured yet.",

      missing:
        oauth.missing
    });
  }

  console.log(
    "✅ OAuth configuration detected"
  );

  console.log(
    "Redirect URI:",
    DISCORD_REDIRECT_URI
  );

  const params =
    new URLSearchParams({
      client_id:
        DISCORD_CLIENT_ID,

      redirect_uri:
        DISCORD_REDIRECT_URI,

      response_type:
        "code",

      scope:
        "identify"
    });

  const discordURL =
    `https://discord.com/oauth2/authorize?${params.toString()}`;

  console.log(
    "➡️ Redirecting to Discord OAuth"
  );

  res.redirect(discordURL);
});

/* =========================================================
   DISCORD OAUTH CALLBACK
========================================================= */

app.get(
  "/auth/discord/callback",
  async (req, res) => {

    console.log(
      "🔄 Discord OAuth callback received"
    );

    const { code, error } =
      req.query;

    /* -----------------------------------------
       Discord returned an error
    ----------------------------------------- */

    if (error) {
      console.error(
        "❌ Discord OAuth error:",
        error
      );

      return res.status(400).json({
        error:
          "Discord authorization failed.",

        discord_error:
          error
      });
    }

    /* -----------------------------------------
       Missing code
    ----------------------------------------- */

    if (!code) {
      console.error(
        "❌ Missing authorization code"
      );

      return res.status(400).json({
        error:
          "Missing authorization code."
      });
    }

    /* -----------------------------------------
       Environment check
    ----------------------------------------- */

    const oauth =
      getOAuthStatus();

    if (!oauth.configured) {
      console.error(
        "❌ OAuth configuration missing during callback"
      );

      console.error(
        "Missing:",
        oauth.missing
      );

      return res.status(500).json({
        error:
          "OAuth configuration missing.",

        missing:
          oauth.missing
      });
    }

    try {

      /* =========================================
         STEP 1 — Exchange code for token
      ========================================= */

      console.log(
        "🔑 Exchanging authorization code..."
      );

      const tokenResponse =
        await fetch(
          "https://discord.com/api/oauth2/token",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              new URLSearchParams({
                client_id:
                  DISCORD_CLIENT_ID,

                client_secret:
                  DISCORD_CLIENT_SECRET,

                grant_type:
                  "authorization_code",

                code,

                redirect_uri:
                  DISCORD_REDIRECT_URI
              })
          }
        );

      const tokenData =
        await tokenResponse.json();

      console.log(
        "Discord token response status:",
        tokenResponse.status
      );

      if (!tokenResponse.ok) {

        console.error(
          "❌ Discord token exchange failed"
        );

        console.error(
          "Discord response:",
          tokenData
        );

        return res.status(500).json({
          error:
            "Discord authentication failed.",

          stage:
            "token_exchange",

          discord_status:
            tokenResponse.status,

          discord_error:
            tokenData.error || null,

          discord_description:
            tokenData.error_description ||
            null
        });
      }

      console.log(
        "✅ Discord token received"
      );

      /* =========================================
         STEP 2 — Get Discord user
      ========================================= */

      console.log(
        "👤 Requesting Discord user..."
      );

      const userResponse =
        await fetch(
          "https://discord.com/api/users/@me",
          {
            headers: {
              Authorization:
                `Bearer ${tokenData.access_token}`
            }
          }
        );

      const user =
        await userResponse.json();

      console.log(
        "Discord user response status:",
        userResponse.status
      );

      if (!userResponse.ok) {

        console.error(
          "❌ Could not retrieve Discord user"
        );

        console.error(
          "Discord response:",
          user
        );

        return res.status(500).json({
          error:
            "Could not get Discord user.",

          stage:
            "user_request",

          discord_status:
            userResponse.status
        });
      }

      console.log(
        "✅ Discord user retrieved:",
        user.username
      );

      /* =========================================
         STEP 3 — Save session
      ========================================= */

      req.session.user = {
        id:
          user.id,

        username:
          user.username,

        global_name:
          user.global_name || null,

        avatar:
          user.avatar || null
      };

      console.log(
        "✅ User session created"
      );

      /* =========================================
         STEP 4 — Redirect dashboard
      ========================================= */

      res.redirect("/");

    } catch (error) {

      console.error(
        "❌ OAuth unexpected error:"
      );

      console.error(
        error
      );

      res.status(500).json({
        error:
          "Authentication error.",

        stage:
          "unexpected",

        message:
          error.message
      });
    }
  }
);

/* =========================================================
   LOGOUT
========================================================= */

app.post(
  "/logout",
  (req, res) => {

    console.log(
      "🚪 Logout requested"
    );

    req.session.destroy(
      (error) => {

        if (error) {

          console.error(
            "❌ Logout error:",
            error
          );

          return res.status(500).json({
            success: false
          });
        }

        console.log(
          "✅ Session destroyed"
        );

        res.json({
          success: true
        });
      }
    );
  }
);

/* =========================================================
   DEBUG ROUTE
========================================================= */

app.get(
  "/api/debug",
  (req, res) => {

    const oauth =
      getOAuthStatus();

    res.json({

      server: {
        online: true,

        node:
          process.version,

        platform:
          process.platform,

        uptime:
          process.uptime(),

        port:
          PORT,

        environment:
          NODE_ENV || "not-set"
      },

      oauth: {
        configured:
          oauth.configured,

        missing:
          oauth.missing,

        clientId:
          envStatus.DISCORD_CLIENT_ID.configured,

        clientSecret:
          envStatus.DISCORD_CLIENT_SECRET.configured,

        redirectUri:
          envStatus.DISCORD_REDIRECT_URI.configured,

        sessionSecret:
          envStatus.SESSION_SECRET.configured
      },

      session: {
        loggedIn:
          Boolean(req.session.user)
      },

      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   404 API HANDLER
========================================================= */

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({
      error:
        "API endpoint not found",

      path:
        req.originalUrl
    });
  }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "❌ Express error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      error:
        "Internal server error",

      message:
        error.message
    });
  }
);

/* =========================================================
   DASHBOARD FRONTEND
========================================================= */

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "========================================"
    );

    console.log(
      `🚀 KDBot Dashboard running on port ${PORT}`
    );

    console.log(
      `🌐 Environment: ${
        NODE_ENV || "not-set"
      }`
    );

    console.log(
      "🔐 OAuth configured:",
      getOAuthStatus().configured
    );

    if (
      !getOAuthStatus().configured
    ) {

      console.log(
        "⚠️ Missing OAuth variables:",
        getOAuthStatus().missing
      );

    } else {

      console.log(
        "✅ All OAuth environment variables detected"
      );
    }

    console.log(
      "========================================"
    );
  }
);
