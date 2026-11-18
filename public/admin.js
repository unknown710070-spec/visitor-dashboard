
const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("message");
const visitsBox = document.getElementById("visits");
const visitCount = document.getElementById("visitCount");

async function loadDashboard() {
  const response = await fetch("/api/visits");

  if (response.status === 401) {
    dashboard.hidden = true;
    loginSection.hidden = false;
    return;
  }

  if (!response.ok) {
    throw new Error("Could not load visits");
  }

  const data = await response.json();

  loginSection.hidden = true;
  dashboard.hidden = false;
  visitCount.textContent = data.visits.length;

  visitsBox.replaceChildren();

  data.visits.forEach((visit) => {
    const item = document.createElement("article");
    const title = document.createElement("h3");
    const details = document.createElement("p");

    title.textContent = visit.ip;
    details.textContent =
      `${visit.country} · ${visit.city} · ` +
      new Date(visit.timestamp).toLocaleString();

    item.append(title, details);
    visitsBox.append(item);
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = document.getElementById("password").value;
  message.textContent = "Checking credentials...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      message.textContent = "Incorrect password or login failed.";
      return;
    }

    message.textContent = "";
    await loadDashboard();
  } catch {
    message.textContent = "Server connection failed.";
  }
});

document.getElementById("refreshButton").addEventListener("click", () => {
  loadDashboard().catch(() => {
    message.textContent = "Could not refresh data.";
  });
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  dashboard.hidden = true;
  loginSection.hidden = false;
  document.getElementById("password").value = "";
});

loadDashboard().catch(() => {});
