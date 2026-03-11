/**
 * Popup script - UI logic
 * Coordinates between crypto.js, vault.js, and the background service worker.
 */

// ===== State =====
let currentKey = null;
let allEntries = [];
let editingId = null;
let genFillCallback = null; // called when generator result should fill entry form

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  bindToggleVisibility();
  bindGeneratorEvents();
  bindEntryModalEvents();
  bindSettingsEvents();
  bindSearchEvents();
  await bootstrap();
});

async function bootstrap() {
  const exists = await vaultExists();
  if (!exists) {
    showScreen('setup');
    bindSetupEvents();
    return;
  }

  // Check if unlocked in background
  const { locked } = await bgSend({ type: 'IS_LOCKED' });
  if (!locked) {
    const { key } = await bgSend({ type: 'GET_KEY' });
    currentKey = key;
    await loadAndShowEntries();
  } else {
    showScreen('unlock');
    bindUnlockEvents();
  }
}

// ===== Screen management =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// ===== Setup =====
function bindSetupEvents() {
  const pwInput = document.getElementById('setup-password');
  pwInput.addEventListener('input', () => {
    updateStrength(pwInput.value, 'setup-strength-fill', 'setup-strength-label');
  });

  document.getElementById('btn-setup').addEventListener('click', handleSetup);
  document.getElementById('setup-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSetup();
  });
  document.getElementById('setup-confirm').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSetup();
  });
}

async function handleSetup() {
  const password = document.getElementById('setup-password').value;
  const confirm = document.getElementById('setup-confirm').value;
  const errorEl = document.getElementById('setup-error');

  hideEl(errorEl);

  if (password.length < 12) {
    return showError(errorEl, '主密码至少需要 12 位');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
    return showError(errorEl, '主密码需同时包含大写和小写字母');
  }
  if (!/[0-9]/.test(password)) {
    return showError(errorEl, '主密码需包含数字');
  }
  if (password !== confirm) {
    return showError(errorEl, '两次输入的密码不一致');
  }

  const btn = document.getElementById('btn-setup');
  btn.disabled = true;
  btn.textContent = '正在创建…';

  try {
    const key = await initVault(password);
    await bgSend({ type: 'SET_KEY', key });
    currentKey = key;
    await loadAndShowEntries();
  } catch (err) {
    showError(errorEl, '创建失败: ' + err.message);
    btn.disabled = false;
    btn.textContent = '创建密码库';
  }
}

// ===== Unlock =====
function bindUnlockEvents() {
  document.getElementById('btn-unlock').addEventListener('click', handleUnlock);
  document.getElementById('unlock-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleUnlock();
  });
  setTimeout(() => document.getElementById('unlock-password').focus(), 50);
}

async function handleUnlock() {
  const password = document.getElementById('unlock-password').value;
  const errorEl = document.getElementById('unlock-error');
  hideEl(errorEl);

  if (!password) return showError(errorEl, '请输入主密码');

  const btn = document.getElementById('btn-unlock');
  btn.disabled = true;
  btn.textContent = '解锁中…';

  try {
    const key = await unlockVault(password);
    await bgSend({ type: 'SET_KEY', key });
    currentKey = key;
    document.getElementById('unlock-password').value = '';
    await loadAndShowEntries();
  } catch (err) {
    if (err.message === 'WRONG_PASSWORD') {
      showError(errorEl, '主密码错误');
    } else {
      showError(errorEl, '解锁失败: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = '解锁';
    document.getElementById('unlock-password').select();
  }
}

// ===== Main screen =====
async function loadAndShowEntries() {
  showScreen('main');
  bindMainEvents();
  allEntries = await readEntries(currentKey);
  renderEntries(allEntries);
}

function bindMainEvents() {
  document.getElementById('btn-lock').addEventListener('click', handleLock);
  document.getElementById('btn-add-entry').addEventListener('click', openAddEntry);
  document.getElementById('btn-gen-only').addEventListener('click', () => openGenerator(null));
  document.getElementById('btn-settings').addEventListener('click', openSettings);
}

async function handleLock() {
  await bgSend({ type: 'LOCK' });
  currentKey = null;
  allEntries = [];
  showScreen('unlock');
  bindUnlockEvents();
}

// ===== Entry rendering =====
function renderEntries(entries) {
  const list = document.getElementById('entry-list');
  const empty = document.getElementById('empty-state');

  // Clear existing cards (keep empty-state)
  Array.from(list.children).forEach(child => {
    if (child.id !== 'empty-state') list.removeChild(child);
  });

  if (entries.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  entries.forEach(entry => {
    const card = createEntryCard(entry);
    list.appendChild(card);
  });
}

function createEntryCard(entry) {
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = entry.id;

  const initial = (entry.site || '?')[0].toUpperCase();
  card.innerHTML = `
    <div class="entry-favicon">${initial}</div>
    <div class="entry-info">
      <div class="entry-site">${escHtml(entry.site)}</div>
      <div class="entry-user">${escHtml(entry.username || '')}</div>
    </div>
    <div class="entry-actions">
      <button class="btn btn-icon btn-copy" title="复制密码">📋</button>
      <button class="btn btn-icon btn-edit" title="编辑">✏️</button>
      <button class="btn btn-icon btn-delete" title="删除">🗑️</button>
    </div>
  `;

  card.querySelector('.btn-copy').addEventListener('click', e => {
    e.stopPropagation();
    copyPassword(entry);
  });
  card.querySelector('.btn-edit').addEventListener('click', e => {
    e.stopPropagation();
    openEditEntry(entry);
  });
  card.querySelector('.btn-delete').addEventListener('click', e => {
    e.stopPropagation();
    confirmDeleteEntry(entry);
  });

  return card;
}

async function copyPassword(entry) {
  try {
    await navigator.clipboard.writeText(entry.password);
    showToast('密码已复制');
    // Clear clipboard after 30 seconds
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text === entry.password) await navigator.clipboard.writeText('');
      } catch {}
    }, 30000);
  } catch {
    showToast('复制失败，请手动复制');
  }
}

async function confirmDeleteEntry(entry) {
  if (!confirm(`确认删除 "${entry.site}" 的条目？`)) return;
  await deleteEntry(currentKey, entry.id);
  allEntries = allEntries.filter(e => e.id !== entry.id);
  renderEntries(filterEntries(document.getElementById('search-input').value));
}

// ===== Search =====
function bindSearchEvents() {
  document.getElementById('search-input').addEventListener('input', e => {
    renderEntries(filterEntries(e.target.value));
  });
}

function filterEntries(query) {
  if (!query.trim()) return allEntries;
  const q = query.toLowerCase();
  return allEntries.filter(e =>
    (e.site || '').toLowerCase().includes(q) ||
    (e.username || '').toLowerCase().includes(q) ||
    (e.notes || '').toLowerCase().includes(q)
  );
}

// ===== Add / Edit Entry Modal =====
function bindEntryModalEvents() {
  document.getElementById('modal-entry-close').addEventListener('click', closeEntryModal);
  document.getElementById('btn-entry-cancel').addEventListener('click', closeEntryModal);
  document.getElementById('btn-entry-save').addEventListener('click', handleSaveEntry);
  document.getElementById('btn-fill-gen').addEventListener('click', () => {
    openGenerator(password => {
      document.getElementById('entry-password').value = password;
      updateStrength(password, 'entry-strength-fill', 'entry-strength-label');
    });
  });

  const pwInput = document.getElementById('entry-password');
  pwInput.addEventListener('input', () => {
    updateStrength(pwInput.value, 'entry-strength-fill', 'entry-strength-label');
  });

  // Close modal on backdrop click
  document.getElementById('modal-entry').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-entry')) closeEntryModal();
  });
}

function openAddEntry() {
  editingId = null;
  document.getElementById('modal-entry-title').textContent = '添加条目';
  document.getElementById('entry-site').value = '';
  document.getElementById('entry-username').value = '';
  document.getElementById('entry-password').value = '';
  document.getElementById('entry-notes').value = '';
  document.getElementById('entry-strength-fill').style.width = '0';
  document.getElementById('entry-strength-label').textContent = '';
  hideEl(document.getElementById('entry-error'));
  document.getElementById('modal-entry').classList.remove('hidden');
  setTimeout(() => document.getElementById('entry-site').focus(), 50);
}

function openEditEntry(entry) {
  editingId = entry.id;
  document.getElementById('modal-entry-title').textContent = '编辑条目';
  document.getElementById('entry-site').value = entry.site || '';
  document.getElementById('entry-username').value = entry.username || '';
  document.getElementById('entry-password').value = entry.password || '';
  document.getElementById('entry-notes').value = entry.notes || '';
  updateStrength(entry.password || '', 'entry-strength-fill', 'entry-strength-label');
  hideEl(document.getElementById('entry-error'));
  document.getElementById('modal-entry').classList.remove('hidden');
}

function closeEntryModal() {
  document.getElementById('modal-entry').classList.add('hidden');
  editingId = null;
}

async function handleSaveEntry() {
  const site = document.getElementById('entry-site').value.trim();
  const username = document.getElementById('entry-username').value.trim();
  const password = document.getElementById('entry-password').value;
  const notes = document.getElementById('entry-notes').value.trim();
  const errorEl = document.getElementById('entry-error');

  hideEl(errorEl);

  if (!site) return showError(errorEl, '网站不能为空');
  if (!password) return showError(errorEl, '密码不能为空');

  const btn = document.getElementById('btn-entry-save');
  btn.disabled = true;
  btn.textContent = '保存中…';

  try {
    if (editingId) {
      const updated = await updateEntry(currentKey, editingId, { site, username, password, notes });
      const idx = allEntries.findIndex(e => e.id === editingId);
      if (idx !== -1) allEntries[idx] = updated;
    } else {
      const newEntry = await addEntry(currentKey, { site, username, password, notes });
      allEntries.unshift(newEntry);
    }
    closeEntryModal();
    renderEntries(filterEntries(document.getElementById('search-input').value));
  } catch (err) {
    showError(errorEl, '保存失败: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '保存';
  }
}

// ===== Password Generator Modal =====
function bindGeneratorEvents() {
  document.getElementById('modal-gen-close').addEventListener('click', closeGenerator);
  document.getElementById('btn-gen-refresh').addEventListener('click', refreshGenerator);
  document.getElementById('btn-gen-copy').addEventListener('click', () => {
    const pw = document.getElementById('gen-output').value;
    if (!pw) return;
    navigator.clipboard.writeText(pw).then(() => showToast('已复制'));
  });

  document.getElementById('gen-length').addEventListener('input', e => {
    document.getElementById('gen-length-val').textContent = e.target.value;
    refreshGenerator();
  });

  ['gen-upper','gen-lower','gen-numbers','gen-symbols'].forEach(id => {
    document.getElementById(id).addEventListener('change', refreshGenerator);
  });

  document.getElementById('modal-gen').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-gen')) closeGenerator();
  });
}

function openGenerator(fillCb) {
  genFillCallback = fillCb;
  document.getElementById('gen-error').classList.add('hidden');

  const fillBtn = document.getElementById('btn-fill-gen');
  // Show "Use this password" button only when opened from entry modal
  const useBtn = document.getElementById('modal-gen').querySelector('.btn-use-gen');
  if (useBtn) useBtn.remove();

  if (fillCb) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-full mt-8 btn-use-gen';
    btn.textContent = '使用此密码';
    btn.addEventListener('click', () => {
      fillCb(document.getElementById('gen-output').value);
      closeGenerator();
    });
    document.getElementById('btn-gen-refresh').parentNode.insertBefore(
      btn, document.getElementById('btn-gen-refresh').nextSibling
    );
  }

  document.getElementById('modal-gen').classList.remove('hidden');
  refreshGenerator();
}

function closeGenerator() {
  document.getElementById('modal-gen').classList.add('hidden');
  genFillCallback = null;
}

function refreshGenerator() {
  const errorEl = document.getElementById('gen-error');
  hideEl(errorEl);
  try {
    const pw = generatePassword({
      length: parseInt(document.getElementById('gen-length').value, 10),
      uppercase: document.getElementById('gen-upper').checked,
      lowercase: document.getElementById('gen-lower').checked,
      numbers: document.getElementById('gen-numbers').checked,
      symbols: document.getElementById('gen-symbols').checked,
    });
    document.getElementById('gen-output').value = pw;
    updateStrength(pw, 'gen-strength-fill', 'gen-strength-label');
  } catch (err) {
    showError(errorEl, err.message);
  }
}

// ===== Settings Modal =====
function bindSettingsEvents() {
  document.getElementById('modal-settings-close').addEventListener('click', closeSettings);
  document.getElementById('modal-settings').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-settings')) closeSettings();
  });

  const newPwInput = document.getElementById('settings-new-pw');
  newPwInput.addEventListener('input', () => {
    updateStrength(newPwInput.value, 'settings-strength-fill', 'settings-strength-label');
  });

  document.getElementById('btn-change-pw').addEventListener('click', handleChangePw);
  document.getElementById('btn-delete-vault').addEventListener('click', handleDeleteVault);
}

function openSettings() {
  hideEl(document.getElementById('settings-error'));
  hideEl(document.getElementById('settings-success'));
  document.getElementById('settings-current-pw').value = '';
  document.getElementById('settings-new-pw').value = '';
  document.getElementById('settings-confirm-pw').value = '';
  document.getElementById('settings-strength-fill').style.width = '0';
  document.getElementById('settings-strength-label').textContent = '';
  document.getElementById('modal-settings').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('modal-settings').classList.add('hidden');
}

async function handleChangePw() {
  const currentPw = document.getElementById('settings-current-pw').value;
  const newPw = document.getElementById('settings-new-pw').value;
  const confirmPw = document.getElementById('settings-confirm-pw').value;
  const errorEl = document.getElementById('settings-error');
  const successEl = document.getElementById('settings-success');

  hideEl(errorEl); hideEl(successEl);

  if (!currentPw) return showError(errorEl, '请输入当前主密码');
  if (newPw.length < 12) return showError(errorEl, '新主密码至少需要 12 位');
  if (newPw !== confirmPw) return showError(errorEl, '两次输入的新密码不一致');

  const btn = document.getElementById('btn-change-pw');
  btn.disabled = true;
  btn.textContent = '更新中…';

  try {
    // Verify current password
    const verifyKey = await unlockVault(currentPw);
    // Re-encrypt vault with new password
    const newKey = await changeMasterPassword(verifyKey, newPw);
    await bgSend({ type: 'SET_KEY', key: newKey });
    currentKey = newKey;
    successEl.textContent = '主密码已成功更新';
    successEl.classList.remove('hidden');
    document.getElementById('settings-current-pw').value = '';
    document.getElementById('settings-new-pw').value = '';
    document.getElementById('settings-confirm-pw').value = '';
  } catch (err) {
    if (err.message === 'WRONG_PASSWORD') {
      showError(errorEl, '当前主密码错误');
    } else {
      showError(errorEl, '更新失败: ' + err.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '更新主密码';
  }
}

async function handleDeleteVault() {
  if (!confirm('确认删除整个密码库？此操作不可恢复！')) return;
  if (!confirm('再次确认：所有密码将永久删除，无法找回。确认删除？')) return;

  await chrome.storage.local.clear();
  await bgSend({ type: 'LOCK' });
  currentKey = null;
  closeSettings();
  showScreen('setup');
  bindSetupEvents();
}

// ===== Toggle password visibility =====
function bindToggleVisibility() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.toggle-vis');
    if (!btn) return;
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
}

// ===== Strength indicator =====
function updateStrength(password, fillId, labelId) {
  if (!password) {
    document.getElementById(fillId).style.width = '0';
    document.getElementById(labelId).textContent = '';
    return;
  }
  const { score, label, color } = checkStrength(password);
  const fill = document.getElementById(fillId);
  fill.style.width = `${(score / 5) * 100}%`;
  fill.style.backgroundColor = color;
  const labelEl = document.getElementById(labelId);
  labelEl.textContent = label;
  labelEl.style.color = color;
}

// ===== Background communication =====
async function bgSend(message) {
  return chrome.runtime.sendMessage(message);
}

// ===== Toast =====
function showToast(text) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
      background: '#334155', color: '#f1f5f9', padding: '8px 16px', borderRadius: '8px',
      fontSize: '13px', zIndex: '9999', transition: 'opacity 0.3s ease', pointerEvents: 'none',
    });
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// ===== Utilities =====
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideEl(el) { el.classList.add('hidden'); }
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
