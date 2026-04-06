(function () {
  if (window.AtlasDialog) return;

  const STYLE_ID = "atlas-dialog-style";
  const ROOT_ID = "atlas-dialog-root";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .atlas-dialog-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(3px);
      }
      .atlas-dialog-card {
        width: min(92vw, 420px);
        background: #fff;
        border: 1px solid rgba(30, 64, 175, 0.12);
        border-radius: 18px;
        box-shadow: 0 20px 55px rgba(15, 23, 42, 0.22);
        padding: 16px;
        color: #0f172a;
        font-family: "Cairo", sans-serif;
        animation: atlasDialogIn 0.16s ease;
      }
      @keyframes atlasDialogIn {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .atlas-dialog-title {
        margin: 0 0 8px;
        color: #1e3a8a;
        font-size: 1rem;
        font-weight: 800;
      }
      .atlas-dialog-message {
        margin: 0;
        color: #334155;
        font-size: 0.9rem;
        line-height: 1.7;
        white-space: pre-wrap;
      }
      .atlas-dialog-input {
        width: 100%;
        margin-top: 12px;
        height: 42px;
        border-radius: 10px;
        border: 1.5px solid rgba(30, 64, 175, 0.18);
        padding: 0 10px;
        font-size: 0.95rem;
        font-family: "Outfit", "Cairo", sans-serif;
        direction: rtl;
      }
      .atlas-dialog-actions {
        margin-top: 14px;
        display: flex;
        gap: 8px;
      }
      .atlas-dialog-btn {
        flex: 1;
        height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(30, 64, 175, 0.15);
        background: #fff;
        color: #1e3a8a;
        font-weight: 800;
        cursor: pointer;
      }
      .atlas-dialog-btn.primary {
        border: none;
        background: #1e40af;
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function openDialog({
    type = "alert",
    message = "",
    title = "تنبيه",
    confirmText = "موافق",
    cancelText = "إلغاء",
    defaultValue = "",
    placeholder = "",
  }) {
    ensureStyles();
    const root = ensureRoot();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "atlas-dialog-overlay";

      const card = document.createElement("div");
      card.className = "atlas-dialog-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");

      const titleEl = document.createElement("h3");
      titleEl.className = "atlas-dialog-title";
      titleEl.textContent = title;

      const messageEl = document.createElement("p");
      messageEl.className = "atlas-dialog-message";
      messageEl.textContent = message;

      card.appendChild(titleEl);
      card.appendChild(messageEl);

      let inputEl = null;
      if (type === "prompt") {
        inputEl = document.createElement("input");
        inputEl.className = "atlas-dialog-input";
        inputEl.type = "text";
        inputEl.value = String(defaultValue ?? "");
        inputEl.placeholder = placeholder;
        card.appendChild(inputEl);
      }

      const actions = document.createElement("div");
      actions.className = "atlas-dialog-actions";

      if (type !== "alert") {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "atlas-dialog-btn";
        cancelBtn.type = "button";
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener("click", () => close(type === "confirm" ? false : null));
        actions.appendChild(cancelBtn);
      }

      const okBtn = document.createElement("button");
      okBtn.className = "atlas-dialog-btn primary";
      okBtn.type = "button";
      okBtn.textContent = confirmText;
      okBtn.addEventListener("click", () => {
        if (type === "prompt") return close(inputEl ? inputEl.value : "");
        if (type === "confirm") return close(true);
        return close();
      });
      actions.appendChild(okBtn);
      card.appendChild(actions);
      overlay.appendChild(card);
      root.appendChild(overlay);

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      let closed = false;
      const onKeydown = (event) => {
        if (event.key === "Escape") {
          if (type === "confirm") close(false);
          else if (type === "prompt") close(null);
          else close();
        } else if (event.key === "Enter") {
          if (type === "prompt") close(inputEl ? inputEl.value : "");
          else if (type === "confirm") close(true);
          else close();
        }
      };

      function close(value) {
        if (closed) return;
        closed = true;
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        resolve(value);
      }

      overlay.addEventListener("click", (event) => {
        if (event.target !== overlay) return;
        if (type === "confirm") close(false);
        else if (type === "prompt") close(null);
        else close();
      });

      document.addEventListener("keydown", onKeydown);

      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      } else {
        okBtn.focus();
      }
    });
  }

  window.AtlasDialog = {
    alert(message, options = {}) {
      return openDialog({
        type: "alert",
        title: options.title || "تنبيه",
        message,
        confirmText: options.confirmText || "موافق",
      });
    },
    confirm(message, options = {}) {
      return openDialog({
        type: "confirm",
        title: options.title || "تأكيد",
        message,
        confirmText: options.confirmText || "تأكيد",
        cancelText: options.cancelText || "إلغاء",
      });
    },
    prompt(message, options = {}) {
      return openDialog({
        type: "prompt",
        title: options.title || "إدخال",
        message,
        confirmText: options.confirmText || "حفظ",
        cancelText: options.cancelText || "إلغاء",
        defaultValue: options.defaultValue || "",
        placeholder: options.placeholder || "",
      });
    },
  };
})();
