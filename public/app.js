(() => {
  // ---------- Telegram Mini App bootstrap ----------
  const tg = window.Telegram?.WebApp;
  let tgId = null;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#14141a'); } catch (e) {}
    try { tg.setBackgroundColor('#14141a'); } catch (e) {}
    tgId = tg.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null;
  }

  // ---------- anonymous local identity (not a real identity, just a session key) ----------
  const STORAGE_KEY = 'kabut_visitor_id';
  let visitorId = localStorage.getItem(STORAGE_KEY);
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE_KEY, visitorId);
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const idleScreen = $('idleScreen');
  const chatScreen = $('chatScreen');
  const findBtn = $('findBtn');
  const cancelBtn = $('cancelBtn');
  const radar = $('radar');
  const idleTitle = $('idleTitle');
  const idleSubtitle = $('idleSubtitle');
  const messagesEl = $('messages');
  const msgInput = $('msgInput');
  const sendBtn = $('sendBtn');
  const roomIdLabel = $('roomIdLabel');
  const typingIndicator = $('typingIndicator');
  const onlineCount = $('onlineCount');
  const rulesCard = $('rulesCard');
  const rulesClose = $('rulesClose');
  const menuBtn = $('menuBtn');
  const actionsBtn = $('actionsBtn');
  const sheetOverlay = $('sheetOverlay');
  const sheetCancelBtn = $('sheetCancelBtn');
  const nextBtn = $('nextBtn');
  const stopBtn = $('stopBtn');
  const reportVulgarBtn = $('reportVulgarBtn');
  const reportMinorBtn = $('reportMinorBtn');
  const toast = $('toast');

  rulesClose.addEventListener('click', () => rulesCard.classList.add('hidden'));

  function showToast(text, ms = 2200) {
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), ms);
  }

  function openSheet() { sheetOverlay.classList.remove('hidden'); }
  function closeSheet() { sheetOverlay.classList.add('hidden'); }
  menuBtn.addEventListener('click', openSheet);
  actionsBtn.addEventListener('click', openSheet);
  sheetCancelBtn.addEventListener('click', closeSheet);
  sheetOverlay.addEventListener('click', (e) => { if (e.target === sheetOverlay) closeSheet(); });

  // ---------- socket ----------
  const socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    socket.emit('hello', { visitorId, tgId });
  });

  socket.on('online_count', ({ online }) => {
    onlineCount.textContent = online.toLocaleString('id-ID');
  });

  socket.on('searching', () => {
    radar.classList.add('searching');
    idleTitle.textContent = 'Mencari lawan bicara…';
    idleSubtitle.textContent = 'Biasanya cuma butuh beberapa detik.';
    findBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
  });

  let currentRoom = null;

  socket.on('matched', ({ roomId }) => {
    currentRoom = roomId;
    messagesEl.innerHTML = '';
    roomIdLabel.textContent = 'room · ' + roomId;
    addSystemMessage('Tersambung. Bilang hai 👋');
    switchToChatScreen();
  });

  socket.on('message', ({ from, text }) => {
    addMessage(from, text);
  });

  socket.on('partner_typing', () => {
    typingIndicator.classList.remove('hidden');
    clearTimeout(socket._typingTimer);
    socket._typingTimer = setTimeout(() => typingIndicator.classList.add('hidden'), 1800);
  });

  socket.on('partner_left', () => {
    addSystemMessage('Lawan bicara mengakhiri obrolan.');
  });

  socket.on('chat_ended', () => {
    currentRoom = null;
    resetIdleScreen();
    switchToIdleScreen();
  });

  socket.on('report_received', () => {
    showToast('Laporan diterima. Terima kasih.');
  });

  socket.on('disconnect', () => {
    showToast('Koneksi terputus, menyambung ulang…');
  });

  // ---------- screen switching ----------
  function switchToChatScreen() {
    idleScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    msgInput.focus();
  }
  function switchToIdleScreen() {
    chatScreen.classList.add('hidden');
    idleScreen.classList.remove('hidden');
  }
  function resetIdleScreen() {
    radar.classList.remove('searching');
    idleTitle.textContent = 'Ngobrol tanpa nama';
    idleSubtitle.textContent = 'Kamu akan disambungkan ke satu orang asing, acak. Tidak ada riwayat, tidak ada identitas.';
    findBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
  }

  // ---------- messages ----------
  function addMessage(from, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + (from === 'me' ? 'me' : 'partner');
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg system';
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------- actions ----------
  findBtn.addEventListener('click', () => socket.emit('find_partner'));
  cancelBtn.addEventListener('click', () => {
    socket.emit('cancel_search');
    resetIdleScreen();
  });

  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentRoom) return;
    socket.emit('message', { text });
    msgInput.value = '';
    msgInput.style.height = 'auto';
  }
  sendBtn.addEventListener('click', sendMessage);
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else {
      socket.emit('typing');
    }
  });
  msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 110) + 'px';
  });

  nextBtn.addEventListener('click', () => {
    closeSheet();
    socket.emit('next');
    switchToIdleScreen();
  });
  stopBtn.addEventListener('click', () => {
    closeSheet();
    socket.emit('stop');
  });
  reportVulgarBtn.addEventListener('click', () => {
    socket.emit('report', { reason: 'vulgar_sange' });
    closeSheet();
  });
  reportMinorBtn.addEventListener('click', () => {
    socket.emit('report', { reason: 'underage' });
    closeSheet();
  });
})();