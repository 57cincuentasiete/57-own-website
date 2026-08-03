/* Admin entrance button on the homepage: opens a sign-in popup and sends the
   credentials to the Worker's login API. On success the browser is sent to
   /admin/ where the panel opens directly. */
(function () {
  "use strict";

  var button = document.getElementById("admin-entry");
  var modal = document.getElementById("admin-modal");
  var closeBtn = document.getElementById("admin-modal-close");
  var form = document.getElementById("admin-entry-form");
  var errorEl = document.getElementById("admin-modal-error");

  if (!button || !modal || !form || !errorEl) return;

  function openModal() {
    modal.hidden = false;
    errorEl.textContent = "";
    var first = form.querySelector("input");
    if (first) first.focus();
  }

  function closeModal() {
    modal.hidden = true;
    errorEl.textContent = "";
    button.focus();
  }

  button.addEventListener("click", openModal);

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  // Visiting /admin without a session redirects here with ?admin=1 so the
  // same sign-in popup appears without the visitor having to click the
  // Admin button themselves.
  var params = new URLSearchParams(window.location.search);
  if (params.get("admin") === "1") {
    params.delete("admin");
    var cleanUrl =
      window.location.pathname +
      (params.toString() ? "?" + params.toString() : "") +
      window.location.hash;
    try {
      window.history.replaceState(null, "", cleanUrl);
    } catch (e) {
      /* older browsers may refuse history.replaceState; the modal still opens */
    }
    openModal();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    errorEl.textContent = "Signing in\u2026";

    fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username.value.trim(),
        password: form.password.value
      })
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 200 && result.data.ok) {
          window.location.href = "/admin/";
        } else {
          errorEl.textContent =
            (result.data && result.data.message) || "Sign in failed. Try again.";
        }
      })
      .catch(function () {
        errorEl.textContent = "Network error. Please try again.";
      });
  });
})();
