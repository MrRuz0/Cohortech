/*
 * Cohortech — widget de chat para la web de la clínica.
 * Uso:  <script src="https://cohortech.vercel.app/cohortech-widget.js" data-clinic="ID_DE_LA_CLINICA" async></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var clinicId = script.getAttribute("data-clinic");
  if (!clinicId) return;
  var origin = new URL(script.src).origin;
  var color = script.getAttribute("data-color") || "#1F7A70";
  var title = script.getAttribute("data-title") || "Escríbenos";
  var greeting = script.getAttribute("data-greeting") || "¡Hola! ¿En qué te puedo ayudar?";
  var api = origin + "/api/channels/webchat/" + clinicId;

  var KEY = "cohortech_session_" + clinicId;
  var session = null;
  try {
    session = localStorage.getItem(KEY);
    if (!session) {
      session = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, "");
      localStorage.setItem(KEY, session);
    }
  } catch (e) {
    session = String(Date.now()) + Math.random().toString(16).slice(2);
  }
  if (session.length < 12) session = session + "000000000000";

  var css =
    ".ctw-btn{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;color:#fff;font-size:26px;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000;background:" + color + "}" +
    ".ctw-panel{position:fixed;right:20px;bottom:90px;width:340px;max-width:calc(100vw - 24px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:Poppins,system-ui,sans-serif}" +
    ".ctw-panel.open{display:flex}" +
    ".ctw-head{background:" + color + ";color:#fff;padding:14px 16px;font-weight:600;font-size:15px}" +
    ".ctw-msgs{flex:1;overflow-y:auto;padding:12px;background:#F7F3EE;display:flex;flex-direction:column;gap:8px}" +
    ".ctw-m{max-width:82%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.35;white-space:pre-wrap;word-wrap:break-word}" +
    ".ctw-me{align-self:flex-end;background:" + color + ";color:#fff;border-bottom-right-radius:4px}" +
    ".ctw-clinic{align-self:flex-start;background:#fff;color:#14213D;border-bottom-left-radius:4px;border:1px solid #E4E1DC}" +
    ".ctw-form{display:flex;gap:8px;padding:10px;border-top:1px solid #E4E1DC;background:#fff}" +
    ".ctw-in{flex:1;border:1px solid #E4E1DC;border-radius:10px;padding:9px 10px;font-size:14px;outline:none}" +
    ".ctw-send{border:0;border-radius:10px;padding:0 14px;color:#fff;cursor:pointer;background:" + color + "}" +
    ".ctw-typing{font-size:12px;color:#5B6478;padding:0 14px 6px;background:#F7F3EE;display:none}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.className = "ctw-btn";
  btn.setAttribute("aria-label", title);
  btn.textContent = "💬";

  var panel = document.createElement("div");
  panel.className = "ctw-panel";
  panel.innerHTML =
    '<div class="ctw-head"></div><div class="ctw-msgs"></div><div class="ctw-typing">Escribiendo…</div>' +
    '<form class="ctw-form"><input class="ctw-in" maxlength="800" placeholder="Escribe tu mensaje…" autocomplete="off"/><button class="ctw-send" type="submit">Enviar</button></form>';
  panel.querySelector(".ctw-head").textContent = title;
  document.body.appendChild(panel);
  document.body.appendChild(btn);

  var msgs = panel.querySelector(".ctw-msgs");
  var typing = panel.querySelector(".ctw-typing");
  var form = panel.querySelector(".ctw-form");
  var input = panel.querySelector(".ctw-in");
  var seen = 0;
  var loaded = false;

  function add(from, text) {
    var el = document.createElement("div");
    el.className = "ctw-m " + (from === "me" ? "ctw-me" : "ctw-clinic");
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function loadHistory() {
    return fetch(api + "?session=" + encodeURIComponent(session))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var list = d.messages || [];
        if (list.length === seen) return;
        msgs.innerHTML = "";
        list.forEach(function (m) { add(m.from, m.text); });
        seen = list.length;
        if (!list.length) add("clinic", greeting);
      })
      .catch(function () {});
  }

  btn.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open") && !loaded) {
      loaded = true;
      loadHistory();
    }
  });

  // Si una persona de la clínica responde, se ve sin recargar.
  setInterval(function () {
    if (panel.classList.contains("open")) loadHistory();
  }, 10000);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    add("me", text);
    seen++;
    typing.style.display = "block";
    fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: session, text: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        typing.style.display = "none";
        if (d.reply) { add("clinic", d.reply); seen++; }
        else if (d.status === "paused") { add("clinic", "Gracias por escribirnos. Una persona de nuestro equipo te responderá en breve."); seen++; }
      })
      .catch(function () {
        typing.style.display = "none";
        add("clinic", "No pudimos enviar tu mensaje. Inténtalo de nuevo en unos minutos.");
      });
  });
})();
