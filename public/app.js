async function loadDashboard() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();

    const status = document.getElementById("status");
    const bot = document.getElementById("bot");
    const version = document.getElementById("version");

    if (status) {
      status.textContent = data.online ? "Online" : "Offline";
    }

    if (bot) {
      bot.textContent = data.bot || "KDBot";
    }

    if (version) {
      version.textContent = data.version || "1.0.0";
    }
  } catch (error) {
    console.error("Dashboard API error:", error);

    const status = document.getElementById("status");

    if (status) {
      status.textContent = "Offline";
    }
  }
}

document.addEventListener("DOMContentLoaded", loadDashboard);
