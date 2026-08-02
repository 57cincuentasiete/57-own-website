(function () {
  "use strict";

  var app = document.getElementById("app");

  var state = {
    authed: false,
    schema: null,
    values: null,
    tab: "home",
    editingPost: null,
    postDraft: null,
    loginError: "",
    notice: null
  };

  var SECTIONS = ["home", "profile", "blog", "site"];
  var TABS = ["home", "profile", "blog", "site", "posts", "security"];

  /* ---------- helpers ---------- */

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  async function api(path, options) {
    options = options || {};
    var res = await fetch(path, {
      credentials: "same-origin",
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body
    });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* non-JSON response */
    }
    if (res.status === 401) {
      state.authed = false;
      state.loginError = "Your session expired. Please sign in again.";
      state.values = null;
      state.schema = null;
      render();
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      var err = new Error((data && data.message) || "Request failed (" + res.status + ")");
      err.data = data;
      throw err;
    }
    return data;
  }

  function showNotice(kind, text, rerender) {
    state.notice = { kind: kind, text: text };
    if (rerender !== false) {
      render();
    } else {
      var old = document.getElementById("admin-notice");
      if (old) old.remove();
      var main = document.querySelector(".admin-main");
      if (main) {
        var div = document.createElement("div");
        div.id = "admin-notice";
        div.className = "admin-notice " + kind;
        div.textContent = text;
        main.prepend(div);
      }
    }
    setTimeout(function () {
      state.notice = null;
      var el = document.getElementById("admin-notice");
      if (el) el.remove();
    }, 4000);
  }

  async function loadContent() {
    var data = await api("/api/content");
    state.schema = data.schema;
    state.values = data.values;
  }

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.querySelector(".theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "\u2600\ufe0f" : "\ud83c\udf19";
  }

  function initTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem("theme");
    } catch (e) { /* ignore */ }
    if (saved) {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(current);
    try {
      localStorage.setItem("theme", current);
    } catch (e) { /* ignore */ }
  }

  /* ---------- rendering ---------- */

  function fieldHtml(field, value) {
    var v = value == null ? "" : value;
    var control;
    if (field.type === "html") {
      control =
        '<textarea data-key="' + escapeAttr(field.key) + '" rows="9" spellcheck="true">' +
        escapeHtml(v) +
        "</textarea>" +
        '<p class="admin-hint">You can use HTML tags such as &lt;p&gt;, &lt;strong&gt; and &lt;a&gt;.</p>';
    } else if (field.type === "textarea") {
      control =
        '<textarea data-key="' + escapeAttr(field.key) + '" rows="3">' +
        escapeHtml(v) +
        "</textarea>";
    } else if (field.type === "link") {
      control =
        '<input data-key="' + escapeAttr(field.key) + '" type="url" value="' +
        escapeAttr(v) +
        '" placeholder="' +
        (field.mailto ? "you@example.com" : "https://...") +
        '">';
    } else {
      control =
        '<input data-key="' + escapeAttr(field.key) + '" type="text" value="' +
        escapeAttr(v) +
        '">';
    }
    return (
      '<label class="admin-field">' +
      '<span class="admin-field-label">' + escapeHtml(field.label) + "</span>" +
      control +
      "</label>"
    );
  }

  function renderSectionForm(section) {
    var meta = state.schema.sections[section];
    var values = state.values.sections[section] || {};
    return (
      '<section class="admin-card">' +
      '<div class="admin-card-head">' +
      "<h2>" + escapeHtml(meta.label) + "</h2>" +
      '<button type="button" class="btn btn-outline admin-btn-sm" data-action="reset-section" data-section="' +
      escapeAttr(section) + '">Restore defaults</button>' +
      "</div>" +
      '<form data-form="section" data-section="' + escapeAttr(section) + '">' +
      meta.fields.map(function (f) { return fieldHtml(f, values[f.key]); }).join("") +
      '<div class="admin-form-actions">' +
      '<button type="submit" class="btn btn-primary">Save ' + escapeHtml(meta.label) + "</button>" +
      "</div>" +
      "</form>" +
      "</section>"
    );
  }

  function renderPostEditor() {
    var draft = state.postDraft;
    var existing = draft.slug && state.values.posts[draft.slug];
    return (
      '<div class="admin-post-editor">' +
      '<div class="admin-card-head">' +
      "<h3>" + (existing ? "Edit post" : "New post") + "</h3>" +
      '<button type="button" class="btn btn-outline admin-btn-sm" data-action="cancel-post">Back to list</button>' +
      "</div>" +
      '<form data-form="post">' +
      '<label class="admin-field"><span class="admin-field-label">Slug (URL)</span>' +
      '<input name="slug" value="' + escapeAttr(draft.slug) + '" ' + (existing ? "readonly" : "") + ' placeholder="my-first-post"></label>' +
      '<label class="admin-field"><span class="admin-field-label">Title</span>' +
      '<input name="title" value="' + escapeAttr(draft.title) + '" required></label>' +
      '<label class="admin-field"><span class="admin-field-label">Date</span>' +
      '<input name="date" value="' + escapeAttr(draft.date) + '" placeholder="Aug 2, 2026"></label>' +
      '<label class="admin-field"><span class="admin-field-label">Read time (minutes)</span>' +
      '<input name="readMinutes" value="' + escapeAttr(draft.readMinutes) + '" placeholder="3"></label>' +
      '<label class="admin-field"><span class="admin-field-label">Excerpt (shown on the blog list)</span>' +
      '<textarea name="excerpt" rows="3">' + escapeHtml(draft.excerpt) + "</textarea></label>" +
      '<label class="admin-field"><span class="admin-field-label">Post body (HTML allowed)</span>' +
      '<textarea name="body" rows="14" spellcheck="true">' + escapeHtml(draft.body) + "</textarea>" +
      '<p class="admin-hint">You can use HTML tags such as &lt;p&gt;, &lt;h2&gt;, &lt;blockquote&gt;, &lt;pre&gt;&lt;code&gt; and &lt;a&gt;.</p></label>' +
      '<label class="admin-check"><input type="checkbox" name="published"' + (draft.published ? " checked" : "") + "> Published (visible on the site)</label>" +
      '<div class="admin-form-actions">' +
      '<button type="submit" class="btn btn-primary">Save post</button>' +
      "</div>" +
      "</form>" +
      "</div>"
    );
  }

  function renderPosts() {
    var posts = state.values.posts || {};
    var slugs = Object.keys(posts).sort(function (a, b) {
      var da = Date.parse(posts[a].date || "");
      var db = Date.parse(posts[b].date || "");
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return db - da;
    });

    var body = "";
    if (state.editingPost !== null) {
      body = renderPostEditor();
    } else {
      body =
        '<div class="admin-post-list">' +
        (slugs.length
          ? slugs.map(function (slug) {
              var p = posts[slug];
              return (
                '<div class="admin-post-row">' +
                '<div class="admin-post-info">' +
                "<strong>" + escapeHtml(p.title) + "</strong>" +
                '<span class="muted">/' + escapeHtml(p.slug) + " \u00b7 " + escapeHtml(p.date || "no date") +
                (p.published === false ? " \u00b7 draft" : "") + "</span>" +
                "</div>" +
                '<div class="admin-post-actions">' +
                '<button type="button" class="btn btn-outline admin-btn-sm" data-action="edit-post" data-slug="' + escapeAttr(slug) + '">Edit</button>' +
                '<button type="button" class="btn btn-outline admin-btn-sm admin-danger" data-action="delete-post" data-slug="' + escapeAttr(slug) + '">Delete</button>' +
                "</div>" +
                "</div>"
              );
            }).join("")
          : '<p class="muted">No posts yet. Click \u201cNew post\u201d to create one.</p>') +
        "</div>";
    }

    return (
      '<section class="admin-card">' +
      '<div class="admin-card-head">' +
      "<h2>Posts</h2>" +
      (state.editingPost === null
        ? '<button type="button" class="btn btn-primary admin-btn-sm" data-action="new-post">+ New post</button>'
        : "") +
      "</div>" +
      body +
      "</section>"
    );
  }

  function renderSecurity() {
    return (
      '<section class="admin-card">' +
      '<div class="admin-card-head">' +
      "<h2>Change password</h2>" +
      "</div>" +
      '<form data-form="password">' +
      '<label class="admin-field"><span class="admin-field-label">Current password</span>' +
      '<input type="password" name="current" autocomplete="current-password" required></label>' +
      '<label class="admin-field"><span class="admin-field-label">New password (at least 8 characters)</span>' +
      '<input type="password" name="next" autocomplete="new-password" minlength="8" required></label>' +
      '<label class="admin-field"><span class="admin-field-label">Confirm new password</span>' +
      '<input type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>' +
      '<p class="admin-hint">After saving, you will be signed out and must sign in with the new password.</p>' +
      '<div class="admin-form-actions">' +
      '<button type="submit" class="btn btn-primary">Change password</button>' +
      "</div>" +
      "</form>" +
      "</section>"
    );
  }

  function render() {
    if (!state.authed) {
      app.innerHTML =
        '<div class="admin-login-wrap">' +
        '<form class="admin-card admin-login" data-form="login" novalidate>' +
        "<h1>57 Admin</h1>" +
        '<p class="muted">Sign in to edit your site.</p>' +
        '<label class="admin-field"><span class="admin-field-label">Name</span>' +
        '<input name="username" autocomplete="username" required></label>' +
        '<label class="admin-field"><span class="admin-field-label">Password</span>' +
        '<input name="password" type="password" autocomplete="current-password" required></label>' +
        '<button type="submit" class="btn btn-primary">Sign in</button>' +
        '<p class="admin-error" id="admin-error">' + escapeHtml(state.loginError) + "</p>" +
        "</form>" +
        "</div>";
      return;
    }

    var noticeHtml =
      state.notice
        ? '<div id="admin-notice" class="admin-notice ' + state.notice.kind + '">' + escapeHtml(state.notice.text) + "</div>"
        : "";

    var tabsHtml =
      '<nav class="admin-tabs" aria-label="Admin sections">' +
      TABS.map(function (t) {
        var label = {
          home: "Home",
          profile: "Profile",
          blog: "Blog",
          site: "Site",
          posts: "Posts",
          security: "Security"
        }[t];
        return (
          '<button type="button" class="admin-tab" role="tab" aria-selected="' +
          (state.tab === t ? "true" : "false") +
          '" data-tab="' + t + '">' + label + "</button>"
        );
      }).join("") +
      "</nav>";

    var mainHtml =
      '<main class="admin-main">' +
      noticeHtml +
      (state.tab === "posts"
        ? renderPosts()
        : state.tab === "security"
          ? renderSecurity()
          : renderSectionForm(state.tab)) +
      "</main>";

    app.innerHTML =
      '<header class="admin-topbar">' +
      '<div class="admin-topbar-inner">' +
      '<span class="admin-brand">57<span class="admin-brand-sub">admin</span></span>' +
      '<div class="admin-actions">' +
      '<a class="btn btn-outline admin-btn-sm" href="../index.html" target="_blank" rel="noopener">View site</a>' +
      '<button type="button" class="theme-toggle" aria-label="Toggle dark mode">\ud83c\udf19</button>' +
      '<button type="button" class="btn btn-outline admin-btn-sm" data-action="logout">Sign out</button>' +
      "</div>" +
      "</div>" +
      "</header>" +
      tabsHtml +
      mainHtml;
  }

  /* ---------- actions ---------- */

  async function handleLogin(form) {
    var username = form.username.value.trim();
    var password = form.password.value;
    state.loginError = "";
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ username: username, password: password }) });
      state.authed = true;
      await loadContent();
      render();
    } catch (e) {
      state.loginError = e.message || "Sign in failed.";
      render();
    }
  }

  async function handleSectionSubmit(form) {
    var section = form.getAttribute("data-section");
    var values = {};
    form.querySelectorAll("[data-key]").forEach(function (input) {
      values[input.getAttribute("data-key")] = input.value;
    });
    try {
      var data = await api("/api/content", {
        method: "PUT",
        body: JSON.stringify({ section: section, values: values })
      });
      state.values.sections[section] = data.values;
      showNotice("ok", "Saved.");
    } catch (e) {
      showNotice("err", e.message || "Save failed.", false);
    }
  }

  async function handlePostSubmit(form) {
    var slug = form.slug.value.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) {
      showNotice("err", "Please enter a slug (letters, numbers, dashes).");
      return;
    }
    var post = {
      slug: slug,
      title: form.title.value.trim(),
      date: form.date.value.trim(),
      readMinutes: form.readMinutes.value.trim(),
      excerpt: form.excerpt.value.trim(),
      body: form.body.value,
      published: form.published.checked
    };
    try {
      await api("/api/posts", { method: "PUT", body: JSON.stringify({ slug: slug, post: post }) });
      await loadContent();
      state.editingPost = null;
      state.postDraft = null;
      showNotice("ok", "Post saved.");
    } catch (e) {
      showNotice("err", e.message || "Save failed.", false);
    }
  }

  async function handlePasswordSubmit(form) {
    var current = form.current.value;
    var next = form.next.value;
    var confirm = form.confirm.value;
    if (next.length < 8) {
      showNotice("err", "New password must be at least 8 characters.", false);
      return;
    }
    if (next !== confirm) {
      showNotice("err", "Passwords do not match.", false);
      return;
    }
    try {
      await api("/api/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      await api("/api/logout", { method: "POST" }).catch(function () {});
      state.authed = false;
      state.values = null;
      state.schema = null;
      state.loginError = "Password changed. Sign in with your new password.";
      render();
    } catch (e) {
      showNotice("err", e.message || "Password change failed.", false);
    }
  }

  async function handleResetSection(section) {
    if (!window.confirm("Restore this section to its default content? Your saved changes will be removed.")) return;
    try {
      await api("/api/content/" + section, { method: "DELETE" });
      await loadContent();
      showNotice("ok", "Section restored to defaults.");
    } catch (e) {
      showNotice("err", e.message || "Restore failed.", false);
    }
  }

  async function handleDeletePost(slug) {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await api("/api/posts/" + encodeURIComponent(slug), { method: "DELETE" });
      await loadContent();
      showNotice("ok", "Post deleted.");
    } catch (e) {
      showNotice("err", e.message || "Delete failed.", false);
    }
  }

  /* ---------- events ---------- */

  app.addEventListener("submit", function (event) {
    var form = event.target.closest("form");
    if (!form) return;
    event.preventDefault();
    var kind = form.getAttribute("data-form");
    if (kind === "login") handleLogin(form);
    if (kind === "section") handleSectionSubmit(form);
    if (kind === "post") handlePostSubmit(form);
    if (kind === "password") handlePasswordSubmit(form);
  });

  app.addEventListener("click", function (event) {
    var tabBtn = event.target.closest("[data-tab]");
    if (tabBtn) {
      state.tab = tabBtn.getAttribute("data-tab");
      state.editingPost = null;
      render();
      return;
    }
    var btn = event.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    if (action === "logout") {
      api("/api/logout", { method: "POST" }).catch(function () {});
      state.authed = false;
      state.values = null;
      state.schema = null;
      render();
    } else if (action === "reset-section") {
      handleResetSection(btn.getAttribute("data-section"));
    } else if (action === "new-post") {
      state.editingPost = "__new__";
      state.postDraft = { slug: "", title: "", date: "", readMinutes: "", excerpt: "", body: "", published: true };
      render();
    } else if (action === "edit-post") {
      var slug = btn.getAttribute("data-slug");
      var p = state.values.posts[slug];
      state.editingPost = slug;
      state.postDraft = {
        slug: p.slug,
        title: p.title || "",
        date: p.date || "",
        readMinutes: p.readMinutes || "",
        excerpt: p.excerpt || "",
        body: p.body || "",
        published: p.published !== false
      };
      render();
    } else if (action === "cancel-post") {
      state.editingPost = null;
      state.postDraft = null;
      render();
    } else if (action === "delete-post") {
      handleDeletePost(btn.getAttribute("data-slug"));
    }
  });

  document.addEventListener("click", function (event) {
    if (event.target.classList && event.target.classList.contains("theme-toggle")) {
      toggleTheme();
    }
  });

  /* ---------- boot ---------- */

  initTheme();
  api("/api/session")
    .then(function (session) {
      state.authed = !!session.ok;
      if (state.authed) return loadContent();
    })
    .catch(function () {
      state.authed = false;
    })
    .finally(function () {
      render();
    });
})();
