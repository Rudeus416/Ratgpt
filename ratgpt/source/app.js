import { generateRatReply } from './rat.js';

// Keep original Chinese strings as stable keys for both static and dynamic UI.
const english = {
  '个人选项': 'Profile options', '语言': 'Language',
  'RatGPT · 吱无不言': 'RatGPT · A squeak for every thought',
  '跟 RatGPT 聊聊。千言万语，化作一声吱。': 'Chat with RatGPT. A thousand words, one little squeak.',
  '关闭侧边栏': 'Close sidebar', '对话侧边栏': 'Chat sidebar',
  '收起侧边栏': 'Collapse sidebar', '展开侧边栏': 'Open sidebar',
  '新对话': 'New chat', '最近对话': 'Recent chats',
  '第一声吱，从这里开始。': 'Your first squeak starts here.',
  '鼠鼠本鼠': 'Just a little rat', '吱无不言，言无不吱。': 'Every thought deserves a squeak.',
  '纯正鼠语': 'Pure ratspeak', '有什么想跟鼠鼠说的？': 'What’s on your mind?',
  '千言万语，化作一声吱。': 'A thousand words, one little squeak.',
  '聊天消息': 'Chat messages', '发送给 RatGPT 的消息': 'Message to RatGPT',
  '向 RatGPT 发送消息': 'Message RatGPT',
  'Enter 发送 · Shift + Enter 换行': 'Enter to send · Shift + Enter for a new line',
  '发送消息': 'Send message', '停止回复': 'Stop response', '试着问问': 'Try asking',
  '你好，鼠鼠！': 'Hello, little rat!', '你好，鼠鼠': 'Hello, little rat',
  '今天吃什么？': 'What should I eat today?', '帮我想个好点子。': 'Help me think of a good idea.',
  '帮我想个点子': 'Give me an idea', 'RatGPT 可能会吱错，但一定会吱。': 'RatGPT may squeak mistakes, but it will always squeak.',
  '你的消息': 'Your message', 'RatGPT 的回复': 'RatGPT’s response',
  '复制回复': 'Copy response', '已复制': 'Copied', '已复制回复': 'Response copied',
  '回复已选中，可以手动复制': 'Response selected. You can copy it manually.',
  '重新吱一次': 'Squeak again', '请输入 1–6000 个字符的消息。': 'Please enter a message of 1–6000 characters.',
  '请等待当前回复完成。': 'Please wait for the current response to finish.'
};
let language = 'zh-CN';
try { if (localStorage.getItem('ratgpt-language') === 'en') language = 'en'; } catch { /* Storage is optional. */ }
const t = value => language === 'en' ? (english[value] || value) : value;
const displayReply = value => language === 'en'
  ? value.split('，').map(phrase => Array.from(phrase, () => 'squeak').join(' ')).join(', ')
  : value;
// Capture bindings once so toggling never translates user-authored chat text.
const translations = [];
const hasTranslation = key => Object.prototype.hasOwnProperty.call(english, key);
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode;
  if (hasTranslation(node.textContent.trim())) {
    const original = node.textContent;
    translations.push(() => { node.textContent = original.replace(original.trim(), t(original.trim())); });
  }
}
document.querySelectorAll('[aria-label], [title], [placeholder], [data-prompt], meta[name="description"]').forEach(element => {
  for (const attribute of ['aria-label', 'title', 'placeholder', 'data-prompt', 'content']) {
    const original = element.getAttribute(attribute);
    if (hasTranslation(original)) translations.push(() => element.setAttribute(attribute, t(original)));
  }
});
const originalTitle = document.title;
function applyLanguage() {
  document.documentElement.lang = language;
  document.title = t(originalTitle);
  translations.forEach(update => update());
  byId('language-current').textContent = language === 'en' ? 'English' : '简体中文';
  document.querySelectorAll('[data-language]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  });
}

const byId = id => document.getElementById(id);
const app = byId('app');
const main = byId('main');
const sidebar = byId('sidebar');
const overlay = byId('overlay');
const prompt = byId('prompt');
const send = byId('send');
const log = byId('messages');
const scroller = byId('chat-scroll');
const mobile = matchMedia('(max-width: 760px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const sendIcon = send.innerHTML;
const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';
const retryIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"/></svg>';
let sequence = 0;
const sessions = [];
let active = makeSession();
let job = null;
let sidebarOpen = !mobile.matches;
let isComposing = false;

function makeSession() {
  return { id: ++sequence, title: '新对话', messages: [], draft: '' };
}

function setSidebar(open, restoreFocus = false) {
  if (!open) closeProfile();
  sidebarOpen = open;
  app.classList.toggle('sidebar-open', open);
  sidebar.inert = !open;
  main.inert = mobile.matches && open;
  overlay.hidden = !(mobile.matches && open);
  document.querySelectorAll('.sidebar-toggle').forEach(button => button.setAttribute('aria-expanded', String(open)));
  if (mobile.matches && open) sidebar.querySelector('button').focus();
  if (!open && restoreFocus) document.querySelector('.header-menu').focus();
}

function renderHistory() {
  const list = byId('history-list');
  list.replaceChildren();
  byId('history-empty').hidden = sessions.length > 0;
  for (const session of [...sessions].reverse()) {
    const button = document.createElement('button');
    button.className = 'history-item' + (session === active ? ' active' : '');
    button.textContent = session.title;
    button.title = session.title;
    if (session === active) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => {
      if (session !== active) {
        stopReply();
        active.draft = prompt.value;
        active = session;
        prompt.value = session.draft;
        renderConversation();
      }
      if (mobile.matches) setSidebar(false);
      prompt.focus();
    });
    list.append(button);
  }
}

function createTool(label, icon, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = icon;
  button.addEventListener('click', handler);
  return button;
}

function appendMessage(message, index) {
  const article = document.createElement('article');
  article.className = 'message ' + message.role;
  article.setAttribute('aria-label', t(message.role === 'user' ? '你的消息' : 'RatGPT 的回复'));
  if (message.role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'user-bubble';
    bubble.textContent = message.text;
    article.append(bubble);
    log.append(article);
    return null;
  }
  const label = document.createElement('div');
  label.className = 'assistant-label';
  label.innerHTML = '<span class="assistant-avatar" aria-hidden="true">吱</span><span>RatGPT</span>';
  label.firstElementChild.textContent = language === 'en' ? 'r' : '吱';
  const text = document.createElement('p');
  text.className = 'reply-text';
  text.textContent = displayReply(message.text);
  const actions = document.createElement('div');
  actions.className = 'message-tools';
  actions.append(createTool(t('复制回复'), copyIcon, async event => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(displayReply(message.text));
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      button.title = t('已复制');
      byId('announcement').textContent = t('已复制回复');
      setTimeout(() => { button.innerHTML = copyIcon; button.title = t('复制回复'); }, 1500);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(text);
      selection.removeAllRanges();
      selection.addRange(range);
      byId('announcement').textContent = t('回复已选中，可以手动复制');
    }
  }));
  if (index === active.messages.length - 1) {
    actions.append(createTool(t('重新吱一次'), retryIcon, () => {
      if (job) return;
      void animateReply(message, { text, actions }, generateRatReply());
    }));
  }
  article.append(label, text, actions);
  log.append(article);
  return { text, actions };
}

function renderConversation() {
  main.classList.toggle('is-empty', active.messages.length === 0);
  log.replaceChildren();
  active.messages.forEach(appendMessage);
  renderHistory();
  resizePrompt();
  updateSend();
  requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
}

function resizePrompt() {
  prompt.style.height = 'auto';
  prompt.style.height = Math.min(prompt.scrollHeight, 180) + 'px';
}

function updateSend() {
  send.disabled = !job && prompt.value.trim().length === 0;
  send.innerHTML = job ? '<span class="stop-icon" aria-hidden="true"></span>' : sendIcon;
  send.setAttribute('aria-label', t(job ? '停止回复' : '发送消息'));
  send.title = t(job ? '停止回复' : '发送消息');
}

function stopReply() {
  if (job) job.finish();
}

function animateReply(message, elements, answer) {
  stopReply();
  message.text = '吱';
  elements.text.textContent = displayReply(message.text);
  elements.text.classList.add('is-typing');
  elements.actions.hidden = true;
  log.setAttribute('aria-busy', 'true');
  let cursor = 1;
  const session = active;
  return new Promise(resolve => {
    let timer;
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      message.text = message.text.replace(/，+$/, '') || '吱';
      elements.text.textContent = displayReply(message.text);
      elements.text.classList.remove('is-typing');
      elements.actions.hidden = false;
      log.setAttribute('aria-busy', 'false');
      job = null;
      updateSend();
      byId('announcement').textContent = displayReply(message.text);
      resolve({ sessionId: session.id, reply: message.text });
    }
    function tick() {
      if (done) return;
      const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 130;
      cursor = reducedMotion.matches ? answer.length : Math.min(answer.length, cursor + 1 + Math.floor(Math.random() * 2));
      message.text = answer.slice(0, cursor);
      elements.text.textContent = displayReply(message.text);
      if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
      if (cursor === answer.length) finish();
      else timer = setTimeout(tick, 24 + Math.random() * 28);
    }
    job = { finish };
    updateSend();
    timer = setTimeout(tick, reducedMotion.matches ? 0 : 250);
  });
}

async function sendMessage(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 6000) throw new Error(t('请输入 1–6000 个字符的消息。'));
  if (job) throw new Error(t('请等待当前回复完成。'));
  const input = value.trim();
  if (active.messages.length === 0) {
    active.title = Array.from(input).slice(0, 20).join('');
    sessions.push(active);
  }
  active.messages.push({ role: 'user', text: input });
  const reply = { role: 'assistant', text: '' };
  active.messages.push(reply);
  prompt.value = '';
  active.draft = '';
  main.classList.remove('is-empty');
  log.replaceChildren();
  let elements;
  active.messages.forEach((message, index) => {
    const result = appendMessage(message, index);
    if (message === reply) elements = result;
  });
  resizePrompt();
  renderHistory();
  requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  return animateReply(reply, elements, generateRatReply());
}

function newChat() {
  stopReply();
  active.draft = prompt.value;
  active = makeSession();
  prompt.value = '';
  renderConversation();
  if (mobile.matches) setSidebar(false);
  prompt.focus();
  return { sessionId: active.id };
}

byId('composer').addEventListener('submit', event => {
  event.preventDefault();
  if (job) { stopReply(); return; }
  if (!prompt.value.trim()) return;
  void sendMessage(prompt.value).catch(error => { byId('announcement').textContent = error.message; });
});
prompt.addEventListener('input', () => { resizePrompt(); updateSend(); active.draft = prompt.value; });
prompt.addEventListener('compositionstart', () => { isComposing = true; });
prompt.addEventListener('compositionend', () => { isComposing = false; });
prompt.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isComposing && event.keyCode !== 229) {
    event.preventDefault();
    if (!job && prompt.value.trim()) byId('composer').requestSubmit();
  }
});
byId('new-chat').addEventListener('click', newChat);
document.querySelectorAll('.sidebar-toggle').forEach(button => button.addEventListener('click', () => setSidebar(!sidebarOpen, true)));
overlay.addEventListener('click', () => setSidebar(false, true));
mobile.addEventListener('change', () => setSidebar(!mobile.matches));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  if (!job) void sendMessage(button.dataset.prompt).catch(error => { byId('announcement').textContent = error.message; });
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !byId('profile-panel').hidden) {
    event.preventDefault();
    if (!byId('language-options').hidden) {
      byId('language-options').hidden = true;
      byId('language-toggle').setAttribute('aria-expanded', 'false');
      byId('language-toggle').focus();
    } else closeProfile(true);
    return;
  }
  if (!mobile.matches || !sidebarOpen) return;
  if (event.key === 'Escape') setSidebar(false, true);
  if (event.key === 'Tab') {
    const buttons = [...sidebar.querySelectorAll('button')].filter(button => button.getClientRects().length > 0);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

function closeProfile(restoreFocus = false) {
  byId('profile-panel').hidden = true;
  byId('profile-toggle').setAttribute('aria-expanded', 'false');
  byId('language-options').hidden = true;
  byId('language-toggle').setAttribute('aria-expanded', 'false');
  if (restoreFocus) byId('profile-toggle').focus();
}
byId('profile-toggle').addEventListener('click', () => {
  if (!byId('profile-panel').hidden) { closeProfile(); return; }
  byId('profile-panel').hidden = false;
  byId('profile-toggle').setAttribute('aria-expanded', 'true');
  byId('profile-new-chat').focus();
});
byId('language-toggle').addEventListener('click', () => {
  const options = byId('language-options');
  options.hidden = !options.hidden;
  byId('language-toggle').setAttribute('aria-expanded', String(!options.hidden));
});
byId('profile-new-chat').addEventListener('click', () => { closeProfile(); newChat(); });
document.addEventListener('click', event => {
  if (!byId('profile').contains(event.target)) closeProfile();
});
document.addEventListener('focusin', event => {
  if (!byId('profile').contains(event.target)) closeProfile();
});
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
  language = button.dataset.language;
  try { localStorage.setItem('ratgpt-language', language); } catch { /* Local files may disallow storage. */ }
  applyLanguage();
  if (job) {
    // Keep the active animation attached to its original elements.
    log.querySelectorAll('.message').forEach((article, index) => {
      const message = active.messages[index];
      article.setAttribute('aria-label', t(message.role === 'user' ? '你的消息' : 'RatGPT 的回复'));
      if (message.role === 'assistant') {
        article.querySelector('.reply-text').textContent = displayReply(message.text);
        article.querySelector('.assistant-avatar').textContent = language === 'en' ? 'r' : '吱';
        article.querySelectorAll('.message-tools button').forEach((button, toolIndex) => {
          button.title = t(toolIndex === 0 ? '复制回复' : '重新吱一次');
          button.setAttribute('aria-label', button.title);
        });
      }
    });
    updateSend();
  } else renderConversation();
  byId('announcement').textContent = '';
  closeProfile(true);
}));
applyLanguage();
setSidebar(!mobile.matches);
renderConversation();

// Optional structured access uses the exact same actions as the chat interface.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const context = document.modelContext;
  const tools = [
    {
      name: 'ratgpt_send_message',
      title: '与 RatGPT 聊天',
      description: 'Send one message to the current RatGPT chat and wait for its squeak-only reply to finish displaying.',
      inputSchema: { type: 'object', properties: { message: { type: 'string', minLength: 1, maxLength: 6000 } }, required: ['message'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'message')) throw new Error('Invalid input.');
        return sendMessage(input.message);
      }
    },
    {
      name: 'ratgpt_start_new_chat',
      title: '开始新对话',
      description: 'Start an empty RatGPT conversation while retaining earlier conversations in the current page session.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
        return newChat();
      }
    }
  ];
  for (const tool of tools) {
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); }
    catch { /* Chat remains usable if this experimental API is unavailable. */ }
  }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
