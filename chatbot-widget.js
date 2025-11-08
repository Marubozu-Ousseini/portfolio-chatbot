// chatbot-widget.js - Standalone JavaScript (cleaned)
(function () {
  if (window.__CHATBOT_WIDGET_LOADED) return;
  window.__CHATBOT_WIDGET_LOADED = true;

  const api = window.CHATBOT_API || '';

  // Inject CSS if not already present
  if (!document.querySelector('link[href$="chatbot-widget.css"]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'chatbot-widget.css';
    document.head.appendChild(style);
  }

  // Create UI
  const btn = document.createElement('button');
  btn.id = 'chatbot-btn';
  btn.innerText = '💬';
  document.body.appendChild(btn);

  const container = document.createElement('div');
  container.id = 'chatbot-container';
  container.innerHTML = `
    <div id="chatbot-header">Sensei <span id="chatbot-close">×</span></div>
    <div id="chatbot-messages"></div>
    <form id="chatbot-form">
      <input id="chatbot-input" autocomplete="off" placeholder="Ask me anything..."/>
      <button type="submit">Send</button>
    </form>
  `;
  document.body.appendChild(container);

  const closeEl = container.querySelector('#chatbot-close');
  const form = container.querySelector('#chatbot-form');
  const input = container.querySelector('#chatbot-input');
  const messages = container.querySelector('#chatbot-messages');
  const STORAGE_KEY = 'chatbot_history_v1';
  let userName = '';
  try { userName = localStorage.getItem('chatbot_user_name') || ''; } catch (_) {}

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function saveHistory(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-100)));
    } catch (_) {}
  }
  function appendHistory(from, text) {
    const list = loadHistory();
    list.push({ from, text: String(text || '') });
    saveHistory(list);
  }

  function detectUiLanguage() {
    const lang = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
    return lang.startsWith('fr') ? 'fr' : 'en';
  }

  function addMsg(text, from, persist = true) {
    const div = document.createElement('div');
    div.className = 'msg ' + from;
    div.innerText = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    if (persist) appendHistory(from, text);
  }

  function addWelcomeMessage() {
    if (messages.children.length !== 0) return;
    const lang = detectUiLanguage();
    addMsg(lang === 'fr' ? "Bienvenue ! 👨🏾‍🏫 Je suis Sensei.🤖 Posez-moi vos questions !" : "Welcome! 👨🏾‍🏫 I'm Sensei.🤖 Ask me anything!", 'bot');
    if (!userName) {
      addMsg(lang === 'fr' ? "Avant de commencer, comment vous appelez-vous ?" : "Before we start, what's your name?", 'bot');
    }
  }

  // Restore chat history on load
  (function restoreHistory() {
    const hist = loadHistory();
    if (hist && hist.length) {
      for (const m of hist) {
        if (!m || typeof m.text !== 'string') continue;
        addMsg(m.text, m.from === 'user' ? 'user' : 'bot', false);
      }
    }
  })();

  btn.addEventListener('click', () => {
    container.classList.toggle('open');
    if (container.classList.contains('open')) addWelcomeMessage();
  });
  closeEl.addEventListener('click', () => container.classList.remove('open'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const lang = detectUiLanguage();
    if (!userName) {
      // Treat a short input without punctuation as the name
      if (q.split(/\s+/).length <= 4 && !/[?!.]/.test(q)) {
        userName = q.replace(/[^\p{L} '\-]/gu, '').trim();
        if (userName) {
          try { localStorage.setItem('chatbot_user_name', userName); } catch (_) {}
          addMsg(lang === 'fr' ? `Ravi de vous rencontrer, ${userName} !` : `Nice to meet you, ${userName}!`, 'bot');
          input.value = '';
          return;
        }
      }
    }
    if (!api) {
      addMsg('API endpoint is not configured. Please set window.CHATBOT_API.', 'bot');
      return;
    }
    addMsg(q, 'user');
    input.value = '';
    addMsg('...', 'bot', false);
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, name: userName || undefined }),
        // mode: 'cors'  // default is fine; keep headers minimal for CORS
      });
      if (!res.ok) {
        const text = await res.text();
        messages.lastChild.innerText = `Error: ${res.status} ${res.statusText} - ${text}`;
        return;
      }
      const data = await res.json();
      const msg = data.message || 'No response.';
      messages.lastChild.innerText = msg;
      appendHistory('bot', msg);
      // Sources are intentionally not displayed in the chat UI.
    } catch (err) {
      console.error('Chatbot fetch failed:', err);
      messages.lastChild.innerText = 'Network error: Failed to fetch. Check CORS and API endpoint.';
    }
  });
})();