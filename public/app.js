
const button = document.getElementById("consentButton");
const message = document.getElementById("message");

button.addEventListener("click", async () => {
  button.disabled = true;
  message.textContent = "Registering your consent...";

  try {
    const response = await fetch("/api/visit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ consent: true })
    });

    if (!response.ok) {
      throw new Error("Request failed");
    }

    message.textContent =
      "Thank you. Your consent has been recorded.";
    button.textContent = "CONSENT RECORDED";
  } catch (error) {
    message.textContent =
      "Unable to connect. Please try again.";
    button.disabled = false;
  }
});
