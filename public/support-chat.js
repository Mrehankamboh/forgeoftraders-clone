(function () {
  var keyName = "fot_ticket_key";
  var key = localStorage.getItem(keyName);
  if (!key) {
    key = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem(keyName, key);
  }

  var style = document.createElement("style");
  style.textContent = [
    ".forge-chat{position:fixed;right:24px;bottom:92px;z-index:80;width:min(360px,calc(100vw - 32px));height:480px;display:none;flex-direction:column;background:#121618;color:#f4f1ea;border:1px solid rgba(194,150,53,.35);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.35);font-family:Poppins,sans-serif}",
    ".forge-chat.is-open{display:flex}",
    ".forge-chat header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}",
    ".forge-chat header strong{font-size:15px}",
    ".forge-chat header button{border:0;background:transparent;color:#f4f1ea;font-size:20px;cursor:pointer}",
    ".forge-chat .log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}",
    ".forge-chat .msg{max-width:85%;padding:10px 12px;border-radius:12px;background:#0c1011;font-size:14px}",
    ".forge-chat .msg--admin{align-self:flex-end;background:#c29635;color:#1a1204}",
    ".forge-chat form{display:grid;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.08)}",
    ".forge-chat input,.forge-chat textarea{width:100%;border:1px solid rgba(255,255,255,.12);background:#0c1011;color:#fff;border-radius:8px;padding:8px 10px;font:inherit}",
    ".forge-chat .send{height:36px;border:0;border-radius:8px;background:#c29635;color:#1a1204;font-weight:600;cursor:pointer}",
    ".forge-chat-fab{position:fixed;right:24px;bottom:24px;z-index:80;height:52px;padding:0 18px;border:0;border-radius:999px;background:#c29635;color:#1a1204;font:600 14px Poppins,sans-serif;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.28)}"
  ].join("");
  document.head.appendChild(style);

  var panel = document.createElement("section");
  panel.className = "forge-chat";
  panel.innerHTML = '<header><strong>Support</strong><button type="button" aria-label="Close chat">\u00d7</button></header><div class="log"></div><form><input name="name" placeholder="Your name" maxlength="80"><input name="subject" placeholder="Subject" maxlength="120"><textarea name="message" rows="3" placeholder="Write a message" required></textarea><button class="send" type="submit">Send</button></form>';
  document.body.appendChild(panel);

  var log = panel.querySelector(".log");
  var form = panel.querySelector("form");
  var ticketId = localStorage.getItem("fot_ticket_id") || "";
  var ticketOpen = false;

  function paint(tickets) {
    var ticket = tickets.find(function (item) { return item.id === ticketId; }) || tickets[0];
    if (!ticket) {
      log.innerHTML = "";
      ticketOpen = false;
      return;
    }
    ticketId = ticket.id;
    ticketOpen = ticket.status !== "closed";
    localStorage.setItem("fot_ticket_id", ticketId);
    log.innerHTML = "";
    ticket.messages.forEach(function (message) {
      var item = document.createElement("div");
      item.className = message.author === "admin" ? "msg msg--admin" : "msg";
      item.textContent = (message.author === "admin" ? "Support: " : "") + message.body;
      log.appendChild(item);
    });
    if (ticket.status === "closed") {
      var closed = document.createElement("div");
      closed.className = "msg";
      closed.textContent = "This chat is closed. Send a new message to open another ticket.";
      log.appendChild(closed);
    }
    log.scrollTop = log.scrollHeight;
    form.querySelector("[name=subject]").disabled = ticketOpen && ticket.messages.length > 0;
  }

  function load() {
    fetch("/api/tickets?key=" + encodeURIComponent(key))
      .then(function (response) { return response.json(); })
      .then(function (data) { paint(data.tickets || []); })
      .catch(function () {});
  }

  function openChat() {
    panel.classList.add("is-open");
    load();
  }

  window.$yourgptChatbot = { execute: function () { openChat(); } };
  var launcher = document.getElementById("chat-launcher");
  if (!launcher) {
    launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "forge-chat-fab";
    launcher.setAttribute("aria-label", "Open support chat");
    launcher.textContent = "Support";
    document.body.appendChild(launcher);
  }
  launcher.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openChat();
  }, true);
  panel.querySelector("header button").addEventListener("click", function () {
    panel.classList.remove("is-open");
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var message = form.message.value.trim();
    if (!message) return;
    fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: key,
        ticketId: ticketOpen ? ticketId : "",
        name: form.name.value,
        subject: form.subject.value,
        message: message
      })
    }).then(function (response) { return response.json(); }).then(function (data) {
      if (data.id) {
        ticketId = data.id;
        localStorage.setItem("fot_ticket_id", ticketId);
      }
      form.message.value = "";
      load();
    }).catch(function () {});
  });

  setInterval(function () {
    if (panel.classList.contains("is-open")) load();
  }, 5000);
})();
