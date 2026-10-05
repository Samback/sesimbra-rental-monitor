(() => {
  const button = document.getElementById("enable-push");
  const status = document.getElementById("push-status");
  const config = window.SESIMBRA_PUSH_CONFIG || {};
  if (!button || !status) return;

  const supported = "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (!supported) {
    button.disabled = true;
    status.textContent = "Цей браузер не підтримує вебсповіщення.";
    return;
  }

  navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
    .then(() => {
      if (config.apiBaseUrl && config.vapidPublicKey) {
        button.disabled = false;
        status.textContent = "Увімкніть сповіщення, щоб отримувати нові перевірені оголошення.";
      } else {
        button.disabled = true;
        status.textContent = "Підключення сповіщень буде завершено після налаштування Cloudflare Worker.";
      }
    })
    .catch(() => {
      button.disabled = true;
      status.textContent = "Не вдалося зареєструвати службу сповіщень.";
    });

  button.addEventListener("click", async () => {
    if (!config.apiBaseUrl || !config.vapidPublicKey) return;
    button.disabled = true;
    status.textContent = "Запитую дозвіл на сповіщення…";

    try {
      // iOS requires the permission prompt to follow a direct user action.
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        status.textContent = "Дозвіл не надано. Його можна змінити в налаштуваннях сповіщень.";
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(config.vapidPublicKey)
        });
      }

      const response = await fetch(config.apiBaseUrl.replace(/\/$/, "") + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "cors",
        credentials: "omit",
        body: JSON.stringify(subscription)
      });
      if (!response.ok) throw new Error("Subscription could not be saved");
      status.textContent = "Сповіщення увімкнено на цьому пристрої.";
    } catch {
      status.textContent = "Не вдалося увімкнути сповіщення. Спробуйте ще раз пізніше.";
    } finally {
      button.disabled = false;
    }
  });

  function decodeVapidKey(value) {
    const padded = value + "=".repeat((4 - value.length % 4) % 4);
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }
})();
