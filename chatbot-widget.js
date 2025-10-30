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

  function addMsg(text, from) {
    const div = document.createElement('div');
    div.className = 'msg ' + from;
    div.innerText = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function addWelcomeMessage() {
    if (messages.children.length === 0) {
      addMsg("👋 Welcome! I'm Sensei. Ask me anything about Ousseini's experience, projects, or skills!", 'bot');
    }
  }

  btn.addEventListener('click', () => {
    container.classList.toggle('open');
    if (container.classList.contains('open')) addWelcomeMessage();
  });
  closeEl.addEventListener('click', () => container.classList.remove('open'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    if (!api) {
      addMsg('API endpoint is not configured. Please set window.CHATBOT_API.', 'bot');
      return;
    }
    addMsg(q, 'user');
    input.value = '';
    addMsg('...', 'bot');
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
        // mode: 'cors'  // default is fine; keep headers minimal for CORS
      });
      if (!res.ok) {
        const text = await res.text();
        messages.lastChild.innerText = `Error: ${res.status} ${res.statusText} - ${text}`;
        return;
      }
      const data = await res.json();
      messages.lastChild.innerText = data.message || 'No response.';
      if (data.sources && Array.isArray(data.sources) && data.sources.length) {
        const src = document.createElement('div');
        src.className = 'sources';
        src.innerText = 'Sources: ' + data.sources.join(', ');
        messages.appendChild(src);
      }
    } catch (err) {
      console.error('Chatbot fetch failed:', err);
      messages.lastChild.innerText = 'Network error: Failed to fetch. Check CORS and API endpoint.';
    }
  });
})();