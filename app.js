const defaultConfig = {
  app_title: 'Pemilihan Pegawai Terbaik & Indisipliner',
  company_name: 'LAPAS PEREMPUAN KELAS III TERNATE'
};

let config = { ...defaultConfig };
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let currentCategory = 'terbaik';
let allVotes = [];
let pendingVote = null;
let currentSurveyPeriod = 'Triwulan I 2026';
let publicationStatus = 'Draft';
let mockEmployees = [];
let validUsers = [];
let currentUploadTargetId = null;
let activeAdminTab = 'results';

const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYESgH8fhZbSWwCtvesJ6e61-HbLVux3_IqbXu-dkWDkE_naAxyHtUTqxLdAqMbL68/exec";

// SDK implementation
window.dataSdk = {
  async create(data) {
    try {
      const action = data.photo_url ? 'savePhoto' : 'saveVote';
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action, ...data })
      });
      const result = await response.json();
      if (result.status === 'success') {
        await loadAppData(); 
        return { isOk: true };
      }
      return { isOk: false, error: result.message };
    } catch (e) {
      console.error('Create record error:', e);
      return { isOk: false, error: e.message };
    }
  },
  async update(data) {
    try {
      const action = data.action || 'updateVote';
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action, ...data })
      });
      const result = await response.json();
      return { isOk: result.status === 'success', error: result.message };
    } catch (e) {
      console.error('Update record error:', e);
      return { isOk: false, error: e.message };
    }
  },
  async delete(data) {
    try {
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'deleteVote', ...data })
      });
      const result = await response.json();
      return { isOk: result.status === 'success', error: result.message };
    } catch (e) {
      console.error('Delete record error:', e);
      return { isOk: false, error: e.message };
    }
  }
};

const normalizeCategory = (cat) => {
  if (!cat) return "";
  return cat.toString().toLowerCase().trim();
};

async function loadAppData() {
  try {
    const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=getAllData`);
    const data = await response.json();
    
    if (data.employees) {
      mockEmployees = data.employees.map(emp => {
        let photoUrl = convertGoogleDriveUrl(emp.photo_url || emp.foto_url || emp.Photo_URL);
        const name = emp.name || emp.nama || emp.Nama || 'Tanpa Nama';
        const position = emp.position || emp.jabatan || emp.Jabatan || '';
        
        // Multi-category support
        const cats = new Set();
        const mainCat = normalizeCategory(emp.kategori || emp.Kategori);
        if (mainCat) mainCat.split(',').forEach(c => cats.add(normalizeCategory(c)));
        
        // Check for separate columns
        if (emp.terbaik || emp.Terbaik || emp.is_terbaik === true || String(emp.terbaik).toUpperCase() === 'YA') cats.add('terbaik');
        if (emp.indisipliner || emp.Indisipliner || emp.is_indisipliner === true || String(emp.indisipliner).toUpperCase() === 'YA') cats.add('indisipliner');
        
        if (photoUrl) console.log(`[Photo Debug] ${name} (ID: ${emp.id || emp.ID}): ${photoUrl}`);

        return { 
          ...emp, 
          id: String(emp.id || emp.ID || '').trim(),
          name, 
          position, 
          categories: Array.from(cats),
          photo: photoUrl || getEmojiForPosition(position), 
          isPhotoUrl: !!photoUrl 
        };
      });
      console.log('[Debug] Available Employee IDs:', mockEmployees.map(e => e.id));
    }
    
    if (data.reasons) {
      const newReasons = { terbaik: [], indisipliner: [] };
      data.reasons.forEach(r => {
        const cat = normalizeCategory(r.category || r.kategori);
        if (newReasons[cat]) newReasons[cat].push({ alasan: r.alasan });
      });
      reasonsOptions = newReasons;
    }
    
    if (data.votes) {
      allVotes = data.votes;
      updateVotedCount();
      if (document.getElementById('adminView')) updateAdminDashboard();
    }
    
    if (data.users) {
      validUsers = data.users;
    }

    if (data.config) {
      if (data.config.survey_period) {
        currentSurveyPeriod = data.config.survey_period;
        localStorage.setItem('currentSurveyPeriod', currentSurveyPeriod);
      }
      if (data.config.publication_status) {
        publicationStatus = data.config.publication_status;
        if (document.getElementById('publicationStatus')) {
          document.getElementById('publicationStatus').textContent = publicationStatus;
        }
      }
      updateUIText();
    }

    if (document.getElementById('adminView')) {
      updateAdminDashboard();
      if (activeAdminTab === 'selectEmployee') renderSelectEmployeeTab();
      else if (activeAdminTab === 'reasons') renderReasonsList();
      else if (activeAdminTab === 'users') renderUsersTable();
      else if (activeAdminTab === 'history') renderHistoryTab();
      else if (activeAdminTab === 'photo') renderPhotoTab();
      else if (activeAdminTab === 'publish') renderArchive();
    }
    
    updatePublishDisplay();
  } catch (error) {
    console.error('Error loading app data:', error);
  }
}

function convertGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // Strip all whitespace characters (spaces, line breaks, etc.)
  const cleanUrl = url.replace(/\s/g, '');
  
  // Extract ID from various Drive URL formats
  const idMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/) || 
                  idMatchFromIdParam(cleanUrl) ||
                  cleanUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
                  
  if (idMatch && idMatch[1]) {
    return `https://docs.google.com/uc?id=${idMatch[1]}`;
  }
  
  if (cleanUrl.includes('drive.google.com/uc') || cleanUrl.includes('docs.google.com/uc')) return cleanUrl;
  if (cleanUrl.startsWith('data:') || cleanUrl.startsWith('http')) return cleanUrl;
  
  // If it's just an ID-like string with no URL pattern
  if (cleanUrl.length > 20 && /^[a-zA-Z0-9-_]+$/.test(cleanUrl)) {
    return `https://docs.google.com/uc?id=${cleanUrl}`;
  }
  
  return null;
}

function idMatchFromIdParam(url) {
  const match = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  return match;
}

function getEmojiForPosition(position) {
  const emojiMap = {
    'Manager': '👨‍💼', 'Developer': '👩‍💻', 'Designer': '👨‍🎨',
    'HR': '👩‍💼', 'Finance': '👨‍💼', 'default': '👤'
  };
  return emojiMap[position] || emojiMap['default'];
}

let reasonsOptions = { terbaik: [], indisipliner: [] };
const adminCredentials = { username: 'indra', password: 'abdrachman' };

function initializeSurvey() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  let quarter = (month >= 1 && month <= 3) ? 'I' : (month >= 4 && month <= 6) ? 'II' : (month >= 7 && month <= 9) ? 'III' : 'IV';
  
  if (!localStorage.getItem('currentSurveyPeriod')) {
    currentSurveyPeriod = `Triwulan ${quarter} ${year}`;
    localStorage.setItem('currentSurveyPeriod', currentSurveyPeriod);
  }
  updateUIText();

  const tahunSelect = document.getElementById('surveyTahun');
  if (tahunSelect) {
    tahunSelect.innerHTML = '<option value="">-- Pilih Tahun --</option>';
    for (let y = year; y <= year + 5; y++) {
      const option = document.createElement('option');
      option.value = y;
      option.textContent = y;
      tahunSelect.appendChild(option);
    }
  }
}

function updateUIText() {
  const ids = ['loginTitle', 'companyNameLogin', 'votingSurveyPeriod', 'adminSurveyPeriod', 'homeSurveyPeriod', 'homeTitle', 'companyNameHome'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id.includes('Title')) el.textContent = (id === 'homeTitle' ? 'Portal ' : '') + config.app_title;
    else if (id.includes('companyName')) el.textContent = config.company_name;
    else if (id.includes('SurveyPeriod')) el.textContent = currentSurveyPeriod;
  });
}

function updateVotedCount() {
  const el = document.getElementById('votedCount');
  if (el && currentUser) {
    const currentPeriodVotes = allVotes.filter(v => (v.survey_period || 'Current') === currentSurveyPeriod);
    const userVotes = currentPeriodVotes.filter(v => v.voter_id === currentUser.id);
    el.textContent = new Set(userVotes.map(v => v.category)).size;
  }
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  const theme = type === 'success' ? { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700' } : { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-700' };
  
  notification.className = `fixed top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] animate-slide-in max-w-sm w-full mx-4`;
  notification.innerHTML = `<div class="${theme.bg} border-l-4 ${theme.border} p-6 rounded-lg shadow-xl"><p class="font-bold ${theme.text} text-lg">${message}</p></div>`;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
}

function checkSession() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'voting.html' && (!currentUser || currentUser.role !== 'user')) window.location.href = 'login.html';
  else if (path === 'admin.html' && (!currentUser || currentUser.role !== 'admin')) window.location.href = 'login-admin.html';
  else if (path === 'login.html' && currentUser) window.location.href = currentUser.role === 'admin' ? 'admin.html' : 'voting.html';
}

// Initialization
(async () => {
  checkSession();
  initializeSurvey();
  await loadAppData();
  updateUIText();
  setInterval(loadAppData, 30000);
  
  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'voting.html') renderEmployees();
  else if (path === 'admin.html') updateAdminDashboard();
  else if (path === 'index.html') updatePublishDisplay();
  
  if (window.lucide) window.lucide.createIcons();
})();

// Login Logic
if (document.getElementById('loginBtn')) {
  document.getElementById('loginBtn').addEventListener('click', e => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const err = document.getElementById('loginError');
    const path = window.location.pathname.split('/').pop() || 'index.html';

    if (path === 'login-admin.html') {
      if (user === adminCredentials.username && pass === adminCredentials.password) {
        currentUser = { id: 'admin', name: 'Admin', role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        window.location.href = 'admin.html';
      } else {
        err.textContent = 'Username atau password admin salah';
        err.classList.remove('hidden');
      }
    } else {
      const match = validUsers.find(u => u.username.toLowerCase() === user.toLowerCase() && u.password === pass);
      if (match) {
        currentUser = { id: match.id, name: match.name, role: 'user' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        window.location.href = 'voting.html';
      } else {
        err.textContent = 'Username atau password pemilih salah';
        err.classList.remove('hidden');
      }
    }
  });
  document.getElementById('closeLoginBtn').addEventListener('click', () => window.location.href = 'index.html');
}

// Home Page Logic
if (document.getElementById('voteAgainBtn')) {
  document.getElementById('voteAgainBtn').addEventListener('click', () => {
    window.location.href = 'login.html';
  });
}
if (document.getElementById('adminLoginBtn')) {
  document.getElementById('adminLoginBtn').addEventListener('click', () => {
    window.location.href = 'login-admin.html';
  });
}

// Voting Logic
if (document.getElementById('votingView')) {
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.category-btn').forEach(b => { b.classList.remove('bg-white/40'); b.classList.add('bg-white/20'); });
      this.classList.replace('bg-white/20', 'bg-white/40');
      currentCategory = this.dataset.category;
      document.getElementById('votingTitle').textContent = `Pilih Pegawai ${currentCategory === 'terbaik' ? 'Terbaik' : 'Indisipliner'}`;
      renderEmployees();
    });
  });
  
  const logoutVotingBtn = document.getElementById('logoutVotingBtn');
  if (logoutVotingBtn) {
    logoutVotingBtn.addEventListener('click', () => {
      const v = allVotes.filter(v => (v.survey_period || 'Current') === currentSurveyPeriod && v.voter_id === currentUser.id);
      if (new Set(v.map(v => v.category)).size < 2) showVotingWarning(new Set(v.map(v => v.category)));
      else logout();
    });
  }

  window.showConfirmation = (empId, empName) => {
    pendingVote = { empId, empName };
    document.getElementById('confirmEmpName').textContent = empName;
    document.getElementById('confirmCategory').textContent = currentCategory === 'terbaik' ? 'Pegawai Terbaik' : 'Pegawai Indisipliner';
    document.getElementById('confirmationModal').classList.remove('hidden');
  };

  if (document.getElementById('confirmCancel')) {
    document.getElementById('confirmCancel').addEventListener('click', () => { document.getElementById('confirmationModal').classList.add('hidden'); pendingVote = null; });
  }
  
  if (document.getElementById('confirmContinue')) {
    document.getElementById('confirmContinue').addEventListener('click', () => {
      const sel = document.getElementById('reasonSelect');
      sel.innerHTML = '<option value="">-- Pilih alasan --</option>';
      (reasonsOptions[currentCategory] || []).forEach(r => { const opt = document.createElement('option'); opt.value = r.alasan; opt.textContent = r.alasan; sel.appendChild(opt); });
      document.getElementById('reasonEmpName').textContent = pendingVote.empName;
      document.getElementById('reasonCategory').textContent = `Kategori: ${currentCategory === 'terbaik' ? 'Pegawai Terbaik' : 'Pegawai Indisipliner'}`;
      document.getElementById('reasonModal').classList.remove('hidden');
      document.getElementById('confirmationModal').classList.add('hidden');
    });
  }

  if (document.getElementById('reasonCancel')) {
    document.getElementById('reasonCancel').addEventListener('click', () => { document.getElementById('reasonModal').classList.add('hidden'); document.getElementById('confirmationModal').classList.remove('hidden'); });
  }
  
  if (document.getElementById('reasonSubmit')) {
    document.getElementById('reasonSubmit').addEventListener('click', async () => {
      const r = document.getElementById('reasonSelect').value.trim();
      if (!r) return showNotification('Pilih alasan terlebih dahulu', 'error');
      const result = await dataSdk.create({
        voter_id: currentUser.id, voter_name: currentUser.name, employee_id: String(pendingVote.empId),
        employee_name: pendingVote.empName, category: currentCategory, reason: r,
        timestamp: new Date().toISOString(), survey_period: currentSurveyPeriod
      });
      if (result.isOk) { document.getElementById('reasonModal').classList.add('hidden'); renderEmployees(); pendingVote = null; showNotification('Vote berhasil disimpan!', 'success'); }
      else showNotification('Gagal menyimpan vote', 'error');
    });
  }
}

function renderEmployees() {
  const grid = document.getElementById('employeesGrid');
  if (!grid) return;
  const targetCat = normalizeCategory(currentCategory);
  const filtered = mockEmployees.filter(e => e.categories && e.categories.includes(targetCat));
  grid.innerHTML = '';
  if (filtered.length === 0) {
    document.getElementById('noEmployeesMsg').innerHTML = `<div class="text-center py-12 space-y-4"><div class="text-6xl">📋</div><p class="text-gray-700 text-lg font-semibold">Admin belum menambahkan peserta nominasi</p><p class="text-gray-500 text-sm">Kategori: <strong>${currentCategory === 'terbaik' ? 'Pegawai Terbaik' : 'Pegawai Indisipliner'}</strong></p></div>`;
    document.getElementById('noEmployeesMsg').classList.remove('hidden');
    return;
  }
  document.getElementById('noEmployeesMsg').classList.add('hidden');
  filtered.forEach(emp => {
    const v = allVotes.find(v => (v.survey_period || 'Current') === currentSurveyPeriod && v.voter_id === currentUser?.id && v.category === currentCategory);
    const voted = v && v.employee_id === String(emp.id);
    const hasVoted = !!v;
    const card = document.createElement('div');
    card.className = 'vote-card bg-white rounded-xl shadow-md overflow-hidden';
    card.innerHTML = `
      <div class="aspect-square bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center relative overflow-hidden">
        ${emp.isPhotoUrl ? `
          <img src="${emp.photo}" class="w-full h-full object-cover" onerror="this.classList.add('hidden'); this.nextElementSibling.classList.remove('hidden');">
          <div class="hidden flex items-center justify-center w-full h-full bg-gray-100"><span class="text-6xl">${getEmojiForPosition(emp.position)}</span></div>
        ` : `<span class="text-6xl">${emp.photo}</span>`}
        ${voted ? `<div class="absolute inset-0 flex items-center justify-center bg-${currentCategory === 'indisipliner' ? 'red' : 'green'}-500/20"><span class="text-5xl text-${currentCategory === 'indisipliner' ? 'red' : 'green'}-600 font-bold">✓</span></div>` : ''}
      </div>
      <div class="p-4">
        <h3 class="font-bold text-gray-800 truncate">${emp.name}</h3>
        <p class="text-gray-500 text-xs truncate">${emp.position}</p>
        <button class="w-full mt-3 ${voted ? 'bg-gray-400' : hasVoted ? 'bg-gray-300' : 'bg-blue-600'} text-white py-2 rounded-lg" ${hasVoted && !voted ? 'disabled' : ''} onclick="${hasVoted && !voted ? '' : `showConfirmation(${emp.id}, '${emp.name.replace(/'/g, "\\'")}')`}">
          ${voted ? '✓ Sudah Voting' : hasVoted ? 'Sudah Memilih' : 'Pilih'}
        </button>
      </div>`;
    grid.appendChild(card);
  });
}

function updatePublishDisplay() {
  console.log('[Debug] updatePublishDisplay called');
  const bestContainer = document.getElementById('publishedBestEmployee');
  const undContainer = document.getElementById('publishedUndisciplined');
  if (!bestContainer) return;

  const status = (publicationStatus || 'Draft').toLowerCase().trim();
  console.log('[Debug] Status:', status, 'Period:', currentSurveyPeriod);

  if (status !== 'published') {
    const draftHtml = '<div class="flex flex-col items-center justify-center h-full text-center p-8"><span class="text-4xl mb-4">⌛</span><p class="text-gray-500 font-medium">Hasil voting sedang diproses.<br><span class="text-sm opacity-75">Akan diumumkan setelah survey berakhir.</span></p></div>';
    bestContainer.innerHTML = draftHtml;
    if (undContainer) undContainer.innerHTML = draftHtml;
    return;
  }

  const periodNorm = (currentSurveyPeriod || '').trim();
  const currentVotes = allVotes.filter(v => ((v.survey_period || 'Current').trim()) === periodNorm);
  console.log('[Debug] Found votes for period:', currentVotes.length);

  // Tally votes and store names as fallback
  const tally = (votes, category) => {
    const counts = {};
    const names = {};
    votes.filter(v => v.category === category).forEach(v => {
      const id = String(v.employee_id || '').trim();
      counts[id] = (counts[id] || 0) + 1;
      if (v.employee_name) names[id] = v.employee_name;
    });
    return { counts, names };
  };

  const bestData = tally(currentVotes, 'terbaik');
  const undData = tally(currentVotes, 'indisipliner');
  
  const render = (container, data, color) => {
    if (!container) return;
    const sorted = Object.entries(data.counts).sort((a,b) => b[1]-a[1]).slice(0,3);
    console.log(`[Debug] Rendering ${color} winners:`, sorted.length);
    
    container.innerHTML = sorted.length ? '' : '<p class="text-gray-500 text-center py-8">Belum ada data pemenang untuk periode ini</p>';
    
    sorted.forEach(item => {
      const id = String(item[0]);
      const score = item[1];
      let emp = mockEmployees.find(e => String(e.id).trim() === id);
      
      // Fallback: If ID match fails, try Match by Name
      if (!emp && data.names[id]) {
        const fallbackName = data.names[id];
        emp = mockEmployees.find(e => e.name === fallbackName);
        if (emp) console.log(`[Debug] Matched by name fallback: ${fallbackName}`);
      }

      const displayName = emp ? emp.name : (data.names[id] || 'Pegawai Tidak Dikenal');
      const displayPos = emp ? emp.position : 'Staf';
      const displayPhoto = emp ? emp.photo : getEmojiForPosition(displayPos);
      const isPhoto = emp ? emp.isPhotoUrl : false;
      
      const card = document.createElement('div');
      card.className = `bg-white rounded-3xl overflow-hidden mb-8 shadow-xl border border-gray-100 transition-all hover:scale-[1.02] transform animate-scale-in`;
      card.innerHTML = `
        <div class="aspect-square w-full bg-gray-100 relative group">
          ${isPhoto ? `
            <img src="${displayPhoto}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\'flex items-center justify-center h-full w-full bg-gray-50\'><span class=\'text-6xl\'>👤</span></div>';">
          ` : `<div class="flex items-center justify-center h-full w-full bg-gray-50"><span class="text-6xl">${displayPhoto}</span></div>`}
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
          <div class="absolute bottom-4 left-4 right-4 text-white">
             <div class="flex items-center gap-2 mb-1">
               <span class="bg-${color}-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-lg">Ranking ${item[0] == sorted[0][0] ? '1' : sorted.indexOf(item) + 1}</span>
             </div>
             <h3 class="text-xl font-bold truncate">${displayName}</h3>
          </div>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID / NIP</p>
              <p class="text-sm font-semibold text-gray-700 truncate">${id}</p>
            </div>
            <div class="space-y-1">
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Jabatan</p>
              <p class="text-sm font-semibold text-gray-700 truncate">${displayPos}</p>
            </div>
          </div>
          
          <div class="pt-4 border-t border-gray-50 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-400">Total Suara</span>
            <div class="flex items-center gap-2">
              <span class="text-2xl font-black text-${color == 'amber' ? 'yellow' : 'red'}-600">${score}</span>
              <span class="text-xs font-bold text-gray-400 uppercase">Suara</span>
            </div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  };
  
  render(bestContainer, bestData, 'amber');
  render(undContainer, undData, 'red');
}

// Admin Logic
if (document.getElementById('adminView')) {
  document.getElementById('logoutAdminBtn').addEventListener('click', logout);
  const tabs = ['Results', 'History', 'Publish', 'SelectEmployee', 'Reasons', 'Users', 'Photo', 'Survey'];
  tabs.forEach(t => document.getElementById(`adminTab${t}`).addEventListener('click', () => switchAdminTab(t.charAt(0).toLowerCase() + t.slice(1))));

  // Synchronization listeners
  const publishBtn = document.getElementById('publishBtn');
  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      const originalText = publishBtn.textContent;
      publishBtn.disabled = true;
      publishBtn.textContent = 'Memproses...';
      const res = await dataSdk.update({ action: 'publishResults', status: 'Published' });
      if (res.isOk) {
        showNotification('Hasil berhasil dipublikasikan!', 'success');
        document.getElementById('publicationStatus').textContent = 'Published';
      } else {
        showNotification('Gagal mempublikasikan: ' + res.error, 'error');
      }
      publishBtn.disabled = false;
      publishBtn.textContent = originalText;
    });
  }

  const confirmNewSurveyBtn = document.getElementById('confirmNewSurveyBtn');
  if (confirmNewSurveyBtn) {
    confirmNewSurveyBtn.addEventListener('click', async () => {
      const q = document.getElementById('surveyTriwulan').value;
      const y = document.getElementById('surveyTahun').value;
      if (!y) return showNotification('Pilih tahun survey', 'error');
      
      const newPeriod = `Triwulan ${q} ${y}`;
      if (!confirm(`Buat survey baru untuk ${newPeriod}? Semua data voting saat ini akan tetap tersimpan di riwayat.`)) return;

      const originalText = confirmNewSurveyBtn.textContent;
      confirmNewSurveyBtn.disabled = true;
      confirmNewSurveyBtn.textContent = 'Memproses...';
      
      const res = await dataSdk.update({ action: 'startNewSurvey', survey_period: newPeriod });
      if (res.isOk) {
        currentSurveyPeriod = newPeriod;
        localStorage.setItem('currentSurveyPeriod', newPeriod);
        await loadAppData();
        updateUIText();
        showNotification('Survey baru berhasil dibuat!', 'success');
      } else {
        showNotification('Gagal membuat survey: ' + res.error, 'error');
      }
      confirmNewSurveyBtn.disabled = false;
      confirmNewSurveyBtn.textContent = originalText;
    });
  }
}

function switchAdminTab(t) {
  activeAdminTab = t;
  const tabs = { results: 'adminResultsTab', history: 'adminHistoryTab', publish: 'adminPublishTab', selectEmployee: 'adminSelectEmployeeTab', reasons: 'adminReasonsTab', users: 'adminUsersTab', photo: 'adminPhotoTab', survey: 'adminSurveyTab' };
  Object.values(tabs).forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById(tabs[t])?.classList.remove('hidden');
  document.querySelectorAll('.admin-tab').forEach(btn => { btn.classList.remove('bg-blue-600', 'text-white'); btn.classList.add('bg-gray-200', 'text-gray-800'); });
  document.getElementById(`adminTab${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.replace('bg-gray-200', 'bg-blue-600');
  document.getElementById(`adminTab${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.replace('text-gray-800', 'text-white');
  
  if (t === 'selectEmployee') renderSelectEmployeeTab();
  else if (t === 'reasons') renderReasonsList();
  else if (t === 'users') renderUsersTable();
  else if (t === 'history') renderHistoryTab();
  else if (t === 'photo') renderPhotoTab();
  else if (t === 'publish') renderArchive();
}

function updateAdminDashboard() {
  const currentVotes = allVotes.filter(v => (v.survey_period || 'Current') === currentSurveyPeriod);
  if (document.getElementById('totalVoters')) document.getElementById('totalVoters').textContent = new Set(currentVotes.map(v => v.voter_id)).size;
  if (document.getElementById('totalVotes')) document.getElementById('totalVotes').textContent = currentVotes.length;
  renderVotingDetailsTable();
}

function renderVotingDetailsTable() {
  const tb = document.getElementById('votingDetailsTable');
  if (!tb) return;
  const currentVotes = allVotes.filter(v => (v.survey_period || 'Current') === currentSurveyPeriod);
  
  if (!currentVotes.length) {
    tb.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Belum ada data voting di periode ini</td></tr>';
    return;
  }

  const summary = {}; 
  currentVotes.forEach(v => {
    const cat = v.category || 'umum';
    if (!summary[cat]) summary[cat] = {};
    const empId = String(v.employee_id);
    if (!summary[cat][empId]) {
      summary[cat][empId] = { 
        count: 0, 
        name: v.employee_name || v.nama_pegawai || v.nama || '-' 
      };
    }
    summary[cat][empId].count++;
  });

  tb.innerHTML = '';
  Object.keys(summary).sort().forEach(cat => {
    const candidates = Object.entries(summary[cat]).sort((a,b) => b[1].count - a[1].count);
    candidates.forEach(([id, data]) => {
      const r = document.createElement('tr');
      r.className = 'border-b hover:bg-gray-50';
      r.innerHTML = `
        <td class="p-3 font-bold">${data.name}</td>
        <td class="p-3 text-xs text-gray-400">ID: ${id}</td>
        <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${cat === 'terbaik' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${cat.toUpperCase()}</span></td>
        <td class="p-3 font-bold text-blue-600 text-lg">${data.count} Suara</td>
        <td class="p-3">
          <div class="w-full bg-gray-200 rounded-full h-2 max-w-[100px]">
            <div class="bg-blue-600 h-2 rounded-full" style="width: ${Math.min(100, (data.count / currentVotes.length) * 100)}%"></div>
          </div>
        </td>`;
      tb.appendChild(r);
    });
  });
}

function renderPhotoTab() {
  const container = document.getElementById('adminPhotoTab');
  if (!container) return;
  
  container.innerHTML = `
    <div class="bg-white rounded-xl shadow p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-gray-800">📸 Kelola Foto Pegawai</h2>
        <p class="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Total: ${mockEmployees.length} Pegawai</p>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" id="photoManagerGrid">
      </div>
    </div>`;
    
  const grid = document.getElementById('photoManagerGrid');
  mockEmployees.forEach(emp => {
    const card = document.createElement('div');
    card.className = 'border rounded-xl p-3 flex flex-col items-center text-center space-y-2 hover:border-purple-300 transition';
    card.innerHTML = `
      <div class="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center relative group">
        ${emp.isPhotoUrl ? `
          <img src="${emp.photo}" class="w-full h-full object-cover" onerror="this.classList.add('hidden'); this.nextElementSibling.classList.remove('hidden');">
          <div class="hidden flex items-center justify-center w-full h-full bg-gray-50"><span class="text-3xl">${getEmojiForPosition(emp.position)}</span></div>
        ` : `<span class="text-3xl">${emp.photo}</span>`}
      </div>
      <div class="w-full">
        <p class="font-bold text-xs truncate">${emp.name}</p>
        <p class="text-[10px] text-gray-400 truncate">${emp.position}</p>
      </div>
      <button class="text-[10px] text-purple-600 font-semibold hover:underline" onclick="triggerPhotoUpload('${emp.id}')">Upload Foto</button>
    `;
    grid.appendChild(card);
  });
}

function triggerPhotoUpload(id) {
  currentUploadTargetId = id;
  const input = document.getElementById('employeePhotoInput');
  if (input) input.click();
}

// Initialize photo upload listener
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('employeePhotoInput');
  if (!input) return;
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUploadTargetId) return;
    
    // Cloudinary Config
    const cloudName = 'dtu5t9km8';
    const uploadPreset = 'ml_default';
    
    showNotification('Sedang mengunggah ke Cloudinary...', 'success');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.secure_url) {
        showNotification('Foto berhasil diunggah! Menyimpan ke database...', 'success');
        
        // Update URL di Spreadsheet
        const res = await dataSdk.update({ 
          action: 'updateEmployeePhoto', 
          employee_id: currentUploadTargetId, 
          photo_url: data.secure_url 
        });
        
        if (res.isOk) {
          await loadAppData();
          showNotification('Foto berhasil diperbarui!', 'success');
        } else {
          showNotification('Gagal menyimpan URL: ' + res.error, 'error');
        }
      } else {
        showNotification('Gagal upload ke Cloudinary. Pastikan "Upload Preset" ml_default sudah dibuat sebagai "Unsigned".', 'error');
        console.error('Cloudinary Error:', data);
      }
    } catch (err) {
      showNotification('Kesalahan upload: ' + err.message, 'error');
    }
    
    input.value = ''; // Reset input
  });
});

window.triggerPhotoUpload = triggerPhotoUpload; // Make it global for onclick

function renderArchive() {
  const container = document.getElementById('publicationArchive');
  if (!container) return;
  
  const periods = [...new Set(allVotes.map(v => v.survey_period))].filter(p => p && p !== currentSurveyPeriod).sort().reverse();
  
  container.innerHTML = '<h3 class="text-lg font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2"><span>📂 Arsip Hasil Voting</span></h3>';
  
  if (periods.length === 0) {
    container.innerHTML += '<div class="text-center py-8 text-gray-400 text-sm italic bg-gray-50 rounded-lg border-2 border-dashed">Belum ada arsip dari periode sebelumnya</div>';
    return;
  }

  periods.forEach(period => {
    const periodVotes = allVotes.filter(v => v.survey_period === period);
    const summary = {};
    periodVotes.forEach(v => {
      const cat = v.category || 'umum';
      if (!summary[cat]) summary[cat] = {};
      const empId = String(v.employee_id);
      if (!summary[cat][empId]) {
        summary[cat][empId] = { count: 0, name: v.employee_name || v.nama_pegawai || v.nama || '-' };
      }
      summary[cat][empId].count++;
    });

    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl p-5 border shadow-sm hover:shadow-md transition card-animate mb-4';
    let html = `<div class="flex justify-between items-center mb-4"><h4 class="font-bold text-purple-700 underline text-lg">${period}</h4> <span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold">${periodVotes.length} Total Suara</span></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-6">`;
    
    ['terbaik', 'indisipliner'].forEach(cat => {
      const winners = Object.entries(summary[cat] || {}).sort((a,b) => b[1].count - a[1].count).slice(0, 1);
      html += `<div class="p-3 bg-gray-50 rounded-lg border-l-4 ${cat === 'terbaik' ? 'border-green-500' : 'border-red-500'}">
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">${cat}</p>`;
      if (winners.length) {
        html += `<p class="font-bold text-gray-800">${winners[0][1].name}</p>
                 <p class="text-sm font-bold text-blue-600">${winners[0][1].count} Suara</p>`;
      } else {
        html += `<p class="text-xs text-gray-400 italic">Data tidak tersedia</p>`;
      }
      html += `</div>`;
    });
    
    html += `</div>`;
    card.innerHTML = html;
    container.appendChild(card);
  });
}

function renderHistoryTab() {
  const container = document.getElementById('adminHistoryTab');
  if (!container) return;
  
  container.innerHTML = `
    <div class="bg-white rounded-xl shadow p-6">
      <h2 class="text-xl font-bold text-gray-800 mb-6">📜 Riwayat Lengkap Voting</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b-2 border-gray-300">
              <th class="text-left py-2 px-3 font-semibold text-gray-700">Survey Period</th>
              <th class="text-left py-2 px-3 font-semibold text-gray-700">Pemilih</th>
              <th class="text-left py-2 px-3 font-semibold text-gray-700">Pegawai</th>
              <th class="text-left py-2 px-3 font-semibold text-gray-700">Kategori</th>
              <th class="text-left py-2 px-3 font-semibold text-gray-700">Waktu</th>
            </tr>
          </thead>
          <tbody id="historyTableBody"></tbody>
        </table>
      </div>
    </div>`;
    
  const tb = document.getElementById('historyTableBody');
  if (!allVotes.length) {
    tb.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Belum ada riwayat data</td></tr>';
    return;
  }
  
  const sortedVotes = [...allVotes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  sortedVotes.forEach(v => {
    const r = document.createElement('tr');
    r.className = 'border-b hover:bg-gray-50';
    const voterName = v.voter_name || v.voter_nama || '-';
    const empName = v.employee_name || v.nama_pegawai || v.nama || '-';
    r.innerHTML = `
      <td class="p-3 text-xs font-semibold text-purple-600">${v.survey_period || '-'}</td>
      <td class="p-3">${voterName}</td>
      <td class="p-3">${empName}</td>
      <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${v.category === 'terbaik' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${v.category}</span></td>
      <td class="p-3 text-xs text-gray-500">${new Date(v.timestamp).toLocaleString('id-ID')}</td>`;
    tb.appendChild(r);
  });
}

function showVotingWarning(voted) {
  const missing = [];
  if (!voted.has('terbaik')) missing.push({ name: 'Pegawai Terbaik', emoji: '🏆', color: 'yellow' });
  if (!voted.has('indisipliner')) missing.push({ name: 'Pegawai Indisipliner', emoji: '⚠️', color: 'red' });
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
  modal.id = 'votingWarningModal';
  modal.innerHTML = `<div class="bg-white rounded-2xl p-8 max-w-md w-full space-y-6 text-center"><div class="text-6xl">🗳️</div><h2 class="text-2xl font-bold">Lengkapi Voting</h2><p class="text-gray-600">Anda belum memilih di kategori: ${missing.map(m => m.name).join(', ')}</p><div class="flex gap-3"><button class="flex-1 bg-gray-200 py-3 rounded-xl" onclick="this.closest('#votingWarningModal').remove()">Kembali</button><button class="flex-1 bg-red-600 text-white py-3 rounded-xl" onclick="logout()">Paksa Keluar</button></div></div>`;
  document.body.appendChild(modal);
}

async function renderSelectEmployeeTab() {
  const bSel = document.getElementById('bestEmployeeSelect');
  const uSel = document.getElementById('undisciplinedEmployeeSelect');
  if (!bSel) return;
  
  const opt = (s) => {
    s.innerHTML = '<option value="">-- Pilih Pegawai --</option>';
    mockEmployees.forEach(e => {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = `${e.name}${e.position ? ` - ${e.position}` : ''}`;
      s.appendChild(o);
    });
  };
  opt(bSel); opt(uSel);

  const renderList = (cat, gridId) => {
    const container = document.getElementById(gridId);
    if (!container) return;
    
    const targetCat = normalizeCategory(cat);
    const sel = mockEmployees.filter(e => e.categories && e.categories.includes(targetCat));
    
    container.innerHTML = sel.length ? '' : '<p class="text-gray-500 text-center py-4">Belum ada peserta</p>';
    sel.forEach(e => {
      const d = document.createElement('div');
      d.className = 'flex items-center justify-between bg-white p-3 border-2 rounded-lg mb-2';
      d.innerHTML = `
        <div class="flex items-center">
          <div class="w-10 h-10 rounded mr-3 overflow-hidden bg-gray-100 flex items-center justify-center border shadow-inner">
            ${e.photo && e.isPhotoUrl ? `
              <img src="${e.photo}" class="w-full h-full object-cover" onerror="this.classList.add('hidden'); this.nextElementSibling.classList.remove('hidden');">
              <div class="hidden flex items-center justify-center w-full h-full bg-gray-50"><span class="text-xl">${getEmojiForPosition(e.position)}</span></div>
            ` : `<span class="text-xl">${getEmojiForPosition(e.position)}</span>`}
          </div>
          <div>
            <p class="font-bold text-sm">${e.name}</p>
            <p class="text-[10px] text-purple-600 font-semibold">ID: ${e.id}</p>
            <p class="text-xs text-gray-500">${e.position}</p>
          </div>
        </div>
        <button class="text-red-600 p-1 hover:bg-red-50 rounded transition" onclick="removeEmployee('${cat}', '${e.id}')">✕</button>`;
      container.appendChild(d);
    });
  };
  renderList('terbaik', 'bestEmployeesList');
  renderList('indisipliner', 'undisciplinedEmployeesList');
}

window.addEmployeeToCategory = async (cat) => {
  const selectId = cat === 'terbaik' ? 'bestEmployeeSelect' : 'undisciplinedEmployeeSelect';
  const btnId = cat === 'terbaik' ? 'addBestEmployeeBtn' : 'addUndisciplinedEmployeeBtn';
  const select = document.getElementById(selectId);
  const btn = document.getElementById(btnId);
  const id = select.value;
  if (!id) return;
  
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const res = await dataSdk.update({ action: 'updateEmployeeCategory', employee_id: id, category: cat, mode: 'add' });
    if (res.isOk) {
      await new Promise(r => setTimeout(r, 1000));
      await loadAppData();
      showNotification('Berhasil ditambahkan', 'success');
      select.value = ""; 
    } else {
      showNotification('Gagal: ' + (res.error || 'Terjadi kesalahan'), 'error');
    }
  } catch (err) {
    showNotification('Gagal sistem: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

window.removeEmployee = async (cat, id) => {
  if (!confirm('Hapus pegawai ini dari daftar nominasi?')) return;
  
  try {
    const res = await dataSdk.update({ action: 'updateEmployeeCategory', employee_id: id, category: cat, mode: 'remove' });
    if (res.isOk) {
      await new Promise(r => setTimeout(r, 1500));
      await loadAppData();
      renderSelectEmployeeTab();
      showNotification('Berhasil dihapus', 'success');
    } else {
      showNotification('Gagal menghapus', 'error');
    }
  } catch (err) {
    showNotification('Gagal sistem: ' + err.message, 'error');
  }
};

function renderReasonsList() {
  const render = (cat, gridId) => {
    const c = document.getElementById(gridId);
    const r = reasonsOptions[cat] || [];
    c.innerHTML = r.length ? '' : '<p class="text-gray-500 text-center py-4">Belum ada alasan</p>';
    r.forEach((item, i) => { const d = document.createElement('div'); d.className = 'flex justify-between p-3 bg-gray-50 border rounded-lg mb-2'; d.innerHTML = `<span>${item.alasan}</span><button class="text-red-500" onclick="deleteReason('${cat}', ${i})">Hapus</button>`; c.appendChild(d); });
  };
  render('terbaik', 'reasonsListBest');
  render('indisipliner', 'reasonsListUndisciplined');
}

window.addReason = async (cat) => {
  const inputId = cat === 'terbaik' ? 'newReasonBest' : 'newReasonUndisciplined';
  const btnId = cat === 'terbaik' ? 'addReasonBestBtn' : 'addReasonUndisciplinedBtn';
  const el = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const txt = el.value.trim();
  if (!txt) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';

  const res = await dataSdk.update({ action: 'addReason', category: cat, alasan: txt });
  if (res.isOk) {
    await loadAppData();
    el.value = '';
    showNotification('Alasan berhasil ditambah', 'success');
  } else {
    showNotification('Gagal: ' + res.error, 'error');
  }
  btn.disabled = false;
  btn.textContent = originalText;
};

window.deleteReason = async (cat, i) => {
  if (!confirm('Hapus alasan ini?')) return;
  const reason = reasonsOptions[cat][i].alasan;
  const res = await dataSdk.update({ action: 'deleteReason', category: cat, alasan: reason });
  if (res.isOk) {
    await loadAppData();
    renderReasonsList();
    showNotification('Alasan berhasil dihapus', 'success');
  } else {
    showNotification('Gagal menghapus', 'error');
  }
};

function renderUsersTable() {
  const tb = document.getElementById('usersTableBody');
  if (!tb) return;
  tb.innerHTML = validUsers.length ? '' : '<tr><td colspan="4" class="p-8 text-center text-gray-500">Kosong</td></tr>';
  validUsers.forEach((u, i) => {
    const r = document.createElement('tr');
    r.className = 'border-b';
    r.innerHTML = `<td class="p-3">${u.name}</td><td class="p-3">${u.username}</td><td class="p-3"><code>${u.password}</code></td><td class="p-3 text-center"><button class="text-red-600" onclick="deleteUser('${u.id}')">Hapus</button></td>`;
    tb.appendChild(r);
  });
}

window.addNewUser = async () => {
  const n = document.getElementById('newUserName').value.trim();
  const u = document.getElementById('newUserUsername').value.trim();
  const p = document.getElementById('newUserPassword').value.trim();
  if (!n || !u || !p) return showNotification('Lengkapi data user', 'error');

  const btn = document.getElementById('addNewUserBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const res = await dataSdk.update({ action: 'addUser', name: n, username: u, password: p });
  if (res.isOk) {
    await loadAppData();
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    showNotification('User berhasil ditambah', 'success');
  } else {
    showNotification('Gagal: ' + res.error, 'error');
  }
  btn.disabled = false;
  btn.textContent = originalText;
};

window.deleteUser = async (id) => {
  if (!confirm('Hapus user ini?')) return;
  const res = await dataSdk.update({ action: 'deleteUser', id: id });
  if (res.isOk) {
    await loadAppData();
    renderUsersTable();
    showNotification('User berhasil dihapus', 'success');
  } else {
    showNotification('Gagal menghapus', 'error');
  }
};
