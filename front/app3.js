// ============================================================
// NEBS 模拟考试平台 — app.js
// v4: 学生端左侧导航 + 分页 + 错题筛选
// ============================================================

const API = "http://simon.nekko.cn:1234";

const S = {
  teacher: null, student: null, role: null, token: null,
  editingExamId: null, draftQuestions: [], choiceCount: 4,
  editingQIdx: null, draftQImgs: [], // [{url, file, filename}] 最多10张
  activeExam: null, currentQIdx: 0, answers: {},
  tabSwitches: 0,
  _lastAntiCheatTime: 0,
  _timerInterval: null, _timerSecondsLeft: 0, _heartbeatInterval: null,
  _acVisibility: null, _acBlur: null, _acFocus: null, _acBlurTimer: null,
  viewingKeysExamId: null, viewingKeysData: [],
  eliminatedChoices: {},
  flaggedQuestions: new Set(),
  examType: 'choice',   // 'choice' | 'frq'
  frqAnswers: {},        // {qIdx: '文字答案'}
  _currentExamRecords: [], _currentExamQuestions: [], _currentExamName: '',
  // 学生端导航状态
  _navSubject: '',     // '' = 全部, '__pending__', '__favorites__', '__homework__', encoded subject
  _navType: 'all',     // 'all' | 'mcq' | 'frq'
  _favorites: new Set(), // 收藏的 exam id 集合
  _navPage: 1,
  _navExpanded: {},    // { subject: true/false }
  _wrongOnlyMode: false,
  // 教师端考试列表分页
  _examListPage: 1,
  _examListTypeFilter: 'all', // 'all' | 'mcq' | 'frq'
};

const ITEMS_PER_PAGE = 8;

// ── 考试状态持久化 ────────────────────────────────────────
function saveExamState() {
  if (!S.activeExam || !S.student) return;
  const examLight = {
    id: S.activeExam.id, name: S.activeExam.name, subject: S.activeExam.subject,
    choice_count: S.activeExam.choice_count, time_limit_minutes: S.activeExam.time_limit_minutes,
    is_active: S.activeExam.is_active,
    exam_type: S.activeExam.exam_type || 'choice',
    is_homework: S.activeExam.is_homework || 0,
    questionsList: S.activeExam.questionsList.map(q => ({
      id: q.id, exam_id: q.exam_id, order_idx: q.order_idx, choices: q.choices,
      img_url: null, img_url2: null, question_type: q.question_type || 'choice'
    }))
  };
  const state = {
    activeExam: examLight, examId: S.activeExam.id, student: S.student,
    answers: S.answers, currentQIdx: S.currentQIdx, tabSwitches: S.tabSwitches,
    flaggedQuestions: [...S.flaggedQuestions], frqAnswers: S.frqAnswers || {}, examType: S.examType || 'choice', timerSecondsLeft: S._timerSecondsLeft, savedAt: Date.now()
  };
  try {
    sessionStorage.setItem('examState', JSON.stringify(state));
  } catch(e) {
    // sessionStorage 满了（常见于 FRQ 长答案），尝试去掉 questionsList 再存
    try {
      const slim = { ...state, activeExam: { ...state.activeExam, questionsList: [] } };
      sessionStorage.setItem('examState', JSON.stringify(slim));
    } catch(e2) {
      // 实在存不下，至少保留 frqAnswers（最重要的）
      try {
        sessionStorage.setItem('examState_frq', JSON.stringify({ frqAnswers: state.frqAnswers, answers: state.answers, examId: state.examId, savedAt: state.savedAt }));
      } catch(e3) { console.warn('sessionStorage full, FRQ answers not saved locally'); }
    }
  }
}

function loadExamState() {
  try {
    const raw = sessionStorage.getItem('examState');
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (Date.now() - state.savedAt > 24 * 60 * 60 * 1000) { sessionStorage.removeItem('examState'); return null; }
    // 尝试用 examState_frq 补充（sessionStorage 曾经满时的降级存储）
    try {
      const frqRaw = sessionStorage.getItem('examState_frq');
      if (frqRaw) {
        const frqData = JSON.parse(frqRaw);
        if (frqData.examId === state.examId && frqData.frqAnswers) {
          // 合并，以 frqData 为准（更新）
          state.frqAnswers = { ...state.frqAnswers, ...frqData.frqAnswers };
          state.answers = { ...state.answers, ...frqData.answers };
        }
      }
    } catch(e2) {}
    return state;
  } catch(e) { return null; }
}

function clearExamState() { sessionStorage.removeItem('examState'); }

function getLetters(n) {
  return ['A','B','C','D','E','F','G','H'].slice(0, Math.max(2, Math.min(8, n || 4)));
}

function genKey(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let k = '';
  for (let i = 0; i < len; i++) k += chars[Math.floor(Math.random() * chars.length)];
  return k;
}

async function genUniqueKeys(count) {
  const keys = new Set();
  while (keys.size < count) keys.add(genKey(8));
  const candidates = [...keys];
  const taken = await api('POST', '/api/student-keys/check', { keys: candidates });
  const safe = candidates.filter(k => !taken.includes(k));
  while (safe.length < count) {
    let k;
    do { k = genKey(8); } while (taken.includes(k) || safe.includes(k));
    safe.push(k);
  }
  return safe;
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (S.token) opts.headers['x-session-token'] = S.token;
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const url = method === 'GET' && body ? `${API}${path}?${new URLSearchParams(body)}` : `${API}${path}`;
  const res = await fetch(url, opts);
  if (res.status === 401) { logout(); showAlert('tea-alert', '登录已过期，请重新登录'); throw new Error('401'); }
  return res.json();
}

// change the /exams/all api to /student/exam
async function getExamsByStudent(){
  let exams = await api("GET", "/api/student/exams",{student_name:"郭宇轩"});
  let exams2=[];
  for(let i=0;i<exams.length;i++){
        exams2.push(exams[i].exam);
    }
  return exams2;
}

async function uploadImageToStorage(file) {
  if (!file) return null;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/api/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.url;
}

function toast(msg, dur = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}
function showAlert(id, msg, type = 'danger') {
  const el = document.getElementById(id); if (!el) return;
  el.className = `alert alert-${type}`; el.textContent = msg; el.style.display = 'block';
}
function hideAlert(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function scoreColor(pct) {
  if (pct >= 80) return { bg: 'var(--green-light)', fg: '#173404' };
  if (pct >= 60) return { bg: 'var(--amber-light)', fg: '#412402' };
  return { bg: 'var(--red-light)', fg: '#501313' };
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  const examState = loadExamState();
  if (examState) {
    S.activeExam = examState.activeExam; S.student = examState.student;
    S.answers = examState.answers; S.currentQIdx = examState.currentQIdx;
    S.tabSwitches = examState.tabSwitches;
    S.flaggedQuestions = new Set(examState.flaggedQuestions || []);
    S.frqAnswers = examState.frqAnswers || {};
    S.examType = examState.examType || 'choice';
    document.getElementById('student-name-nav').textContent = S.student.name;
    document.getElementById('student-avatar-nav').textContent = S.student.name.trim()[0] || 'S';
    showScreen('exam');
    try {
      const [freshQs, progress] = await Promise.all([
        api('GET', `/api/questions/${S.activeExam.id}`),
        api('GET', '/api/homework-progress', { student_key_id: S.student.studentKeyId, exam_id: S.activeExam.id }).catch(() => null)
      ]);
      if (freshQs && freshQs.length) {
        S.activeExam.questionsList = freshQs;
        // 如果 sessionStorage 里没有 exam_type，从题目类型推断
        if (!S.activeExam.exam_type || S.activeExam.exam_type === 'choice') {
          const hasFrq = freshQs.some(q => q.question_type === 'frq');
          if (hasFrq) S.activeExam.exam_type = 'frq';
        }
        // 同步 S.examType
        S.examType = S.activeExam.exam_type || 'choice';
      }
      // 用服务器上的 frqAnswers 覆盖本地（防止 sessionStorage 截断或丢失）
      if (progress?.frq_answers) {
        const srv = typeof progress.frq_answers === 'string' ? JSON.parse(progress.frq_answers) : progress.frq_answers;
        if (srv && Object.keys(srv).length) {
          // 逐题合并：服务器的值更长则用服务器的（防止 sessionStorage 被截断）
          Object.keys(srv).forEach(k => {
            const srvVal = srv[k] || '';
            const localVal = S.frqAnswers[k] || '';
            if (srvVal.length > localVal.length) S.frqAnswers[k] = srvVal;
          });
        }
      }
    } catch(e) {}
    renderQuestion(S.currentQIdx);
    const _isHw = S.activeExam.is_homework === 1 || S.activeExam.is_homework === true;
    const _eb = document.getElementById('exit-exam-btn');
    if (_eb) _eb.style.display = _isHw ? '' : 'none';
    if (_isHw) { stopAntiCheat(); S._isHomeworkMode = true; } else { startAntiCheat(); }
    startHeartbeat();
    if (examState.timerSecondsLeft > 0 && S.activeExam.time_limit_minutes) {
      S._timerSecondsLeft = examState.timerSecondsLeft;
      document.getElementById('exam-timer').style.display = 'flex';
      updateTimerDisplay();
      S._timerInterval = setInterval(() => {
        S._timerSecondsLeft--; saveExamState(); updateTimerDisplay();
        if (S._timerSecondsLeft <= 0) { stopTimer(); toast('⏰ 时间到！正在自动提交…'); setTimeout(() => autoSubmitExam(), 800); }
      }, 1000);
    } else { document.getElementById('exam-timer').style.display = 'none'; }
    return;
  }
  const saved = sessionStorage.getItem('teacher');
  if (saved) { S.teacher = JSON.parse(saved); S.role = 'teacher'; S.token = sessionStorage.getItem('teacherToken') || null; showTeacherDashboard(); return; }
  const savedStudent = sessionStorage.getItem('student');
  if (savedStudent) {
    S.student = JSON.parse(savedStudent); S.role = 'student';
    document.getElementById('student-name-nav').textContent = S.student.name;
    document.getElementById('student-avatar-nav').textContent = S.student.name.trim()[0] || 'S';
    showScreen('student');
    await renderStudentDashboard(S.student.name); return;
  }
  showScreen('login');
}

// ── Auth ──────────────────────────────────────────────────
function switchLoginTab(tab) {
  document.querySelectorAll('#screen-login .tab-btn').forEach((b, i) =>
    b.classList.toggle('active', (i === 0) === (tab === 'student')));
  document.getElementById('login-student-panel').style.display = tab === 'student' ? '' : 'none';
  document.getElementById('login-teacher-panel').style.display = tab === 'teacher' ? '' : 'none';
}

async function teacherLogin() {
  const email = document.getElementById('tea-email').value.trim();
  const pass  = document.getElementById('tea-pass').value;
  hideAlert('tea-alert');
  if (!email || !pass) { showAlert('tea-alert', '请填写账号和密码'); return; }
  const btn = document.querySelector('#login-teacher-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '登录中…'; }
  const result = await api('POST', '/api/teacher/login', { email, password: pass });
  if (result.error) { showAlert('tea-alert', result.error); if (btn) { btn.disabled = false; btn.textContent = '教师登录'; } return; }
  S.teacher = result.teacher; S.role = 'teacher'; S.token = result.token;
  sessionStorage.setItem('teacher', JSON.stringify(result.teacher));
  sessionStorage.setItem('teacherToken', result.token);
  showTeacherDashboard();
}

function registerTeacher() { showScreen('login'); }
function showRegister() { showScreen('login'); }

function logout() {
  const studentKeyIdBeforeLogout = S.student?.studentKeyId;
  sessionStorage.removeItem('teacher'); sessionStorage.removeItem('teacherToken'); sessionStorage.removeItem('student');
  if (S.token) { api('POST', '/api/teacher/logout').catch(() => {}); S.token = null; }
  clearExamState(); stopAntiCheat(); stopTimer();
  if (S._heartbeatInterval) { clearInterval(S._heartbeatInterval); S._heartbeatInterval = null; }
  if (studentKeyIdBeforeLogout) api('DELETE', '/api/heartbeat', { student_key_id: studentKeyIdBeforeLogout }).catch(() => {});
  S.teacher = null; S.student = null; S.role = null;
  const teacherBtn = document.querySelector('#login-teacher-panel .btn-primary');
  if (teacherBtn) { teacherBtn.disabled = false; teacherBtn.textContent = '教师登录'; }
  const studentBtn = document.querySelector('#login-student-panel .btn-primary');
  if (studentBtn) { studentBtn.disabled = false; studentBtn.textContent = '进入考试'; }
  ['tea-email','tea-pass','stu-key'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  hideAlert('tea-alert'); hideAlert('stu-alert');
  showScreen('login');
}

// ── Teacher Dashboard ──────────────────────────────────────
function showTeacherDashboard() {
  const name = S.teacher?.full_name || '老师';
  document.getElementById('teacher-name-display').textContent = name;
  document.getElementById('teacher-avatar').textContent = name.trim()[0].toUpperCase();
  showScreen('teacher'); switchTeacherTab('exams');
}

function switchTeacherTab(tab) {
  ['exams', 'records', 'live'].forEach(t => {
    document.getElementById('teacher-tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#screen-teacher .tab-btn')
    .forEach((b, i) => b.classList.toggle('active', (['exams','records','live'][i]) === tab));
  if (tab !== 'live') { if (_liveInterval) { clearInterval(_liveInterval); _liveInterval = null; } }
  if (tab === 'exams')   renderExamList();
  if (tab === 'records') renderRecords();
  if (tab === 'live')    renderLiveMonitor();
}

let _liveInterval = null;
async function renderLiveMonitor() {
  const cont = document.getElementById('teacher-tab-live');
  if (_liveInterval) clearInterval(_liveInterval);
  _liveInterval = setInterval(renderLiveMonitor, 10000);
  await _renderLive(cont);
}
async function _renderLive(cont) {
  const rows = await api('GET', '/api/heartbeat/active');
  if (!rows.length) { cont.innerHTML = `<div class="empty-state"><div class="empty-icon">👀</div><div class="empty-title">当前没有学生在考试</div></div>`; return; }
  const byExam = {};
  rows.forEach(r => { if (!byExam[r.exam_name]) byExam[r.exam_name] = []; byExam[r.exam_name].push(r); });
  cont.innerHTML = `<div style="margin-bottom:12px;font-size:13px;color:var(--text2);">每10秒自动刷新 · 共 <strong style="color:var(--text);">${rows.length}</strong> 人在线</div>` +
    Object.entries(byExam).map(([examName, students]) => `
      <div class="card mb-2">
        <div style="font-weight:600;margin-bottom:10px;">${examName} <span class="badge badge-green">${students.length} 人在线</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${students.map(s => {
            const sw = s.tab_switches || 0;
            const swTag = sw > 0 ? `<span style="background:${sw>=3?'var(--red-light)':'var(--amber-light)'};color:${sw>=3?'var(--red)':'var(--amber)'};font-size:11px;padding:1px 6px;border-radius:999px;margin-left:4px;">⚠${sw}次</span>` : '';
            const progress = s.total_q ? `<span style="font-size:11px;color:var(--green);margin-left:4px;">${s.current_q||1}/${s.total_q}题</span>` : '';
            const timer = s.timer_left > 0 ? (() => { const m=Math.floor(s.timer_left/60),sec=s.timer_left%60; return `<span style="font-size:11px;color:${s.timer_left<=60?'var(--red)':s.timer_left<=300?'var(--amber)':'var(--green)'};margin-left:4px;">⏱${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}</span>`; })() : '';
            return `<span style="background:var(--green-light);color:var(--green);padding:4px 10px;border-radius:999px;font-size:13px;display:inline-flex;align-items:center;gap:2px;">● ${s.student_name}${progress}${timer}${swTag}</span>`;
          }).join('')}
        </div>
      </div>`).join('');
}

const EXAM_LIST_PAGE_SIZE = 6;

async function renderExamList() {
  const cont = document.getElementById('exam-list-container');
  const filterSubject = document.getElementById('exam-filter-subject').value;
  cont.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px 0;">加载中…</div>';
  let exams=await getExamsByStudent();
  if (filterSubject) exams = exams.filter(e => e.subject === filterSubject);
  // 类型筛选
  if (S._examListTypeFilter === 'mcq') exams = exams.filter(e => e.exam_type !== 'frq');
  if (S._examListTypeFilter === 'frq') exams = exams.filter(e => e.exam_type === 'frq');
  if (!exams.length) { cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">还没有考试</div><div class="empty-desc">点击「新建考试」创建第一个</div></div>`; return; }
  // 分页
  const totalPages = Math.ceil(exams.length / EXAM_LIST_PAGE_SIZE);
  if (S._examListPage > totalPages) S._examListPage = totalPages;
  const pageExams = exams.slice((S._examListPage - 1) * EXAM_LIST_PAGE_SIZE, S._examListPage * EXAM_LIST_PAGE_SIZE);

  // 类型筛选按钮
  const tf = S._examListTypeFilter;
  const typeFilterHtml = `<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
    <span style="font-size:12px;color:var(--text3);margin-right:2px;">类型：</span>
    ${[['all','全部'],['mcq','MCQ 选择题'],['frq','FRQ 问答题']].map(([v,l]) =>
      `<button onclick="examListSetType('${v}')" style="padding:4px 12px;border-radius:999px;font-size:12px;font-weight:500;cursor:pointer;border:1.5px solid ${tf===v?'var(--blue)':'var(--border-md)'};background:${tf===v?'var(--blue)':'var(--surface)'};color:${tf===v?'white':'var(--text2)'};">${l}</button>`
    ).join('')}
    <span style="font-size:12px;color:var(--text3);margin-left:6px;">共 ${exams.length} 场</span>
  </div>`;

  const listHtml = pageExams.map(e => {
    const isFrq = e.exam_type === 'frq';
    const modeLabel = isFrq ? 'FRQ' : getLetters(e.choice_count || 4).join('/');
    const timeLabel = e.time_limit_minutes ? ` · ⏱ ${e.time_limit_minutes} 分钟` : '';
    const teacherTag = S.teacher.id === 'teacher-1' && e.teacher_name ? `<span class="badge badge-amber" style="font-size:10px;">👤 ${e.teacher_name}</span>` : '';
    const typeTag = isFrq ? `<span class="badge badge-amber" style="font-size:10px;">FRQ</span>` : `<span class="badge badge-gray" style="font-size:10px;">MCQ</span>`;
    const hwTag = e.is_homework ? `<span class="badge badge-blue" style="font-size:10px;">📚 作业</span>` : '';
    return `<div class="card card-hover mb-2">
      <div class="flex-between">
        <div style="flex:1;min-width:0;">
          <div class="flex gap-2 mb-1" style="flex-wrap:wrap;">
            <span style="font-weight:600;font-size:15px;">${e.name}</span>
            <span class="badge badge-blue">${e.subject}</span>
            ${typeTag}${hwTag}
            <span class="badge ${e.is_active ? 'badge-green' : 'badge-gray'}">${e.is_active ? '开放中' : '已关闭'}</span>
            ${teacherTag}
          </div>
          <div style="font-size:13px;color:var(--text2);">${e.questions_count} 题 · ${e.students_count} 位学生${timeLabel}${e.description ? ' · ' + e.description : ''}</div>
        </div>
        <div class="flex gap-1" style="margin-left:12px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-sm" onclick="viewExamRecords('${e.id}','${e.name}')">查看成绩</button>
          <button class="btn btn-sm" onclick="viewStudentKeys('${e.id}','${e.name}')">学生密钥</button>
          <button class="btn btn-sm" onclick="toggleExamActive('${e.id}')">${e.is_active ? '关闭' : '开放'}</button>
          <button class="btn btn-sm" onclick="editExam('${e.id}')">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="deleteExam('${e.id}')">删除</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const paginationHtml = totalPages > 1 ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-top:12px;">
      <button onclick="examListPage(${S._examListPage - 1})" ${S._examListPage <= 1 ? 'disabled' : ''} class="btn btn-sm">← 上页</button>
      ${Array.from({length: totalPages}, (_, i) => i + 1).map(p =>
        `<button onclick="examListPage(${p})" class="btn btn-sm" style="${p === S._examListPage ? 'background:var(--blue);color:white;border-color:var(--blue);' : ''}">${p}</button>`
      ).join('')}
      <button onclick="examListPage(${S._examListPage + 1})" ${S._examListPage >= totalPages ? 'disabled' : ''} class="btn btn-sm">下页 →</button>
      <span style="font-size:12px;color:var(--text3);margin-left:4px;">第 ${S._examListPage}/${totalPages} 页</span>
    </div>` : '';

  cont.innerHTML = typeFilterHtml + listHtml + paginationHtml;
}

function examListPage(p) {
  S._examListPage = p;
  renderExamList();
}

function examListSetType(type) {
  S._examListTypeFilter = type;
  S._examListPage = 1;
  renderExamList();
}

async function viewExamRecords(examId, examName) {
  document.getElementById('exam-records-modal-title').textContent = `成绩 — ${examName}`;
  const cont = document.getElementById('exam-records-list');
  cont.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:16px 0;">⏳ 加载中，请稍候…</div>';
  document.getElementById('modal-exam-records').classList.add('open');
  S._currentExamName = examName;
  const [recs, qs] = await Promise.all([
    api('GET', '/api/records', { exam_id: examId }),
    api('GET', `/api/questions/${examId}?role=teacher`)
  ]);
  S._currentExamRecords = recs; S._currentExamQuestions = qs;
  if (!recs.length) { cont.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:16px 0;">暂无学生提交</div>'; return; }
  // FRQ exam: show answer viewer instead of score table
  let exams= await getExamsByStudent();
  //const examInfo = exam.then(es => es.find(e => e.id === examId)).catch(() => null);
  const examInfo = exams.find(e => e.id === examId) ?? null;
  const isFrqModal = examInfo && examInfo.exam_type === 'frq';
  if (isFrqModal) {
    // 存到全局供批改弹窗使用
    S._frqGradingExamId = examId;
    S._frqGradingQuestions = qs;
    S._frqGradingRecords = recs;
    S._frqViewMode = S._frqViewMode || 'student'; // 'student' | 'question'
    _renderFrqRecordsList(cont, recs, qs);
    return;
  }
  const avg  = recs.reduce((s, r) => s + r.score / r.total * 100, 0) / recs.length;
  const best = Math.max(...recs.map(r => r.score / r.total * 100));
  const qAccuracy = qs.map((q, qi) => {
    const answered = recs.filter(r => r.answers_data && r.answers_data[qi] !== undefined);
    if (!answered.length) return 0;
    const correct = answered.filter(r => r.answers_data[qi] === q.correct_answer).length;
    return Math.round(correct / answered.length * 100);
  });
  const qAccuracyHtml = qs.length ? `
    <div style="margin-bottom:18px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;">每题正确率</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${qs.map((q, qi) => {
          const pct = qAccuracy[qi];
          const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
          const bg = pct >= 80 ? 'var(--green-light)' : pct >= 50 ? 'var(--amber-light)' : 'var(--red-light)';
          return `<div style="background:${bg};border-radius:var(--radius-sm);padding:6px 10px;text-align:center;min-width:52px;">
            <div style="font-size:11px;color:var(--text2);margin-bottom:2px;">Q${qi+1}</div>
            <div style="font-size:14px;font-weight:600;color:${color};">${pct}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';
  cont.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
      <div class="stat-card"><div class="stat-val">${recs.length}</div><div class="stat-label">提交人数</div></div>
      <div class="stat-card"><div class="stat-val">${Math.round(avg)}%</div><div class="stat-label">平均分</div></div>
      <div class="stat-card"><div class="stat-val">${Math.round(best)}%</div><div class="stat-label">最高分</div></div>
    </div>
    ${qAccuracyHtml}
    <div class="table-wrap"><table>
      <thead><tr><th>学生姓名</th><th>成绩</th><th>正确率</th><th>切屏</th><th>提交时间</th></tr></thead>
      <tbody>${recs.map(r => {
        const pct = Math.round(r.score / r.total * 100);
        const { bg, fg } = scoreColor(pct);
        const sw = r.tab_switches || 0;
        return `<tr>
          <td style="font-weight:500;">${r.student_name}</td>
          <td><span class="score-ring" style="background:${bg};color:${fg};">${r.score}/${r.total}</span></td>
          <td><div class="flex gap-2">
            <div class="progress" style="width:70px;flex-shrink:0;"><div class="progress-bar" style="width:${pct}%;background:${pct>=80?'var(--green)':pct>=60?'var(--amber)':'var(--red)'};"></div></div>
            <span style="font-size:13px;color:var(--text2);">${pct}%</span>
          </div></td>
          <td style="color:${sw>=3?'var(--red)':sw>0?'var(--amber)':'var(--text2)'};">${sw>0?'⚠ '+sw:'0'}</td>
          <td style="color:var(--text2);font-size:12px;">${r.created_at || '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}
function closeExamRecordsModal() { document.getElementById('modal-exam-records').classList.remove('open'); }

// ── FRQ 批改弹窗 ──────────────────────────────────────
function _renderFrqRecordsList(cont, recs, qs) {
  const mode = S._frqViewMode || 'student';
  const tabBtn = (label, m) => `<button onclick="S._frqViewMode='${m}';_renderFrqRecordsList(document.getElementById('exam-records-list'),S._frqGradingRecords,S._frqGradingQuestions)" style="padding:6px 16px;border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid ${mode===m?'var(--blue)':'var(--border-md)'};background:${mode===m?'var(--blue)':'var(--surface)'};color:${mode===m?'white':'var(--text2)'};">${label}</button>`;

  let body = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
    <span style="font-size:13px;color:var(--text2);">${recs.length} 位学生已提交</span>
    <div style="display:flex;gap:6px;">${tabBtn('按学生','student')}${tabBtn('按题目','question')}</div>
  </div>`;

  if (mode === 'student') {
    // 原来的按学生列表
    body += recs.map(r => {
      const isGraded = r.frq_score !== null && r.frq_score !== undefined;
      return `<div class="card card-hover mb-2" style="cursor:pointer;border-left:3px solid ${isGraded?'var(--green)':'var(--amber)'};" onclick="openFrqGrading('${r.id}')">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <span style="font-weight:600;">${r.student_name}</span>
            <span style="font-size:12px;color:var(--text3);margin-left:8px;">${r.created_at||''}</span>
            ${r.tab_switches>0?`<span class="badge badge-amber" style="font-size:10px;margin-left:4px;">⚠ 切屏${r.tab_switches}次</span>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${isGraded?`<span class="badge badge-green">已批改 ${r.frq_score}/${qs.length}分</span>`:`<span class="badge badge-amber">待批改</span>`}
            <span style="font-size:13px;color:var(--text3);">查看作答 →</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } else {
    // 按题目：每道题展开所有学生作答
    body += qs.map((q, qi) => {
      const studentAnswers = recs.map(r => {
        if (typeof r.frq_answers === 'string') try { r.frq_answers = JSON.parse(r.frq_answers); } catch(e) { r.frq_answers = {}; }
        if (typeof r.frq_q_scores === 'string') try { r.frq_q_scores = JSON.parse(r.frq_q_scores); } catch(e) { r.frq_q_scores = {}; }
        const ans = r.frq_answers?.[qi] || '';
        const score = r.frq_q_scores?.[qi];
        return { name: r.student_name, ans, score };
      });
      const answered = studentAnswers.filter(s => s.ans.trim()).length;
      return `<div class="card mb-3" style="border-left:3px solid var(--blue);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;cursor:pointer;" onclick="this.parentElement.querySelector('.frq-q-answers').style.display=this.parentElement.querySelector('.frq-q-answers').style.display==='none'?'block':'none'">
          <div>
            <span style="font-weight:600;font-size:14px;">Q${qi+1}</span>
            ${q.question_text?`<span style="font-size:13px;color:var(--text2);margin-left:8px;">${q.question_text.slice(0,60)}${q.question_text.length>60?'…':''}</span>`:''}
            <span style="font-size:12px;color:var(--text3);margin-left:8px;">${answered}/${recs.length} 人作答</span>
          </div>
          <span style="font-size:12px;color:var(--text3);">点击展开 ▾</span>
        </div>
        <div class="frq-q-answers" style="display:none;">
          ${studentAnswers.map(s => `
            <div style="margin-bottom:10px;padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <span style="font-weight:600;font-size:13px;">${s.name}</span>
                ${s.score!==undefined?`<span class="badge badge-green" style="font-size:11px;">${s.score}分</span>`:'<span class="badge badge-gray" style="font-size:11px;">未批改</span>'}
              </div>
              <div style="font-size:13px;line-height:1.8;white-space:pre-wrap;color:${s.ans?'var(--text)':'var(--text3)'};">${escapeHtml(s.ans)||'（未作答）'}</div>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  cont.innerHTML = body;
}

function openFrqGrading(recordId) {
  const rec = S._frqGradingRecords.find(r => r.id === recordId);
  const qs = S._frqGradingQuestions;
  if (!rec || !qs) return;
  S._gradingRecordId = recordId;

  // 确保 frq 字段是对象而不是字符串
  if (typeof rec.frq_feedback === 'string') try { rec.frq_feedback = JSON.parse(rec.frq_feedback); } catch(e) { rec.frq_feedback = {}; }
  if (typeof rec.frq_q_scores === 'string') try { rec.frq_q_scores = JSON.parse(rec.frq_q_scores); } catch(e) { rec.frq_q_scores = {}; }
  if (typeof rec.frq_answers === 'string') try { rec.frq_answers = JSON.parse(rec.frq_answers); } catch(e) { rec.frq_answers = {}; }

  const overlay = document.getElementById('modal-frq-grading');
  document.getElementById('frq-grading-title').textContent = `批改 — ${rec.student_name}`;

  const body = document.getElementById('frq-grading-body');
  body.innerHTML = qs.map((q, qi) => {
    const studentAns = rec.frq_answers?.[qi] || '';
    const feedback = rec.frq_feedback?.[qi] || '';
    const qScore = rec.frq_q_scores?.[qi] ?? '';
    return `<div style="margin-bottom:20px;padding:16px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
      <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.4px;">Q${qi+1}</div>
      ${q.question_text ? `<div style="font-size:14px;color:var(--text2);margin-bottom:10px;white-space:pre-wrap;line-height:1.7;">${q.question_text}</div>` : ''}
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px;font-weight:500;">学生作答：</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;font-size:14px;line-height:1.8;white-space:pre-wrap;min-height:48px;color:${studentAns ? 'var(--text)' : 'var(--text3)'};">${escapeHtml(studentAns) || '（未作答）'}</div>
      <div style="display:flex;gap:10px;margin-top:12px;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px;font-weight:500;">教师评语（可选）：</div>
          <textarea id="feedback-${qi}" placeholder="输入评语…" style="width:100%;padding:8px 10px;border:1px solid var(--border-md);border-radius:var(--radius-sm);font-size:13px;font-family:'DM Sans',sans-serif;resize:vertical;min-height:60px;background:var(--surface);color:var(--text);">${escapeHtml(feedback)}</textarea>
        </div>
        <div style="flex-shrink:0;width:90px;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px;font-weight:500;">分数 / ${q.max_score ?? 1}：</div>
          <input id="score-${qi}" type="number" min="0" max="${q.max_score ?? 1}" value="${qScore}" placeholder="分" style="width:100%;padding:8px;border:1px solid var(--border-md);border-radius:var(--radius-sm);font-size:14px;text-align:center;background:var(--surface);color:var(--text);" />
        </div>
      </div>
    </div>`;
  }).join('');

  overlay.classList.add('open');
}

async function saveFrqGrade() {
  const rec = S._frqGradingRecords.find(r => r.id === S._gradingRecordId);
  const qs = S._frqGradingQuestions;
  if (!rec || !qs) return;

  const btn = document.getElementById('frq-grade-save-btn');
  btn.disabled = true; btn.textContent = '保存中…';

  const feedback = {}, qScores = {};
  let totalScore = 0, maxTotal = 0;
  qs.forEach((q, qi) => {
    const fb = document.getElementById(`feedback-${qi}`)?.value?.trim() || '';
    const maxSc = q.max_score ?? 1;
    const sc = Math.min(parseInt(document.getElementById(`score-${qi}`)?.value) || 0, maxSc);
    if (fb) feedback[qi] = fb;
    qScores[qi] = sc;
    totalScore += sc;
    maxTotal += maxSc;
  });

  const result = await api('PUT', `/api/records/${S._gradingRecordId}/grade`, {
    frq_feedback: feedback,
    frq_q_scores: qScores,
    frq_score: totalScore,
    frq_max_score: maxTotal,
    total: qs.length
  });

  if (result.success) {
    toast('批改已保存 ✓');
    // 更新本地记录
    const idx = S._frqGradingRecords.findIndex(r => r.id === S._gradingRecordId);
    if (idx >= 0) {
      S._frqGradingRecords[idx].frq_feedback = feedback;
      S._frqGradingRecords[idx].frq_q_scores = qScores;
      S._frqGradingRecords[idx].frq_score = totalScore;
    }
    // 关弹窗前先重置按钮，防止下次打开仍显示"保存中"
    btn.disabled = false; btn.textContent = '保存批改';
    document.getElementById('modal-frq-grading').classList.remove('open');
    // 刷新成绩列表
    viewExamRecords(S._frqGradingExamId, S._currentExamName);
  } else {
    toast('保存失败，请重试');
    btn.disabled = false; btn.textContent = '保存批改';
  }
}

function downloadExamExcel() {
  const recs = S._currentExamRecords, qs = S._currentExamQuestions, name = S._currentExamName;
  if (!recs.length) { toast('暂无数据'); return; }
  const qHeaders = qs.map((_, i) => `Q${i+1}答题`).join(',');
  const qAccRow  = qs.map((q, qi) => {
    const correct = recs.filter(r => r.answers_data && r.answers_data[qi] === q.correct_answer).length;
    return recs.length > 0 ? Math.round(correct / recs.length * 100) + '%' : '0%';
  }).join(',');
  const letters = ['A','B','C','D','E'];
  const header  = `姓名,得分,总题数,正确率(%),切屏次数,提交时间${qs.length ? ',' + qHeaders : ''}`;
  const accRow  = `全班正确率,,,,,${qs.length ? ',' + qAccRow : ''}`;
  const rows    = recs.map(r => {
    const pct = Math.round(r.score / r.total * 100), sw = r.tab_switches || 0;
    const qCells = qs.map((q, qi) => { const ans = r.answers_data?.[qi]; return ans !== undefined ? (letters[ans] || ans) : '未答'; }).join(',');
    return `${r.student_name},${r.score},${r.total},${pct}%,${sw},${r.created_at || ''}${qs.length ? ',' + qCells : ''}`;
  }).join('\n');
  const csv = '\uFEFF' + header + '\n' + accRow + '\n' + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${name}_成绩单.csv`; a.click(); URL.revokeObjectURL(url);
  toast('成绩单已下载 ✓');
}

async function viewStudentKeys(examId, examName) {
  S.viewingKeysExamId = examId;
  document.getElementById('keys-modal-title').textContent = `学生专属密钥 — ${examName}`;
  document.getElementById('keys-list').innerHTML = '<div style="color:var(--text2);font-size:13px;">加载中…</div>';
  document.getElementById('modal-keys').classList.add('open');
  S.viewingKeysData = await api('GET', `/api/student-keys/${examId}`);
  renderKeysList();
}
function renderKeysList() {
  const cont = document.getElementById('keys-list');
  if (!S.viewingKeysData.length) { cont.innerHTML = '<div style="color:var(--text2);font-size:13px;">此考试暂无学生名单</div>'; return; }
  cont.innerHTML = S.viewingKeysData.map(sk => {
    const submitted = sk.has_record, scoreText = submitted ? ` · ${sk.score}/${sk.total}` : '';
    return `<div class="sk-row">
      <span class="sk-name">${sk.student_name}</span>
      <span class="sk-key">${sk.student_key}</span>
      <span class="sk-status" style="color:${submitted ? 'var(--green)' : 'var(--text3)'};">${submitted ? '已提交' + scoreText : '未提交'}</span>
      <div style="display:flex;gap:4px;">
        ${submitted ? `<button class="btn btn-sm" onclick="resetStudent('${sk.id}','${sk.student_name}')" style="padding:3px 8px;font-size:11px;">重置</button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="removeStudentFromExam('${sk.id}','${sk.student_name}')" style="padding:3px 8px;font-size:11px;">删除</button>
      </div>
    </div>`;
  }).join('');
}

async function removeStudentFromExam(studentKeyId, studentName) {
  if (!confirm(`确定将「${studentName}」从此考试中删除？该学生的密钥和成绩记录都会删除。`)) return;
  const result = await api('DELETE', `/api/student-keys/single/${studentKeyId}`);
  if (result.success) {
    toast(`已删除 ${studentName} ✓`);
    S.viewingKeysData = await api('GET', `/api/student-keys/${S.viewingKeysExamId}`);
    renderKeysList();
  } else toast('删除失败，请重试');
}

async function resetStudent(studentKeyId, studentName) {
  if (!confirm(`确定重置「${studentName}」这场考试的成绩？该学生将可以重新作答。`)) return;
  const result = await api('DELETE', `/api/records/student/${studentKeyId}`);
  if (result.success) { toast(`已重置 ${studentName} 的考试成绩 ✓`); S.viewingKeysData = await api('GET', `/api/student-keys/${S.viewingKeysExamId}`); renderKeysList(); }
  else toast('重置失败，请重试');
}
function copyAllKeys() {
  const text = S.viewingKeysData.map(sk => `${sk.student_name}\t${sk.student_key}`).join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板 ✓')).catch(() => fallbackCopy(text)); }
  else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); toast('已复制到剪贴板 ✓'); } catch(e) { toast('请手动复制'); }
  document.body.removeChild(ta);
}
function closeKeysModal() { document.getElementById('modal-keys').classList.remove('open'); }

function openCreateExam() {
  S.editingExamId = null; S.draftQuestions = []; S.choiceCount = 4; S.examType = 'choice';
  document.getElementById('exam-modal-title').textContent = '新建考试';
  ['modal-exam-name','modal-exam-subject','modal-exam-desc','modal-time-limit','modal-student-names'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('modal-choice-count').value = '4';
  document.getElementById('modal-exam-type').value = 'choice';
  const hwEl = document.getElementById('modal-is-homework'); if (hwEl) hwEl.value = '0';
  document.querySelectorAll('input[name="hw-type-radio"]').forEach(r => r.checked = r.value === '0');
  document.getElementById('modal-student-names').placeholder = '每行一个学生姓名，例如：\n张三\n李四\n王五';
  onExamTypeChange();
  updateChoicePreview(); hideAlert('exam-modal-alert'); renderDraftQuestions();
  document.getElementById('modal-exam').classList.add('open');
}

async function editExam(id) {
  const exams = await api('GET', '/api/exams', { teacher_id: S.teacher.id });
  const exam = exams.find(e => e.id === id); if (!exam) return;
  const [questions, skeys] = await Promise.all([api('GET', `/api/questions/${id}?role=teacher`), api('GET', `/api/student-keys/${id}`)]);
  S.editingExamId = id; S.choiceCount = exam.choice_count || 4; S.examType = exam.exam_type || 'choice';
  S.draftQuestions = questions.map(q => {
    // 兼容旧的 img_url/img_url2 和新的 imgs_json
    let imgs = [];
    if (q.imgs_json) {
      try { imgs = JSON.parse(q.imgs_json).map(url => ({ url, file: null, filename: null })); } catch(e) {}
    } else {
      if (q.img_url) imgs.push({ url: q.img_url, file: null, filename: null });
      if (q.img_url2) imgs.push({ url: q.img_url2, file: null, filename: null });
    }
    return { id: q.id, imgs, text: q.question_text || '', answer: q.correct_answer ?? 0, explanation: q.explanation || '', max_score: q.max_score ?? 1 };
  });
  document.getElementById('exam-modal-title').textContent = '编辑考试';
  document.getElementById('modal-exam-name').value    = exam.name;
  document.getElementById('modal-exam-subject').value = exam.subject;
  document.getElementById('modal-exam-desc').value    = exam.description || '';
  document.getElementById('modal-choice-count').value = String(S.choiceCount);
  document.getElementById('modal-exam-type').value    = S.examType;
  const _hwVal = exam.is_homework ? '1' : '0'; const _hwEl = document.getElementById('modal-is-homework'); if (_hwEl) _hwEl.value = _hwVal; document.querySelectorAll('input[name="hw-type-radio"]').forEach(r => r.checked = r.value === _hwVal);
  document.getElementById('modal-time-limit').value   = exam.time_limit_minutes || '';
  document.getElementById('modal-student-names').value = skeys.map(s => s.student_name).join('\n');
  document.getElementById('modal-student-names').placeholder = '编辑时，新增行才会新增学生密钥，已有学生不变';
  onExamTypeChange();
  updateChoicePreview(); hideAlert('exam-modal-alert'); renderDraftQuestions();
  document.getElementById('modal-exam').classList.add('open');
}

function closeExamModal() { document.getElementById('modal-exam').classList.remove('open'); document.getElementById('modal-student-names').placeholder = '每行一个学生姓名，例如：\n张三\n李四\n王五'; }
function onChoiceCountChange() { const val = parseInt(document.getElementById('modal-choice-count').value) || 4; S.choiceCount = Math.max(2, Math.min(8, val)); updateChoicePreview(); renderDraftQuestions(); }
function updateChoicePreview() { const n = parseInt(document.getElementById('modal-choice-count').value) || 4; const el = document.getElementById('choice-count-preview'); if (el) el.textContent = getLetters(n).join('、'); }

function onExamTypeChange() {
  const t = document.getElementById('modal-exam-type')?.value || 'choice';
  S.examType = t;
  // 同步 radio 按钮状态
  document.querySelectorAll('input[name="exam-type-radio"]').forEach(r => { r.checked = r.value === t; });
  const choiceGroup = document.getElementById('choice-count-group');
  if (choiceGroup) choiceGroup.style.display = t === 'frq' ? 'none' : '';
  renderDraftQuestions();
}

async function saveExam() {
  const name = document.getElementById('modal-exam-name').value.trim();
  const subject = document.getElementById('modal-exam-subject').value.trim();
  const description = document.getElementById('modal-exam-desc').value.trim();
  const choiceCount = Math.max(2, Math.min(8, parseInt(document.getElementById('modal-choice-count').value) || 4));
  const examType = document.getElementById('modal-exam-type').value || 'choice';
  const isFrq = examType === 'frq';
  const timeLimitRaw = document.getElementById('modal-time-limit').value.trim();
  const timeLimit = timeLimitRaw ? parseInt(timeLimitRaw) : null;
  const namesRaw = document.getElementById('modal-student-names').value;
  hideAlert('exam-modal-alert');
  if (!name) { showAlert('exam-modal-alert', '请输入考试名称'); return; }
  if (!subject) { showAlert('exam-modal-alert', '请输入科目'); return; }
  const allNames = namesRaw.split('\n').map(n => n.trim()).filter(Boolean);
  const btn = document.getElementById('save-exam-btn'); btn.disabled = true;
  document.getElementById('save-exam-text').textContent = '上传图片中…';
  try {
    for (let i = 0; i < S.draftQuestions.length; i++) {
      const q = S.draftQuestions[i];
      if (!q.imgs) q.imgs = [];
      for (let j = 0; j < q.imgs.length; j++) {
        if (q.imgs[j].file) {
          document.getElementById('save-exam-text').textContent = `上传图片 Q${i+1} (${j+1}/${q.imgs.length})…`;
          const url = await uploadImageToStorage(q.imgs[j].file);
          S.draftQuestions[i].imgs[j] = { url, file: null, filename: q.imgs[j].filename };
        }
      }
    }
    document.getElementById('save-exam-text').textContent = '保存中…';
    let examId = S.editingExamId;
    if (examId) {
      const isHw = document.getElementById('modal-is-homework')?.value === '1';
    await api('PUT', `/api/exams/${examId}`, { name, subject, description, choice_count: choiceCount, time_limit_minutes: timeLimit, exam_type: examType, is_homework: isHw ? 1 : 0 });
      if (allNames.length) {
        const existingKeys = await api('GET', `/api/student-keys/${examId}`);
        const existingNames = new Set(existingKeys.map(s => s.student_name));
        const newNames = allNames.filter(n => !existingNames.has(n));
        if (newNames.length) {
          const existingMap = await api('POST', '/api/student-keys/lookup-names', { names: newNames });
          const needNewKey = newNames.filter(n => !existingMap[n]);
          const newKeys = needNewKey.length ? await genUniqueKeys(needNewKey.length) : [];
          const keyMap = { ...existingMap }; needNewKey.forEach((n, i) => { keyMap[n] = newKeys[i]; });
          await api('POST', '/api/student-keys', { keys: newNames.map(n => ({ exam_id: examId, student_name: n, student_key: keyMap[n] })) });
        }
      }
    } else {
      const isHw2 = document.getElementById('modal-is-homework')?.value === '1';
      const result = await api('POST', '/api/exams', { name, subject, description, choice_count: choiceCount, time_limit_minutes: timeLimit, teacher_id: S.teacher.id, exam_type: examType, is_homework: isHw2 ? 1 : 0 });
      examId = result.id;
      if (allNames.length) {
        const existingMap = await api('POST', '/api/student-keys/lookup-names', { names: allNames });
        const needNewKey = allNames.filter(n => !existingMap[n]);
        const newKeys = needNewKey.length ? await genUniqueKeys(needNewKey.length) : [];
        const keyMap = { ...existingMap }; needNewKey.forEach((n, i) => { keyMap[n] = newKeys[i]; });
        await api('POST', '/api/student-keys', { keys: allNames.map(n => ({ exam_id: examId, student_name: n, student_key: keyMap[n] })) });
      }
    }
    const choices = isFrq ? [] : getLetters(choiceCount);
    await api('POST', `/api/questions/${examId}`, { questions: S.draftQuestions.map((q, i) => ({
      order_idx: i, imgs_json: JSON.stringify((q.imgs||[]).map(im=>im.url).filter(Boolean)), img_url: (q.imgs||[])[0]?.url||null, img_url2: (q.imgs||[])[1]?.url||null, question_text: q.text || null,
      choices, correct_answer: isFrq ? 0 : (q.answer ?? 0), explanation: q.explanation || null,
      question_type: isFrq ? 'frq' : 'choice', max_score: isFrq ? (q.max_score ?? 1) : 1
    })) });
    closeExamModal(); renderExamList(); toast('考试已保存 ✓');
  } catch (err) { showAlert('exam-modal-alert', '保存失败：' + err.message); }
  finally { btn.disabled = false; document.getElementById('save-exam-text').textContent = '保存考试'; }
}

async function toggleExamActive(id) { await api('PUT', `/api/exams/${id}/toggle`); renderExamList(); }

// ── 教师端：学生成绩记录汇总 ──────────────────────────────
async function renderRecords() {
  const statsCont = document.getElementById('records-stats');
  const listCont  = document.getElementById('records-container');
  const filterSubject = document.getElementById('records-filter-subject')?.value || '';
  const filterExam    = document.getElementById('records-filter-exam')?.value || '';
  if (!statsCont || !listCont) return;
  listCont.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:16px 0;">⏳ 加载中…</div>';

  // 拉取该教师所有考试
  let exams= await getExamsByStudent();

  // 更新考试筛选下拉
  const examFilter = document.getElementById('records-filter-exam');
  if (examFilter) {
    const cur = examFilter.value;
    examFilter.innerHTML = '<option value="">全部考试</option>' +
      exams.map(e => `<option value="${e.id}" ${cur===e.id?'selected':''}>${e.name}</option>`).join('');
  }

  if (filterSubject) exams = exams.filter(e => e.subject === filterSubject);
  if (filterExam)    exams = exams.filter(e => e.id === filterExam);

  if (!exams.length) { statsCont.innerHTML = ''; listCont.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">暂无成绩数据</div></div>'; return; }

  // 拉取所有成绩
  let allRecs = [];
  await Promise.all(exams.map(async e => {
    const recs = await api('GET', '/api/records', { exam_id: e.id });
    recs.forEach(r => { r._examName = e.name; r._examSubject = e.subject; r._isFrq = e.exam_type === 'frq'; });
    allRecs = allRecs.concat(recs);
  }));

  if (!allRecs.length) { statsCont.innerHTML = ''; listCont.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">暂无学生提交</div></div>'; return; }

  allRecs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const avg  = allRecs.reduce((s, r) => s + r.score / r.total * 100, 0) / allRecs.length;
  const best = Math.max(...allRecs.map(r => r.score / r.total * 100));
  statsCont.innerHTML = `
    <div class="stat-card"><div class="stat-val">${allRecs.length}</div><div class="stat-label">提交总数</div></div>
    <div class="stat-card"><div class="stat-val">${Math.round(avg)}%</div><div class="stat-label">平均正确率</div></div>
    <div class="stat-card"><div class="stat-val">${Math.round(best)}%</div><div class="stat-label">最高分</div></div>
    <div class="stat-card"><div class="stat-val">${exams.length}</div><div class="stat-label">考试场次</div></div>`;

  listCont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>学生姓名</th><th>考试</th><th>科目</th><th>成绩</th><th>正确率</th><th>切屏</th><th>提交时间</th></tr></thead>
    <tbody>${allRecs.map(r => {
      const pct = Math.round(r.score / r.total * 100);
      const { bg, fg } = scoreColor(pct);
      const sw = r.tab_switches || 0;
      return `<tr>
        <td style="font-weight:500;">${r.student_name}</td>
        <td style="font-size:13px;color:var(--text2);">${r._examName}</td>
        <td><span class="badge badge-blue" style="font-size:10px;">${r._examSubject||'—'}</span></td>
        <td>${r._isFrq ? '<span class="badge badge-amber">FRQ</span>' : `<span class="score-ring" style="background:${bg};color:${fg};">${r.score}/${r.total}</span>`}</td>
        <td><div class="flex gap-2">
          ${r._isFrq ? '<span style="font-size:12px;color:var(--text3);">待批改</span>' : `<div class="progress" style="width:60px;flex-shrink:0;"><div class="progress-bar" style="width:${pct}%;background:${pct>=80?'var(--green)':pct>=60?'var(--amber)':'var(--red)'};"></div></div><span style="font-size:13px;color:var(--text2);">${pct}%</span>`}
        </div></td>
        <td style="color:${sw>=3?'var(--red)':sw>0?'var(--amber)':'var(--text2)'};">${sw>0?'⚠ '+sw:'0'}</td>
        <td style="color:var(--text2);font-size:12px;">${r.created_at || '—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
async function deleteExam(id) {
  if (!confirm('确定删除此考试？学生密钥和成绩记录也会一并删除。')) return;
  await api('DELETE', `/api/exams/${id}`); renderExamList(); toast('考试已删除');
}

function renderDraftQuestions() {
  const cont = document.getElementById('modal-question-list');
  const isFrq = S.examType === 'frq';
  const letters = getLetters(S.choiceCount);
  document.getElementById('modal-q-count').textContent = `(${S.draftQuestions.length} 题)`;
  const emptyHint = isFrq ? '还没有题目，点击「批量上传图片」或「添加文字题」' : '还没有题目，点击「批量上传图片」添加';
  if (!S.draftQuestions.length) { cont.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:12px 0 4px;">${emptyHint}</div>`; return; }
  cont.innerHTML = S.draftQuestions.map((q, i) => {
    const imgs = q.imgs || []; const hasImg = imgs.length > 0, hasText = q.text && q.text.trim();
    const preview = q.filename ? `<span style="font-size:11px;color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.filename}</span>` : hasText ? `<span style="font-size:11px;color:var(--text2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.text.slice(0,40)}${q.text.length>40?'…':''}</span>` : '';
    return `<div class="q-row"><div class="q-row-left">
      <span style="font-weight:600;color:var(--text2);font-size:12px;min-width:28px;">Q${i+1}</span>
      ${hasImg ? `<span class="badge badge-blue" style="font-size:10px;">${imgs.length}张图片</span>` : '<span class="badge badge-gray" style="font-size:10px;">文字</span>'}
      ${imgs.some(im=>im.file) ? '<span class="badge badge-amber" style="font-size:10px;">待上传</span>' : ''}
      ${!isFrq ? `<span class="badge badge-gray" style="font-size:10px;">答案 ${letters[q.answer] ?? '?'}</span>` : `<span class="badge badge-amber" style="font-size:10px;">FRQ · ${q.max_score ?? 1}分</span>`}
      ${preview}${q.explanation ? `<span style="font-size:11px;color:var(--text3);">解析✓</span>` : ''}
    </div><div class="flex gap-1">
      <button class="btn btn-sm btn-ghost" onclick="openEditQuestion(${i})">编辑</button>
      <button class="btn btn-sm btn-danger" onclick="deleteDraftQuestion(${i})">删除</button>
    </div></div>`;
  }).join('');
}
function deleteDraftQuestion(i) { S.draftQuestions.splice(i, 1); renderDraftQuestions(); }

function handleBulkUpload(event) {
  const files = Array.from(event.target.files); if (!files.length) return;
  if (files.length > 10) { toast('⚠ 一次最多上传 10 张图片，请分批上传'); event.target.value = ''; return; }
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  files.forEach(file => S.draftQuestions.push({ imgs: [{ url: URL.createObjectURL(file), file, filename: file.name }], text: '', answer: 0, explanation: '', max_score: 1 }));
  renderDraftQuestions(); toast(`已添加 ${files.length} 道题，保存时自动上传图片 ✓`); event.target.value = '';
}

function addTextQuestion() {
  S.draftQuestions.push({ imgs: [], text: '', answer: 0, explanation: '', max_score: 1 });
  renderDraftQuestions(); openEditQuestion(S.draftQuestions.length - 1);
}

function openEditQuestion(idx) {
  const q = S.draftQuestions[idx]; S.editingQIdx = idx;
  S.draftQImgs = (q.imgs || []).map(im => ({ ...im })); // 深拷贝
  const isFrq = S.examType === 'frq';
  const letters = getLetters(S.choiceCount);
  document.getElementById('q-modal-title').textContent = `编辑 Q${idx + 1}${isFrq ? ' (FRQ)' : ''}`;
  document.getElementById('q-explanation-input').value = q.explanation || '';
  document.getElementById('q-text-input').value = q.text || '';
  // FRQ 不需要答案，但需要分值
  const answerGroup = document.getElementById('q-answer-group');
  if (answerGroup) answerGroup.style.display = isFrq ? 'none' : '';
  const sel = document.getElementById('q-correct-answer');
  if (sel) {
    sel.closest('.form-group').style.display = isFrq ? 'none' : '';
    sel.innerHTML = letters.map((l, i) => `<option value="${i}" ${q.answer===i?'selected':''}>${l}</option>`).join('');
  }
  // FRQ 分值
  const scoreGroup = document.getElementById('q-max-score-group');
  if (scoreGroup) {
    scoreGroup.style.display = isFrq ? '' : 'none';
    const scoreInput = document.getElementById('q-max-score-input');
    if (scoreInput) scoreInput.value = q.max_score ?? 1;
  }
  _renderQImgPreviews();
  document.getElementById('modal-question').classList.add('open');
}
function closeQModal() { document.getElementById('modal-question').classList.remove('open'); }
// 多图上传：最多10张
function handleQImagesUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  const remaining = 10 - S.draftQImgs.length;
  if (remaining <= 0) { toast('最多10张图片'); return; }
  const toAdd = files.slice(0, remaining);
  if (files.length > remaining) toast(`最多10张，已自动截取前 ${remaining} 张`);
  toAdd.forEach(file => {
    S.draftQImgs.push({ url: URL.createObjectURL(file), file, filename: file.name });
  });
  _renderQImgPreviews();
  event.target.value = '';
}
function removeQImg(idx) {
  S.draftQImgs.splice(idx, 1);
  _renderQImgPreviews();
}
function _renderQImgPreviews() {
  const cont = document.getElementById('q-imgs-preview');
  if (!cont) return;
  if (!S.draftQImgs.length) {
    cont.innerHTML = '<div id="q-imgs-placeholder" style="text-align:center;padding:20px;color:var(--text3);font-size:13px;"><div style=\"font-size:24px;margin-bottom:6px;\">📷</div>点击上方按钮添加图片</div>';
    return;
  }
  cont.innerHTML = S.draftQImgs.map((im, i) => `
    <div style="position:relative;display:inline-block;margin:4px;">
      <img src="${im.url}" style="width:100px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);display:block;" />
      ${im.file ? '<div style="position:absolute;top:2px;left:2px;background:var(--amber);color:white;font-size:9px;padding:1px 4px;border-radius:3px;">待传</div>' : ''}
      <button onclick="removeQImg(${i})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;">×</button>
      <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:2px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i+1}/${S.draftQImgs.length}</div>
    </div>`).join('') +
    (S.draftQImgs.length < 10 ? `<label style="display:inline-flex;align-items:center;justify-content:center;width:100px;height:80px;border:1.5px dashed var(--border-md);border-radius:6px;cursor:pointer;color:var(--text3);font-size:22px;margin:4px;vertical-align:top;">+<input type="file" accept="image/*" multiple style="display:none;" onchange="handleQImagesUpload(event)" /></label>` : '');
}
// 兼容旧函数名（不再使用但防止报错）
function handleImageUpload(event) { handleQImagesUpload(event); }
function handleImageUpload2(event) {}
function removeImage2() {}
function saveQuestion() {
  if (S.editingQIdx === null) return;
  S.draftQuestions[S.editingQIdx] = { ...S.draftQuestions[S.editingQIdx], imgs: S.draftQImgs, text: document.getElementById('q-text-input').value.trim(), answer: parseInt(document.getElementById('q-correct-answer').value) || 0, explanation: document.getElementById('q-explanation-input').value.trim(), max_score: parseInt(document.getElementById('q-max-score-input')?.value) || 1 };
  closeQModal(); renderDraftQuestions();
}

// ── 学生登录 ──────────────────────────────────────────────
async function studentLogin() {
  const key = document.getElementById('stu-key').value.trim().toUpperCase();
  hideAlert('stu-alert');
  if (!key) { showAlert('stu-alert', '请输入你的专属密钥'); return; }
  const btn = document.querySelector('#login-student-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '验证中…'; }
  const sk = await api('GET', '/api/student/login', { key });
  if (sk.error) { showAlert('stu-alert', sk.error); if (btn) { btn.disabled = false; btn.textContent = '进入考试'; } return; }
  S.student = { name: sk.student_name, studentKeyId: sk.id, examId: sk.exam_id };
  S.role = 'student';
  sessionStorage.setItem('student', JSON.stringify(S.student));
  document.getElementById('student-name-nav').textContent = sk.student_name;
  document.getElementById('student-avatar-nav').textContent = sk.student_name.trim()[0] || 'S';
  try { const tsData = await api('GET', '/api/records/tab-switches', { student_key_id: sk.id }); if (tsData.tab_switches > 0) S.tabSwitches = tsData.tab_switches; } catch(e) {}
  showScreen('student');
  await renderStudentDashboard(sk.student_name);
}

// ── 学生端主页（左侧导航 + 右侧内容）────────────────────────
let _studentExamItems = [];

async function renderStudentDashboard(studentName) {
  const cont = document.getElementById('student-exam-list');
  cont.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:40px 0;text-align:center;"><div class="spinner" style="margin:0 auto 12px;"></div>加载中…</div>';
  S._lastResult = null;

  const items = await api('GET', '/api/student/exams', { student_name: studentName });
  _studentExamItems = items;

  // 加载收藏（localStorage，按学生名存）
  try {
    const saved = localStorage.getItem('fav_' + studentName);
    S._favorites = new Set(saved ? JSON.parse(saved) : []);
  } catch(e) { S._favorites = new Set(); }

  // 重置导航状态
  S._navSubject = '';
  S._navType = 'all';
  S._navPage = 1;

  // 标记哪些作业有进度（批量查询）
  const hwItems = items.filter(i => (i.exam.is_homework === 1 || i.exam.is_homework === true) && !i.record);
  if (hwItems.length) {
    await Promise.all(hwItems.map(async i => {
      try {
        const prog = await api('GET', '/api/homework-progress', { student_key_id: i.studentKey.id, exam_id: i.exam.id }).catch(() => null);
        i.exam._hasProgress = !!(prog && (Object.keys(prog.frq_answers||{}).length || Object.keys(prog.answers_data||{}).length));
      } catch(e) {}
    }));
  }

  _renderStudentLayout(studentName, items);
}

function _renderStudentLayout(studentName, items) {
  const cont = document.getElementById('student-exam-list');

  const subjectMap = {};
  items.forEach(({ exam, record: rec }) => {
    const s = exam.subject || '其他';
    if (!subjectMap[s]) subjectMap[s] = { mcq: 0, frq: 0, pending: 0, done: 0 };
    const type = (exam.exam_type === 'frq') ? 'frq' : 'mcq';
    subjectMap[s][type]++;
    if (rec) subjectMap[s].done++;
    else if (exam.is_active) subjectMap[s].pending++;
  });

  const subjects = Object.keys(subjectMap).sort();
  const totalDone = items.filter(i => i.record).length;
  const totalPending = items.filter(i => !i.record && i.exam.is_active).length;

  // ── 侧边栏 ──
  let sidebarItems = '';

  // 全部
  const allActive = S._navSubject === '';
  sidebarItems += `<button onclick="navSelect('','all')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${allActive ? 'var(--blue-light)' : 'transparent'};color:${allActive ? 'var(--blue)' : 'var(--text2)'};font-size:13px;font-weight:${allActive ? '600' : '400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
    <span>全部</span>
    <span style="font-size:11px;background:${allActive ? 'var(--blue)' : 'var(--surface2)'};color:${allActive ? 'white' : 'var(--text3)'};padding:1px 6px;border-radius:999px;">${items.length}</span>
  </button>`;

  // 待完成（支持 MCQ/FRQ 子筛选）
  if (totalPending > 0) {
    const pendActive = S._navSubject === '__pending__';
    const pendExpanded = pendActive || S._navExpanded['__pending__'];
    const pendMcq = items.filter(i => !i.record && i.exam.is_active && i.exam.exam_type !== 'frq').length;
    const pendFrq = items.filter(i => !i.record && i.exam.is_active && i.exam.exam_type === 'frq').length;
    const hasBothPend = pendMcq > 0 && pendFrq > 0;
    const triPend = `font-size:9px;display:inline-block;transition:transform 0.2s;transform:rotate(${hasBothPend && pendExpanded ? 90 : 0}deg);opacity:${hasBothPend ? 1 : 0};`;
    sidebarItems += `<div>
      <button onclick="navToggleSubject('__pending__')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${pendActive && S._navType==='all' ? 'var(--amber-light)' : 'transparent'};color:${pendActive ? 'var(--amber)' : 'var(--text2)'};font-size:13px;font-weight:${pendActive ? '600' : '400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
        <span style="display:flex;align-items:center;gap:5px;"><span style="${triPend}">▶</span><span style="width:6px;height:6px;border-radius:50%;background:var(--amber);display:inline-block;"></span>待完成</span>
        <span style="font-size:11px;background:var(--amber-light);color:var(--amber);padding:1px 6px;border-radius:999px;">${totalPending}</span>
      </button>
      ${hasBothPend && pendExpanded ? `<div style="margin:0 6px 2px 22px;">
        <button onclick="navSelect('__pending__','mcq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${pendActive&&S._navType==='mcq'?'var(--amber-light)':'transparent'};color:${pendActive&&S._navType==='mcq'?'var(--amber)':'var(--text3)'};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${pendActive&&S._navType==='mcq'?'600':'400'};">
          <span>选择题 MCQ</span><span style="font-size:11px;">${pendMcq}</span>
        </button>
        <button onclick="navSelect('__pending__','frq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${pendActive&&S._navType==='frq'?'var(--amber-light)':'transparent'};color:${pendActive&&S._navType==='frq'?'var(--amber)':'var(--text3)'};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${pendActive&&S._navType==='frq'?'600':'400'};">
          <span>问答题 FRQ</span><span style="font-size:11px;">${pendFrq}</span>
        </button>
      </div>` : ''}
    </div>`;
  }

  // 收藏
  const favCount = items.filter(i => S._favorites.has(i.exam.id)).length;
  if (favCount > 0) {
    const favActive = S._navSubject === '__favorites__';
    sidebarItems += `<button onclick="navSelect('__favorites__','all')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${favActive ? 'var(--blue-light)' : 'transparent'};color:${favActive ? 'var(--blue)' : 'var(--text2)'};font-size:13px;font-weight:${favActive ? '600' : '400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
      <span style="display:flex;align-items:center;gap:5px;">⭐ 已收藏</span>
      <span style="font-size:11px;background:${favActive ? 'var(--blue)' : 'var(--surface2)'};color:${favActive ? 'white' : 'var(--text3)'};padding:1px 6px;border-radius:999px;">${favCount}</span>
    </button>`;
  }

  // 作业 / 考试 分类（支持 MCQ/FRQ 子筛选）
  const hwCount   = items.filter(i => i.exam.is_homework).length;
  const examCount = items.filter(i => !i.exam.is_homework).length;
  if (hwCount > 0 || examCount > 0) {
    sidebarItems += `<div style="height:1px;background:var(--border);margin:6px 10px 4px;"></div>
    <div style="padding:2px 12px 4px;font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;">类型</div>`;

    // 考试入口
    if (examCount > 0) {
      const examTypeActive = S._navSubject === '__exam__';
      const examExpanded = examTypeActive || S._navExpanded['__exam__'];
      const hwMcqCount = items.filter(i => !i.exam.is_homework && i.exam.exam_type !== 'frq').length;
      const hwFrqCount = items.filter(i => !i.exam.is_homework && i.exam.exam_type === 'frq').length;
      const hasBothExam = hwMcqCount > 0 && hwFrqCount > 0;
      const triExam = `font-size:9px;display:inline-block;transition:transform 0.2s;transform:rotate(${hasBothExam && examExpanded ? 90 : 0}deg);opacity:${hasBothExam ? 1 : 0};`;
      sidebarItems += `<div>
        <button onclick="navToggleSubject('__exam__')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${examTypeActive && S._navType==='all' ? 'var(--blue-light)' : 'transparent'};color:${examTypeActive ? 'var(--blue)' : 'var(--text2)'};font-size:13px;cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
          <span style="display:flex;align-items:center;gap:5px;"><span style="${triExam}">▶</span>📝 考试</span>
          <span style="font-size:11px;background:var(--surface2);color:var(--text3);padding:1px 6px;border-radius:999px;">${examCount}</span>
        </button>
        ${hasBothExam && examExpanded ? `<div style="margin:0 6px 2px 22px;">
          <button onclick="navSelect('__exam__','mcq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${examTypeActive&&S._navType==='mcq'?'var(--blue-light)':'transparent'};color:${examTypeActive&&S._navType==='mcq'?'var(--blue)':'var(--text3)'};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${examTypeActive&&S._navType==='mcq'?'600':'400'};">
            <span>选择题 MCQ</span><span style="font-size:11px;">${hwMcqCount}</span>
          </button>
          <button onclick="navSelect('__exam__','frq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${examTypeActive&&S._navType==='frq'?'var(--blue-light)':'transparent'};color:${examTypeActive&&S._navType==='frq'?'var(--blue)':'var(--text3)'};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${examTypeActive&&S._navType==='frq'?'600':'400'};">
            <span>问答题 FRQ</span><span style="font-size:11px;">${hwFrqCount}</span>
          </button>
        </div>` : ''}
      </div>`;
    }

    // 作业入口
    if (hwCount > 0) {
      const hwTypeActive = S._navSubject === '__homework__';
      const hwExpanded = hwTypeActive || S._navExpanded['__homework__'];
      const hmMcqCount = items.filter(i => i.exam.is_homework && i.exam.exam_type !== 'frq').length;
      const hmFrqCount = items.filter(i => i.exam.is_homework && i.exam.exam_type === 'frq').length;
      const hasBothHw = hmMcqCount > 0 && hmFrqCount > 0;
      const triHw = `font-size:9px;display:inline-block;transition:transform 0.2s;transform:rotate(${hasBothHw && hwExpanded ? 90 : 0}deg);opacity:${hasBothHw ? 1 : 0};`;
      sidebarItems += `<div>
        <button onclick="navToggleSubject('__homework__')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${hwTypeActive && S._navType==='all' ? 'var(--blue-light)' : 'transparent'};color:${hwTypeActive ? 'var(--blue)' : 'var(--text2)'};font-size:13px;cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
          <span style="display:flex;align-items:center;gap:5px;"><span style="${triHw}">▶</span>📚 作业</span>
          <span style="font-size:11px;background:var(--surface2);color:var(--text3);padding:1px 6px;border-radius:999px;">${hwCount}</span>
        </button>
        ${hasBothHw && hwExpanded ? `<div style="margin:0 6px 2px 22px;">
          <button onclick="navSelect('__homework__','mcq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${hwTypeActive&&S._navType==='mcq'?'var(--blue-light)':'transparent'};color:${hwTypeActive&&S._navType==='mcq'?'var(--blue)':'var(--text3)'};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${hwTypeActive&&S._navType==='mcq'?'600':'400'};">
            <span>选择题 MCQ</span><span style="font-size:11px;">${hmMcqCount}</span>
          </button>
          <button onclick="navSelect('__homework__','frq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${hwTypeActive&&S._navType==='frq'?'var(--blue-light)':'transparent'};color:${hwTypeActive&&S._navType==='frq'?'var(--blue)':'var(--text3)'};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${hwTypeActive&&S._navType==='frq'?'600':'400'};">
            <span>问答题 FRQ</span><span style="font-size:11px;">${hmFrqCount}</span>
          </button>
        </div>` : ''}
      </div>`;
    }
  }

  sidebarItems += `<div style="height:1px;background:var(--border);margin:6px 10px 4px;"></div>
  <div style="padding:2px 12px 4px;font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;">科目</div>`;

  // 科目列表
  subjects.forEach(s => {
    const enc = encodeURIComponent(s);
    const info = subjectMap[s];
    const isSelected = S._navSubject === enc;
    const isExpanded = S._navExpanded[enc] === true || isSelected;
    const hasBoth = info.mcq > 0 && info.frq > 0;
    const shortName = s.length > 20 ? s.slice(0, 18) + '…' : s;
    const subBg = isSelected && S._navType === 'all' ? 'var(--blue-light)' : 'transparent';
    const subColor = isSelected ? 'var(--blue)' : 'var(--text2)';
    // 三角形：hasBoth时显示，展开时旋转90度
    const triStyle = `font-size:9px;display:inline-block;transition:transform 0.2s;transform:rotate(${hasBoth && isExpanded ? 90 : 0}deg);color:${isSelected ? 'var(--blue)' : 'var(--text3)'};opacity:${hasBoth ? 1 : 0};`;

    sidebarItems += `<div>
      <button onclick="navToggleSubject('${enc}')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${subBg};color:${subColor};font-size:13px;font-weight:${isSelected ? '600' : '400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
        <span style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;">
          <span style="${triStyle}">▶</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s}">${shortName}</span>
        </span>
        <span style="font-size:11px;background:${isSelected ? 'var(--blue)' : 'var(--surface2)'};color:${isSelected ? 'white' : 'var(--text3)'};padding:1px 6px;border-radius:999px;flex-shrink:0;margin-left:3px;">${info.mcq + info.frq}</span>
      </button>`;

    if (hasBoth && isExpanded) {
      const mcqActive = isSelected && S._navType === 'mcq';
      const frqActive = isSelected && S._navType === 'frq';
      sidebarItems += `<div style="margin:0 6px 2px 22px;">
        <button onclick="navSelect('${enc}','mcq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${mcqActive ? 'var(--blue-light)' : 'transparent'};color:${mcqActive ? 'var(--blue)' : 'var(--text3)'};font-size:12px;cursor:pointer;text-align:left;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${mcqActive ? '600' : '400'};">
          <span>选择题 MCQ</span><span style="font-size:11px;">${info.mcq}</span>
        </button>
        <button onclick="navSelect('${enc}','frq')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${frqActive ? 'var(--blue-light)' : 'transparent'};color:${frqActive ? 'var(--blue)' : 'var(--text3)'};font-size:12px;cursor:pointer;text-align:left;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${frqActive ? '600' : '400'};">
          <span>问答题 FRQ</span><span style="font-size:11px;">${info.frq}</span>
        </button>
      </div>`;
    }
    sidebarItems += `</div>`;
  });

  // 过滤 + 排序 + 分页
  const filtered = _getFilteredItems(items);
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageItems = filtered.slice((S._navPage - 1) * ITEMS_PER_PAGE, S._navPage * ITEMS_PER_PAGE);

  let contentTitle = '全部考试';
  if (S._navSubject === '__pending__') contentTitle = '待完成' + (S._navType==='mcq' ? ' · MCQ' : S._navType==='frq' ? ' · FRQ' : '');
  else if (S._navSubject === '__favorites__') contentTitle = '⭐ 已收藏';
  else if (S._navSubject === '__homework__') contentTitle = '📚 作业' + (S._navType==='mcq' ? ' · MCQ' : S._navType==='frq' ? ' · FRQ' : '');
  else if (S._navSubject === '__exam__') contentTitle = '📝 考试' + (S._navType==='mcq' ? ' · MCQ' : S._navType==='frq' ? ' · FRQ' : '');
  else if (S._navSubject) {
    const decoded = decodeURIComponent(S._navSubject);
    contentTitle = decoded + (S._navType === 'mcq' ? ' · MCQ' : S._navType === 'frq' ? ' · FRQ' : '');
  }

  // 两列网格卡片
  const cardsHtml = pageItems.length === 0
    ? `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">暂无考试</div></div>`
    : `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">${
        pageItems.map(({ studentKey: sk, exam, record: rec }) => _renderExamCard(sk, exam, rec)).join('')
      }</div>`;

  const paginationHtml = totalPages > 1 ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-top:14px;padding-bottom:8px;">
      <button onclick="navPage(${S._navPage - 1})" ${S._navPage <= 1 ? 'disabled' : ''} class="btn btn-sm">← 上页</button>
      ${Array.from({length: totalPages}, (_, i) => i + 1).map(p =>
        `<button onclick="navPage(${p})" class="btn btn-sm" style="${p === S._navPage ? 'background:var(--blue);color:white;border-color:var(--blue);' : ''}">${p}</button>`
      ).join('')}
      <button onclick="navPage(${S._navPage + 1})" ${S._navPage >= totalPages ? 'disabled' : ''} class="btn btn-sm">下页 →</button>
    </div>` : '';

  cont.innerHTML = `
    <div style="display:flex;gap:0;min-height:calc(100vh - 54px);">
      <!-- 左侧导航：固定宽度，贴屏幕左边 -->
      <div style="width:220px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;background:var(--surface);position:sticky;top:54px;height:calc(100vh - 54px);">
        <div style="padding:16px 14px 12px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:var(--blue-light);color:var(--blue);font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${studentName.trim()[0]?.toUpperCase()}</div>
            <div style="min-width:0;">
              <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${studentName}</div>
              <div style="font-size:11px;color:var(--text3);">${totalDone}/${items.length} 完成</div>
            </div>
          </div>
        </div>
        <div style="padding:8px 0 12px;">${sidebarItems}</div>
      </div>
      <!-- 右侧内容：占满剩余宽度 -->
      <div style="flex:1;padding:20px 28px;overflow-y:auto;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:600;">${contentTitle}</div>
          <div style="font-size:12px;color:var(--text3);">${filtered.length} 场${totalPages > 1 ? ` · 第${S._navPage}/${totalPages}页` : ''}</div>
        </div>
        <div id="exam-cards-content">${cardsHtml}</div>
        ${paginationHtml}
      </div>
    </div>`;
}

function _getFilteredItems(items) {
  let filtered = [...items];

  if (S._navSubject === '__pending__') {
    filtered = filtered.filter(i => !i.record && i.exam.is_active);
    if (S._navType === 'mcq') filtered = filtered.filter(i => i.exam.exam_type !== 'frq');
    if (S._navType === 'frq') filtered = filtered.filter(i => i.exam.exam_type === 'frq');
  } else if (S._navSubject === '__favorites__') {
    filtered = filtered.filter(i => S._favorites.has(i.exam.id));
  } else if (S._navSubject === '__homework__') {
    filtered = filtered.filter(i => i.exam.is_homework === 1 || i.exam.is_homework === true);
    if (S._navType === 'mcq') filtered = filtered.filter(i => i.exam.exam_type !== 'frq');
    if (S._navType === 'frq') filtered = filtered.filter(i => i.exam.exam_type === 'frq');
  } else if (S._navSubject === '__exam__') {
    filtered = filtered.filter(i => !i.exam.is_homework);
    if (S._navType === 'mcq') filtered = filtered.filter(i => i.exam.exam_type !== 'frq');
    if (S._navType === 'frq') filtered = filtered.filter(i => i.exam.exam_type === 'frq');
  } else if (S._navSubject) {
    const decoded = decodeURIComponent(S._navSubject);
    filtered = filtered.filter(i => i.exam.subject === decoded);
    if (S._navType === 'mcq') filtered = filtered.filter(i => i.exam.exam_type !== 'frq');
    if (S._navType === 'frq') filtered = filtered.filter(i => i.exam.exam_type === 'frq');
  }

  // 排序：未完成的在前，然后按时间倒序
  filtered.sort((a, b) => {
    // 未完成且开放的排最前
    const aP = !a.record && a.exam.is_active ? 0 : 1;
    const bP = !b.record && b.exam.is_active ? 0 : 1;
    if (aP !== bP) return aP - bP;
    // 同类按名字/时间（这里用 exam id 近似时间，越新的 id 越大）
    return b.exam.id > a.exam.id ? 1 : -1;
  });

  return filtered;
}

function _renderExamCard(sk, exam, rec) {
  const isPending  = !rec && exam.is_active;
  const isClosed   = !rec && !exam.is_active;
  const examType   = exam.exam_type === 'frq' ? 'FRQ' : 'MCQ';
  const isHomework = exam.is_homework === 1 || exam.is_homework === true;
  const isFav      = S._favorites.has(exam.id);
  const favBtn     = `<button onclick="toggleFavorite('${exam.id}',event)" title="${isFav ? '取消收藏' : '收藏'}" style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:16px;padding:2px 4px;line-height:1;opacity:${isFav ? 1 : 0.35};transition:opacity 0.15s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity='${isFav ? 1 : 0.35}'">${isFav ? '⭐' : '☆'}</button>`;

  if (rec) {
    const isFrq = exam.exam_type === 'frq';
    const isGraded = isFrq && rec.frq_score !== null && rec.frq_score !== undefined;
    const pct = !isFrq ? Math.round(rec.score / rec.total * 100) : 0;
    const { fg } = scoreColor(pct);
    return `<div class="card mb-2" style="border-left:3px solid ${isFrq && !isGraded ? 'var(--amber)' : 'var(--green)'};">
      <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div class="flex gap-2 mb-1" style="flex-wrap:wrap;align-items:center;">
            <span style="font-weight:600;">${exam.name}</span>
            <span class="badge badge-blue">${exam.subject}</span>
            <span class="badge badge-gray" style="font-size:10px;">${examType}</span>
            ${isHomework ? '<span class="badge badge-gray" style="font-size:10px;">📚 作业</span>' : ''}
            ${isFrq && !isGraded ? `<span class="badge badge-amber">⏳ 等待批改</span>` : `<span class="badge badge-green">✓ 已完成</span>`}
            ${favBtn}
          </div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px;">
            ${isFrq
              ? isGraded
                ? `<span style="font-size:26px;font-weight:700;letter-spacing:-1px;color:var(--blue);">${rec.frq_score}</span><span style="font-size:15px;color:var(--text2);margin-left:4px;">/ ${rec.frq_max_score ?? rec.total} 分</span>`
                : `<span style="font-size:14px;color:var(--amber);">老师批改后显示成绩</span>`
              : `<span style="font-size:26px;font-weight:700;letter-spacing:-1px;color:${fg};">${pct}%</span><span style="font-size:13px;color:var(--text2);">${rec.score} / ${rec.total} 题正确</span>`}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          <button class="btn btn-sm" onclick="viewMyResult('${sk.id}','${exam.id}')">查看答卷</button>
          <button class="btn btn-sm" onclick="startPracticeMode('${sk.id}','${exam.id}')" style="font-size:11px;color:var(--text3);">再练一遍</button>
        </div>
      </div>
    </div>`;
  } else if (isPending) {
    // 作业：检查是否有进度（可续做）
    const hasProgress = exam._hasProgress;
    const btnLabel = isHomework && hasProgress ? '继续作答 →' : isHomework ? '开始作业 →' : '开始考试 →';
    const btnColor = isHomework ? 'var(--blue)' : 'var(--amber)';
    const borderColor = isHomework ? 'var(--blue)' : 'var(--amber)';
    const bgGrad = isHomework
      ? 'linear-gradient(to right, rgba(24,95,165,0.04), transparent)'
      : 'linear-gradient(to right, rgba(186,117,23,0.04), transparent)';
    return `<div class="card card-hover mb-2" style="border-left:3px solid ${borderColor};background:${bgGrad};">
      <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div class="flex gap-2 mb-1" style="flex-wrap:wrap;align-items:center;">
            <span style="font-weight:600;">${exam.name}</span>
            <span class="badge badge-blue">${exam.subject}</span>
            <span class="badge badge-gray" style="font-size:10px;">${examType}</span>
            ${isHomework ? '<span class="badge badge-blue" style="font-size:10px;">📚 作业</span>' : '<span class="badge badge-amber" style="font-weight:600;">⚡ 考试</span>'}
            ${isHomework && hasProgress ? '<span class="badge badge-green" style="font-size:10px;">进行中</span>' : ''}
            ${exam.time_limit_minutes ? `<span class="badge badge-gray">⏱ ${exam.time_limit_minutes} 分钟</span>` : ''}
            ${favBtn}
          </div>
          ${exam.description ? `<p style="font-size:13px;color:var(--text2);margin-top:4px;">${exam.description}</p>` : ''}
        </div>
        <button class="btn btn-primary" style="background:${btnColor};border-color:${btnColor};" onclick="startExamWithKey('${sk.id}','${exam.id}')">${btnLabel}</button>
      </div>
    </div>`;
  } else {
    return `<div class="card mb-2" style="opacity:0.5;">
      <div class="flex gap-2" style="flex-wrap:wrap;">
        <span style="font-weight:600;">${exam.name}</span>
        <span class="badge badge-blue">${exam.subject}</span>
        <span class="badge badge-gray" style="font-size:10px;">${examType}</span>
        <span class="badge badge-gray">未开放</span>
      </div>
    </div>`;
  }
}

// ── 收藏功能 ──────────────────────────────────────────────
function toggleFavorite(examId, event) {
  if (event) event.stopPropagation();
  if (S._favorites.has(examId)) S._favorites.delete(examId);
  else S._favorites.add(examId);
  // 持久化到 localStorage
  try { localStorage.setItem('fav_' + S.student.name, JSON.stringify([...S._favorites])); } catch(e) {}
  _renderStudentLayout(S.student.name, _studentExamItems);
}

// ── 导航操作函数 ──────────────────────────────────────────
function navSelect(subjectEncoded, type) {
  S._navSubject = subjectEncoded;
  S._navType = type;
  S._navPage = 1;
  if (subjectEncoded) S._navExpanded[subjectEncoded] = true;
  _renderStudentLayout(S.student.name, _studentExamItems);
}

function navSelectPending() {
  S._navSubject = '__pending__';
  S._navType = 'all';
  S._navPage = 1;
  _renderStudentLayout(S.student.name, _studentExamItems);
}

function navToggleSubject(subjectEncoded) {
  if (S._navSubject === subjectEncoded) {
    S._navExpanded[subjectEncoded] = !S._navExpanded[subjectEncoded];
    _renderStudentLayout(S.student.name, _studentExamItems);
  } else {
    S._navExpanded[subjectEncoded] = true;
    // __pending__/__exam__/__homework__ 直接 navSelect，科目走原有逻辑
    if (subjectEncoded === '__pending__') { navSelectPending(); }
    else { navSelect(subjectEncoded, 'all'); }
  }
}

function navPage(p) {
  const items = _getFilteredItems(_studentExamItems);
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  if (p < 1 || p > totalPages) return;
  S._navPage = p;
  _renderStudentLayout(S.student.name, _studentExamItems);
}

// ── 查看答卷 ──────────────────────────────────────────────
async function viewMyResult(studentKeyId, examId) {
  // 防止重复点击：找到按钮并禁用，显示加载状态
  const btn = document.querySelector(`button[onclick*="${studentKeyId}"][onclick*="viewMyResult"]`);
  if (btn) {
    if (btn.disabled) return; // 已在加载中，忽略重复点击
    btn.disabled = true;
    btn.textContent = '加载中…';
  }
  try {
    const [rec, questions] = await Promise.all([
      api('GET', '/api/records', { student_key_id: studentKeyId }),
      api('GET', `/api/questions/${examId}`, { role: 'student_result' })
    ]);
    const examItem = _studentExamItems.find(i => i.exam.id === examId);
    if (!rec || !examItem) { toast('加载失败，请重试'); return; }
    const correctAnswers = rec.correct_answers || {};
    questions.forEach((q, i) => { q.correct_answer = correctAnswers[i] ?? null; });
    S.activeExam = { ...examItem.exam, questionsList: questions };
    S.answers    = rec.answers_data || {};
    S.frqAnswers = rec.frq_answers || {};
    const _parseFrq = v => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch(e) { return {}; } };
    S._frqFeedback  = _parseFrq(rec.frq_feedback);
    S._frqQScores   = _parseFrq(rec.frq_q_scores);
    S.frqAnswers    = _parseFrq(rec.frq_answers);
    S._frqMaxScore  = rec.frq_max_score ?? null;
    S.examType = examItem.exam.exam_type || 'choice';
    S._wrongOnlyMode = false;
    // FRQ: use frq_score if graded, else pass null to trigger pending state
    const displayScore = S.examType === 'frq'
      ? (rec.frq_score ?? null)
      : rec.score;
    showResults(displayScore, rec.total, questions);
  } catch(e) {
    toast('加载失败，请重试');
    if (btn) { btn.disabled = false; btn.textContent = '查看答卷'; }
  }
}

async function startExamWithKey(studentKeyId, examId) {
  const btn = document.querySelector(`button[onclick*="${studentKeyId}"][onclick*="startExamWithKey"]`);
  if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }
  const existing = await api('GET', '/api/records', { student_key_id: studentKeyId });
  if (existing) { toast('你已完成此考试，不能重复作答'); if (btn) { btn.disabled = false; btn.textContent = '开始考试 →'; } return; }
  const items = await api('GET', '/api/student/exams', { student_name: S.student.name });
  const item = items.find(i => i.exam.id === examId);
  const questions = await api('GET', `/api/questions/${examId}`);
  if (!item?.exam || !questions?.length) { toast('考试题目为空，请联系老师'); return; }

  const isHomework = item.exam.is_homework === 1 || item.exam.is_homework === true;

  // 切换考试前清掉旧的自动保存计时器，防止上一个作业的防抖触发时污染新作业的进度
  if (S._frqAutosaveTimer) { clearTimeout(S._frqAutosaveTimer); S._frqAutosaveTimer = null; }
  // 清空 sessionStorage，防止旧作业状态残留
  sessionStorage.removeItem('examState'); sessionStorage.removeItem('examState_frq');
  S.student    = { ...S.student, studentKeyId, examId };
  S.activeExam = { ...item.exam, questionsList: questions };
  S.examType   = item.exam.exam_type || 'choice';
  S.currentQIdx = 0; S.answers = {}; S.frqAnswers = {}; S.eliminatedChoices = {};
  S.flaggedQuestions = new Set(); S._lastAntiCheatTime = 0;
  S._isHomeworkMode = isHomework; // 作业模式：允许中途退出保存

  // 作业：恢复已有进度（直接用服务器数据覆盖，不做合并，防止旧作业答案污染）
  S.frqAnswers = {}; S.answers = {};
  if (isHomework) {
    try {
      const prog = await api('GET', '/api/homework-progress', { student_key_id: studentKeyId, exam_id: examId });
      if (prog) {
        const fa = typeof prog.frq_answers === 'string' ? JSON.parse(prog.frq_answers||'{}') : (prog.frq_answers||{});
        const ad = typeof prog.answers_data === 'string' ? JSON.parse(prog.answers_data||'{}') : (prog.answers_data||{});
        // 直接赋值，不合并——切换作业时必须完全用服务器数据，不能和内存旧数据合并
        S.frqAnswers = fa;
        S.answers = ad;
        if (prog.current_q) S.currentQIdx = prog.current_q;
      }
    } catch(e) {}
  }

  try { const tsData = await api('GET', '/api/records/tab-switches', { student_key_id: studentKeyId }); S.tabSwitches = tsData.tab_switches || 0; } catch(e) { S.tabSwitches = 0; }
  saveExamState();
  showScreen('exam'); renderQuestion(S.currentQIdx);
  // 作业模式：显示「保存并退出」按钮，不防切屏
  // 考试模式：隐藏退出按钮，防切屏
  const exitBtn = document.getElementById('exit-exam-btn');
  if (exitBtn) exitBtn.style.display = isHomework ? '' : 'none';
  if (isHomework) {
    stopAntiCheat();
  } else {
    startAntiCheat();
  }
  startHeartbeat();
  if (item.exam.time_limit_minutes) { startTimer(item.exam.time_limit_minutes * 60); }
  else { stopTimer(); document.getElementById('exam-timer').style.display = 'none'; }
}

// ── 功能9：练习模式（再练一遍，不计成绩）──────────────────
async function startPracticeMode(studentKeyId, examId) {
  const items = _studentExamItems;
  const item = items.find(i => i.exam.id === examId);
  const questions = await api('GET', `/api/questions/${examId}`);
  if (!item?.exam || !questions?.length) { toast('加载失败'); return; }

  S.activeExam = { ...item.exam, questionsList: questions };
  S.examType   = item.exam.exam_type || 'choice';
  S.currentQIdx = 0; S.answers = {}; S.frqAnswers = {}; S.eliminatedChoices = {};
  S.flaggedQuestions = new Set(); S._lastAntiCheatTime = 0;
  S._isPracticeMode = true;  // 标记：练习模式不提交到服务器
  S._isHomeworkMode = false;

  clearExamState();
  showScreen('exam'); renderQuestion(0);
  stopAntiCheat();
  const _exitBtn = document.getElementById('exit-exam-btn');
  if (_exitBtn) _exitBtn.style.display = 'none'; // 练习模式也不显示退出
  stopTimer(); document.getElementById('exam-timer').style.display = 'none';
  // 顶部加练习模式提示
  const navInfo = document.getElementById('exam-nav-info');
  if (navInfo) navInfo.innerHTML = `${item.exam.name} · 练习模式 <span style="background:var(--blue-light);color:var(--blue);font-size:11px;padding:2px 8px;border-radius:999px;margin-left:6px;font-weight:500;">不计成绩</span>`;
}

// ── 心跳 ──────────────────────────────────────────────────
function startHeartbeat() {
  stopHeartbeat();
  if (!S.student?.studentKeyId || !S.activeExam) return;
  const send = () => api('POST', '/api/heartbeat', { student_key_id: S.student.studentKeyId, student_name: S.student.name, exam_id: S.activeExam.id, exam_name: S.activeExam.name, tab_switches: S.tabSwitches || 0, current_q: S.currentQIdx + 1, total_q: S.activeExam.questionsList?.length || 0, timer_left: S._timerSecondsLeft || 0 }).catch(() => {});
  send(); S._heartbeatInterval = setInterval(send, 30000);
}
function stopHeartbeat(keyId) {
  if (S._heartbeatInterval) { clearInterval(S._heartbeatInterval); S._heartbeatInterval = null; }
  const id = keyId || S.student?.studentKeyId;
  if (id) api('DELETE', '/api/heartbeat', { student_key_id: id }).catch(() => {});
}

// ── 倒计时 ────────────────────────────────────────────────
function startTimer(totalSeconds) {
  stopTimer(); S._timerSecondsLeft = totalSeconds; updateTimerDisplay();
  document.getElementById('exam-timer').style.display = 'flex';
  S._timerInterval = setInterval(() => {
    S._timerSecondsLeft--; saveExamState(); updateTimerDisplay();
    if (S._timerSecondsLeft <= 0) { stopTimer(); toast('⏰ 时间到！正在自动提交…'); setTimeout(() => autoSubmitExam(), 800); }
  }, 1000);
}
function stopTimer() { if (S._timerInterval) { clearInterval(S._timerInterval); S._timerInterval = null; } }
function updateTimerDisplay() {
  const el = document.getElementById('exam-timer-text'); if (!el) return;
  const m = Math.floor(S._timerSecondsLeft / 60), s = S._timerSecondsLeft % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const timerEl = document.getElementById('exam-timer');
  if (timerEl) timerEl.style.color = S._timerSecondsLeft <= 60 ? 'var(--red)' : S._timerSecondsLeft <= 300 ? 'var(--amber)' : 'var(--text)';
}

async function autoSubmitExam() {
  stopTimer(); stopAntiCheat(); stopHeartbeat(); clearExamState();
  const exam = S.activeExam, qs = exam.questionsList;
  const result = await api('POST', '/api/records', {
    exam_id: exam.id, student_key_id: S.student.studentKeyId, student_name: S.student.name,
    answers_data: S.answers, frq_answers: S.frqAnswers || {}, tab_switches: S.tabSwitches || 0
  });
  const questionsForDisplay = qs.map((q, i) => ({ ...q, correct_answer: result.correct_answers ? result.correct_answers[i] : undefined }));
  // 把答案写回 activeExam，确保 _renderResultCards 能读到
  if (result.correct_answers) {
    questionsForDisplay.forEach((q, i) => { S.activeExam.questionsList[i].correct_answer = result.correct_answers[i]; });
  }
  _updateLocalRecord(exam.id, S.student.studentKeyId, result);
  showResults(result.score, result.total, questionsForDisplay);
}

// ── 防切屏 ────────────────────────────────────────────────
function triggerAntiCheat(source) {
  if (!document.getElementById('screen-exam')?.classList.contains('active')) return;
  const now = Date.now();
  // 任意来源触发后 10 秒内，所有来源都忽略（防止 visibilitychange + blur + fullscreen 同时触发计两次）
  if (S._lastAntiCheatTime && now - S._lastAntiCheatTime < 10000) return;
  S._lastAntiCheatTime = now;
  // blur 延迟触发时，如果 visibilitychange 已经在这10秒内触发过，直接跳过
  S.tabSwitches = (S.tabSwitches || 0) + 1; saveExamState();
  if (S.student?.studentKeyId) {
    api('POST', '/api/records/tab-switches', { student_key_id: S.student.studentKeyId, tab_switches: S.tabSwitches }).catch(() => {});
    api('POST', '/api/heartbeat', { student_key_id: S.student.studentKeyId, student_name: S.student.name, exam_id: S.activeExam?.id, exam_name: S.activeExam?.name, tab_switches: S.tabSwitches }).catch(() => {});
  }
  _showAntiCheatOverlay();
}
function _showAntiCheatOverlay() {
  const overlay = document.getElementById('anticheat-overlay');
  const msgEl = document.getElementById('anticheat-msg'), countEl = document.getElementById('anticheat-count'), btnEl = document.getElementById('anticheat-btn');
  if (!overlay) return;
  countEl.textContent = S.tabSwitches;
  if (S.tabSwitches >= 3) { msgEl.textContent = '你已离开考试页面 3 次，系统正在自动提交你的答卷…'; btnEl.style.display = 'none'; overlay._shouldShow = true; overlay.style.display = 'flex'; setTimeout(() => autoSubmitExam(), 2000); return; }
  msgEl.textContent = `检测到你离开了考试页面（第 ${S.tabSwitches} 次），再离开 ${3 - S.tabSwitches} 次将自动提交答卷。`;
  btnEl.style.display = ''; btnEl.textContent = '我知道了，继续答题';
  btnEl.onclick = () => { overlay._shouldShow = false; overlay.style.display = 'none'; };
  overlay._shouldShow = true; overlay.style.display = 'flex';
}
function ensureOverlay() {
  if (!document.getElementById('screen-exam')?.classList.contains('active')) return;
  let overlay = document.getElementById('anticheat-overlay');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = 'anticheat-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:9998;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `<div style="background:var(--surface);border-radius:var(--radius);padding:28px 32px;max-width:420px;width:100%;text-align:center;box-shadow:var(--shadow-md);"><div style="font-size:40px;margin-bottom:14px;">⚠️</div><div style="font-size:17px;font-weight:600;margin-bottom:10px;color:var(--red);">检测到离开考试页面</div><div id="anticheat-msg" style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:12px;"></div><div style="font-size:13px;color:var(--text3);margin-bottom:22px;">累计次数：<strong id="anticheat-count" style="color:var(--red);font-size:16px;">0</strong> / 3 次</div><button id="anticheat-btn" class="btn btn-primary btn-block btn-lg">我知道了，继续答题</button></div>`;
    document.body.appendChild(overlay);
    if (S.tabSwitches > 0 && S.tabSwitches < 3) triggerAntiCheat();
  }
  const computedDisplay = window.getComputedStyle(overlay).display;
  if (overlay._shouldShow && computedDisplay === 'none') overlay.style.display = 'flex';
}
function requestExamFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (req) req.call(el).catch(() => {});
}
function startAntiCheat() {
  stopAntiCheat();
  S._acVisibility = () => { if (document.hidden) triggerAntiCheat('visibility'); };
  document.addEventListener('visibilitychange', S._acVisibility);
  S._acBlur = () => { S._acBlurTimer = setTimeout(() => { if (!document.getElementById('screen-exam')?.classList.contains('active')) return; const overlay = document.getElementById('anticheat-overlay'); if (overlay && overlay.style.display === 'flex') return; triggerAntiCheat('blur'); }, 2500); };
  S._acFocus = () => { if (S._acBlurTimer) { clearTimeout(S._acBlurTimer); S._acBlurTimer = null; } };
  window.addEventListener('blur', S._acBlur); window.addEventListener('focus', S._acFocus);
  S._acFullscreen = () => { const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement); if (!isFullscreen && document.getElementById('screen-exam')?.classList.contains('active')) { triggerAntiCheat('fullscreen'); setTimeout(() => requestExamFullscreen(), 2500); } };
  document.addEventListener('fullscreenchange', S._acFullscreen); document.addEventListener('webkitfullscreenchange', S._acFullscreen);
  requestExamFullscreen();
  S._overlayGuard = setInterval(ensureOverlay, 500);
}
function stopAntiCheat() {
  if (S._acVisibility) { document.removeEventListener('visibilitychange', S._acVisibility); S._acVisibility = null; }
  if (S._acBlur) { window.removeEventListener('blur', S._acBlur); S._acBlur = null; }
  if (S._acFocus) { window.removeEventListener('focus', S._acFocus); S._acFocus = null; }
  if (S._acBlurTimer) { clearTimeout(S._acBlurTimer); S._acBlurTimer = null; }
  if (S._overlayGuard) { clearInterval(S._overlayGuard); S._overlayGuard = null; }
  if (S._acFullscreen) { document.removeEventListener('fullscreenchange', S._acFullscreen); document.removeEventListener('webkitfullscreenchange', S._acFullscreen); S._acFullscreen = null; }
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
  if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) exit.call(document).catch(() => {});
}

// ── 标记题目 ──────────────────────────────────────────────
function toggleFlag(idx) {
  if (S.flaggedQuestions.has(idx)) S.flaggedQuestions.delete(idx); else S.flaggedQuestions.add(idx);
  saveExamState();
  const flagBtn = document.getElementById('flag-btn');
  if (flagBtn) {
    const flagged = S.flaggedQuestions.has(idx);
    flagBtn.innerHTML = flagged ? `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 已标记，点击取消` : `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 标记此题`;
    flagBtn.style.background = flagged ? 'var(--amber-light)' : '';
    flagBtn.style.color = flagged ? 'var(--amber)' : '';
    flagBtn.style.borderColor = flagged ? 'var(--amber)' : '';
  }
  _updateNavGrid(idx);
}

const NAV_PAGE_SIZE = 40;
if (S._navGridPage === undefined) S._navGridPage = 0;

function _makeNavGrid(qs, currentIdx) {
  const total = qs.length;
  const totalPages = Math.ceil(total / NAV_PAGE_SIZE);
  const page = S._navGridPage;
  const start = page * NAV_PAGE_SIZE;
  const end = Math.min(start + NAV_PAGE_SIZE, total);

  const btns = qs.slice(start, end).map((_, ii) => {
    const i = start + ii;
    const isCurrent = i === currentIdx, isAnswered = S.answers[i] !== undefined, isFlagged = S.flaggedQuestions.has(i);
    let bg, color, border, extra = '';
    if (isCurrent) { bg = 'var(--blue)'; color = 'white'; border = 'var(--blue)'; }
    else if (isFlagged) { bg = 'var(--amber-light)'; color = 'var(--amber)'; border = 'var(--amber)'; extra = '<span style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;background:var(--amber);border-radius:50%;"></span>'; }
    else if (isAnswered) { bg = 'var(--green-light)'; color = 'var(--green)'; border = 'var(--green)'; }
    else { bg = 'var(--surface)'; color = 'var(--text3)'; border = 'var(--border-md)'; }
    return `<button onclick="renderQuestion(${i})" style="position:relative;width:36px;height:36px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid ${border};background:${bg};color:${color};display:inline-flex;align-items:center;justify-content:center;transition:all 0.1s;">${i+1}${extra}</button>`;
  }).join('');

  // 翻页控件
  const pageNav = totalPages > 1 ? `
    <div style="width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <button onclick="navGridPage(${page-1})" ${page===0?'disabled':''} style="padding:2px 8px;font-size:11px;border:1px solid var(--border-md);background:var(--surface);border-radius:4px;cursor:pointer;color:var(--text2);">← 上页</button>
      <span style="font-size:11px;color:var(--text3);">${page+1} / ${totalPages}</span>
      <button onclick="navGridPage(${page+1})" ${page>=totalPages-1?'disabled':''} style="padding:2px 8px;font-size:11px;border:1px solid var(--border-md);background:var(--surface);border-radius:4px;cursor:pointer;color:var(--text2);">下页 →</button>
    </div>` : '';

  return pageNav + btns;
}

function navGridPage(p) {
  const total = S.activeExam?.questionsList?.length || 0;
  const totalPages = Math.ceil(total / NAV_PAGE_SIZE);
  if (p < 0 || p >= totalPages) return;
  S._navGridPage = p;
  _updateNavGrid(S.currentQIdx);
}

function _updateNavGrid(currentIdx) {
  const navGrid = document.getElementById('exam-nav-grid');
  if (navGrid && S.activeExam) navGrid.innerHTML = _makeNavGrid(S.activeExam.questionsList, currentIdx ?? S.currentQIdx);
}

// ── 答题界面（Bluebook风格）────────────────────────────────
function renderQuestion(idx) {
  // 切题前先把当前 textarea 内容存进旧题号，再切换
  const _prevTa = document.getElementById('frq-answer-input');
  if (_prevTa && S.activeExam?.exam_type === 'frq') {
    S.frqAnswers[S.currentQIdx] = _prevTa.value;
  }
  // 切题时导航格跟着跳到新题所在页
  S._navGridPage = Math.floor(idx / NAV_PAGE_SIZE);
  S.currentQIdx = idx; saveExamState();
  const exam = S.activeExam, qs = exam.questionsList, q = qs[idx];
  const total = qs.length, letters = getLetters(exam.choice_count || 4);
  const answered = Object.keys(S.answers).length, flagged = S.flaggedQuestions.has(idx);

  document.getElementById('exam-nav-info').textContent = `第 ${idx + 1} 题 / 共 ${total} 题`;
  document.getElementById('exam-progress-bar').style.width = `${(idx + 1) / total * 100}%`;

  let qImgs = [];
  if (q.imgs_json) { try { qImgs = JSON.parse(q.imgs_json).filter(Boolean); } catch(e) {} }
  if (!qImgs.length) { if (q.img_url) qImgs.push(q.img_url); if (q.img_url2) qImgs.push(q.img_url2); }
  const imgSrc = qImgs[0] || null, imgSrc2 = qImgs[1] || null, qText = q.question_text || null;
  const extraImgs = qImgs.slice(2);
  const navGrid = _makeNavGrid(qs, idx);
  const choiceHtml = letters.map((l, i) => buildChoiceBtn(l, i, idx, S.answers[idx] === i, S.eliminatedChoices[idx]?.has(i) || false)).join('');

  const isFrqLayout = S.activeExam.exam_type === 'frq';
  document.getElementById('exam-question-area').innerHTML = `
    <div id="exam-split-container" style="display:flex;height:calc(100vh - 96px);overflow:hidden;">
      <!-- 左栏 -->
      <div id="exam-left-pane" style="flex:${isFrqLayout ? '1 1 50%' : '1'};display:flex;flex-direction:column;overflow:hidden;padding:20px 20px 0 24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-shrink:0;">
          <div style="font-size:15px;font-weight:600;color:var(--text);">${exam.subject} · 第 ${idx+1} 题</div>
          <button id="flag-btn" onclick="toggleFlag(${idx})"
            style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid ${flagged?'var(--amber)':'var(--border-md)'};background:${flagged?'var(--amber-light)':'var(--surface)'};color:${flagged?'var(--amber)':'var(--text2)'};transition:all 0.15s;">
            ${flagged ? `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 已标记，点击取消` : `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 标记此题`}
          </button>
        </div>
        <div style="flex:1;overflow:auto;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;">
          ${qImgs.length > 1 ? `<div style="display:flex;flex-direction:column;width:100%;height:100%;overflow-y:auto;padding:8px;">${qImgs.map((u,i)=>`${i>0?'<div style=\"height:1px;background:var(--border);margin:8px 0;flex-shrink:0;\"></div>':''}<img src="${u}" style="max-width:100%;object-fit:contain;display:block;" />`).join('')}</div>`
            : imgSrc ? `<img src="${imgSrc}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" />`
            : qText ? `<div style="padding:36px 40px;font-size:18px;line-height:2;color:var(--text);white-space:pre-wrap;overflow-y:auto;width:100%;height:100%;">${qText}</div>`
            : `<p style="color:var(--text3);font-size:15px;">(无题目内容)</p>`}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;flex-shrink:0;">
          <button class="btn btn-lg" onclick="renderQuestion(${idx-1})" ${idx===0?'disabled':''} style="min-width:100px;">← 上一题</button>
          <span style="font-size:13px;color:var(--text2);">${answered} / ${total} 已作答${S.flaggedQuestions.size > 0 ? ` · ${S.flaggedQuestions.size} 已标记` : ''}</span>
          ${idx < total-1 ? `<button class="btn btn-primary btn-lg" onclick="renderQuestion(${idx+1})" style="min-width:100px;">下一题 →</button>` : `<button class="btn btn-primary btn-lg" onclick="submitExam()" style="min-width:120px;">提交答案 ✓</button>`}
        </div>
      </div>
      <!-- 拖动分割线（仅FRQ） -->
      ${isFrqLayout ? `<div id="exam-divider" onmousedown="startDividerDrag(event)" style="width:6px;flex-shrink:0;cursor:col-resize;background:transparent;border-left:1px solid var(--border);border-right:1px solid var(--border);position:relative;display:flex;align-items:center;justify-content:center;transition:background 0.1s;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'"><div style="width:3px;height:32px;background:var(--border-md);border-radius:99px;"></div></div>` : ''}
      <!-- 右栏 -->
      <div id="exam-right-pane" style="${isFrqLayout ? 'flex:1 1 50%;' : 'width:300px;flex-shrink:0;'}display:flex;flex-direction:column;border-left:${isFrqLayout ? '0' : '1px solid var(--border)'};overflow:hidden;">
        <div style="flex:1;overflow-y:auto;padding:20px 18px 10px;">
          ${S.activeExam.exam_type === 'frq'
            ? `<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:10px;">作答区</div>
               <textarea id="frq-answer-input" placeholder="在此输入你的答案…" oninput="saveFrqAnswer(${idx},this.value)" onkeydown="frqKeyDown(event,${idx})"
                 autocorrect="off" autocapitalize="none" autocomplete="off" spellcheck="false"
                 style="width:100%;height:calc(100% - 40px);min-height:160px;padding:12px 14px;border:1.5px solid var(--border-md);border-radius:var(--radius-sm);font-size:14px;font-family:'DM Sans',sans-serif;resize:none;background:var(--surface);color:var(--text);line-height:1.8;">${S.frqAnswers[idx] || ''}</textarea>
               <div id="frq-autosave-hint" style="font-size:11px;color:var(--text3);margin-top:6px;">自动保存 · 请详细作答</div>`
            : `<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:12px;">选择答案</div>
               <div id="choices-area">${choiceHtml}</div>`}
        </div>
        <div style="flex-shrink:0;border-top:1px solid var(--border);padding:14px 18px;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap;">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--blue);margin-right:3px;vertical-align:middle;"></span>当前</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--green-light);border:1.5px solid var(--green);margin-right:3px;vertical-align:middle;"></span>已答</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--amber-light);border:1.5px solid var(--amber);margin-right:3px;vertical-align:middle;"></span>标记</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--surface);border:1.5px solid var(--border-md);margin-right:3px;vertical-align:middle;"></span>未答</span>
          </div>
          <div id="exam-nav-grid" style="display:flex;flex-wrap:wrap;gap:5px;">${navGrid}</div>
        </div>

      </div>
    </div>`;
}

// ── 拖动分割线 ───────────────────────────────────────
function startDividerDrag(e) {
  e.preventDefault();
  const container = document.getElementById('exam-split-container');
  const leftPane = document.getElementById('exam-left-pane');
  const rightPane = document.getElementById('exam-right-pane');
  if (!container || !leftPane || !rightPane) return;

  const startX = e.clientX;
  const totalW = container.offsetWidth;
  const startLeftW = leftPane.offsetWidth;

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const newLeftW = Math.max(300, Math.min(totalW - 300, startLeftW + dx));
    const pct = (newLeftW / totalW * 100).toFixed(1);
    leftPane.style.flex = `0 0 ${pct}%`;
    rightPane.style.flex = `0 0 ${(100 - pct - 0.5).toFixed(1)}%`;
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function toggleEliminate(qIdx, choiceIdx, event) {
  event.stopPropagation();
  if (!S.eliminatedChoices[qIdx]) S.eliminatedChoices[qIdx] = new Set();
  const set = S.eliminatedChoices[qIdx];
  if (set.has(choiceIdx)) set.delete(choiceIdx); else set.add(choiceIdx);
  const choices = document.getElementById('choices-area');
  if (choices) { const letters = getLetters(S.activeExam.choice_count || 4); choices.innerHTML = letters.map((l, i) => buildChoiceBtn(l, i, qIdx, S.answers[qIdx] === i, S.eliminatedChoices[qIdx]?.has(i))).join(''); }
}

function buildChoiceBtn(l, i, qIdx, sel, elim) {
  const elimStyle = elim ? 'opacity:0.35;text-decoration:line-through;' : '';
  const selStyle  = sel && !elim ? 'border-color:var(--blue);background:var(--blue-light);' : '';
  return `<button class="choice-option ${sel && !elim ? 'selected' : ''}" onclick="selectAnswer(${qIdx},${i})"
    style="width:100%;padding:13px 16px;font-size:16px;margin-bottom:9px;display:flex;align-items:center;gap:14px;border-radius:9px;${selStyle}${elimStyle}position:relative;">
    <span style="width:30px;height:30px;border-radius:50%;background:${sel&&!elim?'var(--blue)':'var(--surface2)'};color:${sel&&!elim?'white':'var(--text2)'};font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${l}</span>
    <span style="font-size:15px;font-weight:${sel&&!elim?'600':'400'};flex:1;">${l}</span>
    <span onclick="toggleEliminate(${qIdx},${i},event)" style="font-size:12px;color:${elim?'var(--red)':'var(--text3)'};padding:3px 6px;border-radius:4px;cursor:pointer;flex-shrink:0;opacity:0.7;" title="划掉此选项">${elim?'↩':'✕'}</span>
  </button>`;
}

function selectAnswer(qIdx, choiceIdx) {
  if (S.eliminatedChoices[qIdx]?.has(choiceIdx)) return;
  S.answers[qIdx] = choiceIdx; saveExamState();
  const exam = S.activeExam, qs = exam.questionsList, letters = getLetters(exam.choice_count || 4);
  const choicesArea = document.getElementById('choices-area');
  if (choicesArea) choicesArea.innerHTML = letters.map((l, i) => buildChoiceBtn(l, i, qIdx, S.answers[qIdx] === i, S.eliminatedChoices[qIdx]?.has(i) || false)).join('');
  _updateNavGrid(qIdx);
  const answered = Object.keys(S.answers).length;
  const countEl = document.querySelector('#exam-question-area span[style*="已作答"]');
  if (countEl) countEl.textContent = `${answered} / ${qs.length} 已作答${S.flaggedQuestions.size > 0 ? ` · ${S.flaggedQuestions.size} 已标记` : ''}`;
}

function _insertText(t, text, newCursorOffset) {
  // 用 execCommand 插入文字，保留浏览器原生 undo/redo 历史（支持 Ctrl+Z）
  // newCursorOffset: 插入后光标相对于插入起点的偏移
  const s = t.selectionStart, end = t.selectionEnd;
  if (document.execCommand && document.execCommand('insertText', false, text)) {
    // execCommand 成功，光标已自动定位到插入内容末尾
    // 如果需要特殊光标位置，再手动设置
    if (newCursorOffset !== undefined) {
      t.selectionStart = t.selectionEnd = s + newCursorOffset;
    }
  } else {
    // 降级：直接赋值（不支持 undo，但保证功能正常）
    const val = t.value;
    t.value = val.substring(0, s) + text + val.substring(end);
    t.selectionStart = t.selectionEnd = newCursorOffset !== undefined ? s + newCursorOffset : s + text.length;
  }
}

function frqKeyDown(e, qIdx) {
  const t = e.target, s = t.selectionStart, end = t.selectionEnd;
  const val = t.value;

  // Tab → 4个空格
  if (e.key === 'Tab') {
    e.preventDefault();
    _insertText(t, '    ');
    saveFrqAnswer(qIdx, t.value);
    return;
  }

  // 自动补全括号/引号
  const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
  if (pairs[e.key] && s === end) {
    e.preventDefault();
    const close = pairs[e.key];
    _insertText(t, e.key + close, 1);
    saveFrqAnswer(qIdx, t.value);
    return;
  }

  // 跳出右括号/引号（已有时直接跳过）
  const closers = new Set(['}', ')', ']', '"', "'"] );
  if (closers.has(e.key) && val[s] === e.key && s === end) {
    e.preventDefault();
    t.selectionStart = t.selectionEnd = s + 1;
    return;
  }

  // Enter 后自动缩进，且 {} 内自动加缩进并把 } 推到下一行
  if (e.key === 'Enter') {
    e.preventDefault();
    const lineStart = val.lastIndexOf('\n', s - 1) + 1;
    const currentLine = val.substring(lineStart, s);
    const indent = currentLine.match(/^(\s*)/)[1];
    const charBefore = val[s - 1];
    const charAfter = val[s];
    if (charBefore === '{' && charAfter === '}') {
      const extra = indent + '    ';
      // 先删掉选中内容，再插入换行+缩进+换行+原缩进
      _insertText(t, '\n' + extra + '\n' + indent, extra.length + 1);
    } else {
      _insertText(t, '\n' + indent);
    }
    saveFrqAnswer(qIdx, t.value);
    return;
  }

  // Backspace 删掉空括号对
  if (e.key === 'Backspace' && s === end && s > 0) {
    const left = val[s - 1], right = val[s];
    const pairMap = { '{': '}', '(': ')', '[': ']' };
    if (pairMap[left] === right) {
      e.preventDefault();
      // 选中这两个字符再 delete
      t.selectionStart = s - 1;
      t.selectionEnd = s + 1;
      document.execCommand('delete') || (() => {
        t.value = val.substring(0, s - 1) + val.substring(s + 1);
        t.selectionStart = t.selectionEnd = s - 1;
      })();
      saveFrqAnswer(qIdx, t.value);
      return;
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function saveFrqAnswer(qIdx, val) {
  S.frqAnswers[qIdx] = val;
  saveExamState();
  // 有内容算已答，更新导航格
  if (val.trim()) S.answers[qIdx] = 0;
  else delete S.answers[qIdx];
  _updateNavGrid(qIdx);
  const answered = Object.keys(S.answers).length;
  const countEl = document.querySelector('#exam-question-area span[style*="已作答"]');
  if (countEl) countEl.textContent = `${answered} / ${S.activeExam.questionsList.length} 已作答${S.flaggedQuestions.size > 0 ? ` · ${S.flaggedQuestions.size} 已标记` : ''}`;
  // 防抖自动上传到服务器（2秒无输入后触发），防止 sessionStorage 存不下导致丢失
  if (S._frqAutosaveTimer) clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer = setTimeout(() => _autoSaveFrqToServer(), 5000);
}

async function _autoSaveFrqToServer() {
  if (!S.student?.studentKeyId || !S.activeExam) return;
  // 快照当前的 key 和 examId，异步完成后再对比，防止切换作业期间污染新作业
  const snapKeyId = S.student.studentKeyId;
  const snapExamId = S.activeExam.id;
  try {
    // 自动保存前也同步当前 textarea 内容，防止丢失
    const ta = document.getElementById('frq-answer-input');
    if (ta) S.frqAnswers[S.currentQIdx] = ta.value;
    // 再次检查：如果已经切换到别的作业，放弃保存
    if (S.student?.studentKeyId !== snapKeyId || S.activeExam?.id !== snapExamId) return;
    await api('POST', '/api/homework-progress', {
      student_key_id: snapKeyId,
      exam_id: snapExamId,
      frq_answers: S.frqAnswers,
      answers_data: S.answers,
      current_q: S.currentQIdx
    });
    // 显示已保存提示（小字，不打扰作答）
    const hint = document.querySelector('#frq-autosave-hint');
    if (hint) { hint.textContent = '已自动保存 ✓'; hint.style.color = 'var(--green)'; setTimeout(() => { if(hint) hint.textContent = '自动保存 · 请详细作答'; hint.style.color = ''; }, 2000); }
  } catch(e) { /* 静默失败，不打断作答 */ }
}

async function exitExam() {
  if (S._isHomeworkMode) {
    if (!confirm('保存进度并退出作业？下次可以继续作答。')) return;
    // 退出前：先取消防抖计时器，并把当前 textarea 的最新内容同步到 S.frqAnswers
    if (S._frqAutosaveTimer) { clearTimeout(S._frqAutosaveTimer); S._frqAutosaveTimer = null; }
    const ta = document.getElementById('frq-answer-input');
    if (ta) { S.frqAnswers[S.currentQIdx] = ta.value; }
    // 保存进度到服务器（用快照，防止异步期间 S 被切换）
    const _exitKeyId = S.student.studentKeyId;
    const _exitExamId = S.activeExam.id;
    const _exitFrq = { ...S.frqAnswers };
    const _exitAns = { ...S.answers };
    const _exitQ = S.currentQIdx;
    try {
      await api('POST', '/api/homework-progress', {
        student_key_id: _exitKeyId, exam_id: _exitExamId,
        frq_answers: _exitFrq, answers_data: _exitAns, current_q: _exitQ
      });
      toast('作业进度已保存 ✓');
    } catch(e) { toast('保存失败，请重试'); return; }
  } else {
    if (!confirm('退出考试？已作答内容不会保存。')) return;
  }
  stopAntiCheat(); stopTimer(); stopHeartbeat(); clearExamState();
  // 彻底清空 sessionStorage，防止残留的 examState 在下次进入其他作业时被 init() 恢复
  sessionStorage.removeItem('examState'); sessionStorage.removeItem('examState_frq');
  document.getElementById('exam-timer').style.display = 'none';
  S.tabSwitches = 0; S.flaggedQuestions = new Set(); S._isHomeworkMode = false;
  showScreen('student');
  const _exitName = S.student.name;
  if (_studentExamItems.length) {
    _renderStudentLayout(_exitName, _studentExamItems);
    api('GET', '/api/student/exams', { student_name: _exitName })
      .then(items => { _studentExamItems = items; _renderStudentLayout(_exitName, items); })
      .catch(() => {});
  } else {
    try { const saved = localStorage.getItem('fav_' + _exitName); S._favorites = new Set(saved ? JSON.parse(saved) : []); } catch(e) {}
    const items = await api('GET', '/api/student/exams', { student_name: _exitName });
    _studentExamItems = items;
    S._navSubject = ''; S._navType = 'all'; S._navPage = 1;
    _renderStudentLayout(_exitName, items);
  }
}

async function submitExam() {
  const exam = S.activeExam, qs = exam.questionsList;
  const answered = Object.keys(S.answers).length, flaggedCount = S.flaggedQuestions.size;

  // 练习模式：直接本地算分展示，不提交到服务器
  if (S._isPracticeMode) {
    stopAntiCheat(); stopTimer(); clearExamState();
    document.getElementById('exam-timer').style.display = 'none';
    const isFrq = exam.exam_type === 'frq';
    // MCQ 本地算分；FRQ 练习模式直接展示作答内容
    let score = 0;
    const questionsForDisplay = qs.map((q, i) => {
      const q2 = { ...q };
      if (!isFrq) {
        // 老师端拿到的 correct_answer 不暴露给学生端，练习模式也不展示答案
        q2.correct_answer = undefined;
      }
      return q2;
    });
    showResults(score, qs.length, questionsForDisplay);
    S._isPracticeMode = false;
    return;
  }

  // 提交前：同步当前 textarea 最新内容到 S.frqAnswers，防止防抖未触发导致丢失
  if (S._frqAutosaveTimer) { clearTimeout(S._frqAutosaveTimer); S._frqAutosaveTimer = null; }
  const _ta = document.getElementById('frq-answer-input');
  if (_ta) S.frqAnswers[S.currentQIdx] = _ta.value;

  // 对于 FRQ：先把当前内容保存到服务器，再拉回来合并，确保所有题目内容都在
  if (exam.exam_type === 'frq' && S.student?.studentKeyId) {
    try {
      // 先保存当前最新内容到服务器
      await api('POST', '/api/homework-progress', {
        student_key_id: S.student.studentKeyId, exam_id: exam.id,
        frq_answers: S.frqAnswers, answers_data: S.answers, current_q: S.currentQIdx
      }).catch(() => {});
      // 再拉回来，用更长的值（防止之前某次自动保存比当前内存更完整）
      const latestProg = await api('GET', '/api/homework-progress', {
        student_key_id: S.student.studentKeyId, exam_id: exam.id
      }).catch(() => null);
      if (latestProg?.frq_answers) {
        const srvAnswers = typeof latestProg.frq_answers === 'string'
          ? JSON.parse(latestProg.frq_answers) : latestProg.frq_answers;
        Object.keys(srvAnswers).forEach(k => {
          const srvVal = srvAnswers[k] || '';
          const localVal = S.frqAnswers[k] || '';
          if (srvVal.length > localVal.length) S.frqAnswers[k] = srvVal;
        });
      }
    } catch(e) {}
  }

  let confirmMsg = '';
  if (answered < qs.length) confirmMsg += `还有 ${qs.length - answered} 题未作答。\n`;
  if (flaggedCount > 0) confirmMsg += `有 ${flaggedCount} 题已标记待检查。\n`;
  confirmMsg += '\n确定要提交答案吗？提交后不能修改。';
  if (!confirm(confirmMsg)) return;
  stopAntiCheat(); stopTimer(); stopHeartbeat(); clearExamState();
  const isFrqExam = S.activeExam.exam_type === 'frq';
  const result = await api('POST', '/api/records', {
    exam_id: exam.id, student_key_id: S.student.studentKeyId, student_name: S.student.name,
    answers_data: S.answers, frq_answers: S.frqAnswers || {}, tab_switches: S.tabSwitches || 0
  });
  if (result.error) { toast('提交失败：' + result.error); return; }
  document.getElementById('exam-timer').style.display = 'none';
  const questionsForDisplay = qs.map((q, i) => ({ ...q, correct_answer: result.correct_answers ? result.correct_answers[i] : undefined }));
  // 立即更新本地缓存，returnToStudent 时不需要重新加载
  _updateLocalRecord(exam.id, S.student.studentKeyId, result);
  showResults(result.score, result.total, questionsForDisplay);
}

// ── 成绩展示（含错题筛选）────────────────────────────────
function toggleWrongOnly() {
  S._wrongOnlyMode = !S._wrongOnlyMode;
  const btn = document.getElementById('wrong-only-btn');
  if (btn) {
    btn.style.background = S._wrongOnlyMode ? 'var(--red-light)' : '';
    btn.style.color = S._wrongOnlyMode ? 'var(--red)' : '';
    btn.style.borderColor = S._wrongOnlyMode ? 'var(--red)' : '';
    btn.textContent = S._wrongOnlyMode ? '✗ 只看错题（点击取消）' : '✗ 只看错题';
  }
  _renderResultCards();
}

function _renderResultCards() {
  const exam = S.activeExam;
  const questions = exam.questionsList;
  const letters = getLetters(exam.choice_count || 4);
  const container = document.getElementById('result-cards-container');
  if (!container) return;

  const toShow = S._wrongOnlyMode
    ? questions.filter((q, i) => {
        const correct = q.correct_answer ?? null, myAns = S.answers[i];
        return correct !== null && myAns !== correct;
      })
    : questions;

  const wrongCount = questions.filter((q, i) => {
    const correct = q.correct_answer ?? null, myAns = S.answers[i];
    return correct !== null && myAns !== correct;
  }).length;

  if (S._wrongOnlyMode && toShow.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-title">全部答对了！</div><div class="empty-desc">没有错题</div></div>`;
    return;
  }

  container.innerHTML = toShow.map(q => {
    const i = questions.indexOf(q);
    const correct = q.correct_answer ?? null, myAns = S.answers[i];
    const isCorrect = correct !== null && myAns === correct;
    const isFrq = q.question_type === 'frq' || exam.exam_type === 'frq';
    let qImgs = []; if (q.imgs_json) { try { qImgs = JSON.parse(q.imgs_json).filter(Boolean); } catch(e) {} } if (!qImgs.length) { if (q.img_url) qImgs.push(q.img_url); if (q.img_url2) qImgs.push(q.img_url2); }
    const hasImg = qImgs.length > 0;
    const qText = q.question_text || null;
    const borderColor = isFrq ? (S._frqQScores?.[i] !== undefined ? 'var(--blue)' : 'var(--border-md)') : (isCorrect ? 'var(--green)' : 'var(--red)');

    return `<div style="border:1px solid var(--border);border-left:4px solid ${borderColor};border-radius:var(--radius);background:var(--surface);margin-bottom:12px;overflow:hidden;">

      <!-- ── 行1：题号栏 ── -->
      <div style="display:flex;align-items:center;gap:10px;padding:7px 16px;background:var(--surface2);border-bottom:1px solid var(--border);">
        <span style="font-size:15px;font-weight:700;color:var(--text);">Q${i+1}</span>
        ${isFrq
          ? (S._frqQScores?.[i] !== undefined
              ? `<span class="badge badge-blue" style="font-size:12px;">${S._frqQScores[i]} / ${q.max_score??1} 分</span>`
              : '<span class="badge badge-gray" style="font-size:11px;">待批改</span>')
          : `<span class="badge ${isCorrect?'badge-green':'badge-red'}" style="font-size:12px;">${isCorrect?'✓ 正确':'✗ 错误'}</span>`}
        ${myAns===undefined&&!isFrq?'<span class="badge badge-gray">未作答</span>':''}
      </div>

      <!-- ── 行2：题目（上下滚动） ── -->
      <div style="padding:10px 16px;border-bottom:1px solid var(--border);overflow-y:auto;max-height:750px;background:var(--bg);">
        ${hasImg
          ? qImgs.map(u => `<img src="${u}" style="width:100%;display:block;margin-bottom:8px;border-radius:4px;" />`).join('')
          : qText
            ? `<div style="font-size:15px;line-height:2;color:var(--text);white-space:pre-wrap;font-family:'DM Mono',monospace;">${qText}</div>`
            : `<span style="color:var(--text3);font-size:14px;">(无题目内容)</span>`}
      </div>

      <!-- ── 行3：得分 + 评语 ── -->
      ${isFrq && (S._frqQScores?.[i] !== undefined || S._frqFeedback?.[i]) ? `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:8px 16px;border-bottom:1px solid var(--border);background:var(--surface);flex-wrap:wrap;">
        ${S._frqQScores?.[i] !== undefined ? `<div style="display:flex;align-items:center;gap:8px;background:var(--blue-light);border-radius:var(--radius-sm);padding:8px 18px;flex-shrink:0;">
          <span style="font-size:12px;font-weight:600;color:var(--blue);">本题得分</span>
          <span style="font-size:26px;font-weight:700;color:var(--blue);line-height:1;">${S._frqQScores[i]}</span>
          <span style="font-size:13px;color:var(--blue);">/ ${q.max_score ?? 1} 分</span>
        </div>` : ''}
        ${S._frqFeedback?.[i] ? `<div style="display:flex;align-items:flex-start;gap:8px;background:var(--amber-light);border-left:3px solid var(--amber);border-radius:var(--radius-sm);padding:8px 14px;flex:1;min-width:200px;">
          <span style="font-size:11px;font-weight:600;color:var(--amber);white-space:nowrap;margin-top:2px;">教师评语</span>
          <span style="font-size:14px;color:var(--text);line-height:1.7;white-space:pre-wrap;">${escapeHtml(S._frqFeedback[i])}</span>
        </div>` : ''}
      </div>` : ''}

      <!-- ── 行4：学生答案 | 参考答案 / 选项 ── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;min-height:160px;">
        <div style="padding:10px 16px;border-right:1px solid var(--border);">
          <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">你的作答</div>
          ${isFrq
            ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:14px;line-height:1.7;white-space:pre;overflow:auto;color:${S.frqAnswers?.[i] ? 'var(--text)' : 'var(--text3)'};font-family:'DM Mono',monospace;">${escapeHtml(S.frqAnswers?.[i]) || '（未作答）'}</div>`
            : `<div style="display:flex;flex-direction:column;gap:6px;">${letters.map((l, ci) => `
              <div class="choice-option ${ci===myAns?isCorrect?'correct-ans':'wrong-ans':''}" style="pointer-events:none;padding:10px 14px;opacity:${ci===myAns?1:0.35};">
                <span class="choice-letter">${l}</span>
                <span style="flex:1;font-size:15px;">${l}</span>
                ${ci===myAns&&isCorrect?'<span style="font-size:12px;color:var(--green);font-weight:600;">✓ 你的选择</span>':''}
                ${ci===myAns&&!isCorrect?'<span style="font-size:12px;color:var(--red);font-weight:600;">✗ 你的选择</span>':''}
              </div>`).join('')}</div>`}
        </div>
        <div style="padding:10px 16px;">
          <div style="font-size:11px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">参考答案</div>
          ${isFrq
            ? `<div style="background:var(--green-light);border:1px solid rgba(59,109,17,0.15);border-radius:var(--radius-sm);padding:10px 12px;font-size:14px;line-height:1.7;white-space:pre;overflow:auto;color:var(--text);font-family:'DM Mono',monospace;">${q.explanation ? escapeHtml(q.explanation) : '<span style="color:var(--text3);">（暂无参考答案）</span>'}</div>`
            : `<div style="display:flex;flex-direction:column;gap:6px;">${letters.map((l, ci) => `
              <div class="choice-option ${ci===correct?'correct-ans':''}" style="pointer-events:none;padding:10px 14px;opacity:${ci===correct?1:0.35};">
                <span class="choice-letter">${l}</span>
                <span style="flex:1;font-size:15px;">${l}</span>
                ${ci===correct?'<span style="font-size:12px;color:var(--green);font-weight:600;">✓ 正确答案</span>':''}
              </div>`).join('')}</div>`}
        </div>
      </div>

    </div>`;
  }).join('');

  // 更新错题统计显示
  const wrongLabel = document.getElementById('wrong-count-label');
  if (wrongLabel) wrongLabel.textContent = `共 ${wrongCount} 题错误`;
}

function showResults(score, total, questions) {
  const exam = S.activeExam;
  S._lastResult = { examId: exam?.id, score, total };
  const isPractice = S._isPracticeMode;
  S._isPracticeMode = false;
  // 把带有 correct_answer 的 questions 同步回 activeExam.questionsList，_renderResultCards 依赖它
  if (questions && exam && exam.questionsList) {
    questions.forEach((q, i) => {
      if (q.correct_answer !== undefined && exam.questionsList[i]) {
        exam.questionsList[i].correct_answer = q.correct_answer;
      }
    });
  }
  const isFrqExam = exam.exam_type === 'frq';
  const pct = Math.round(score / total * 100);
  const { fg } = scoreColor(pct);
  const label = pct >= 80 ? '优秀！' : pct >= 60 ? '良好，继续加油 💪' : '需要多加复习 📖';
  const wrongCount = isFrqExam ? 0 : questions.filter((q, i) => {
    const correct = q.correct_answer ?? null, myAns = S.answers[i];
    return correct !== null && myAns !== correct;
  }).length;

  showScreen('results');
  document.getElementById('results-content').innerHTML = `
    <div style="padding:12px 28px;">
    ${isPractice ? `<div class="card mb-2" style="background:var(--blue-light);border-color:var(--blue-mid);padding:10px 16px;display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">🏋️</span><div><div style="font-size:13px;font-weight:600;color:var(--blue);">练习模式</div><div style="font-size:12px;color:var(--blue);">本次作答不计入成绩</div></div></div>` : ''}
    <div class="card mb-3 result-hero">
      <div style="font-size:13px;color:var(--text2);margin-bottom:6px;">${exam.name}</div>
      ${isFrqExam
        ? (() => {
            if (isPractice) return `<div style="font-size:48px;margin:12px 0;">✍️</div>
              <div style="font-size:18px;font-weight:600;margin-top:4px;">练习完成</div>
              <div style="font-size:14px;color:var(--text2);margin-top:6px;">共 ${total} 题 · 不计入成绩</div>`;
            const isGraded = score !== null && score !== undefined && !isNaN(score) && S._frqQScores && Object.keys(S._frqQScores).length > 0;
            return isGraded
              ? `<div style="font-size:48px;margin:12px 0;">📝</div>
                 <div style="font-size:22px;font-weight:700;margin-top:4px;">已批改</div>
                 <div style="font-size:28px;font-weight:700;color:var(--blue);margin-top:6px;">${score} <span style="font-size:16px;color:var(--text2);font-weight:400;">/ ${S._frqMaxScore ?? total} 分</span></div>`
              : `<div style="font-size:48px;margin:12px 0;">⏳</div>
                 <div style="font-size:18px;font-weight:600;margin-top:4px;">等待批改中</div>
                 <div style="font-size:14px;color:var(--text2);margin-top:6px;">共 ${total} 题 · 老师批改后可查看成绩和评语</div>`;
          })()
        : `<div class="result-score" style="color:${fg};">${pct}%</div>
           <div style="font-size:16px;margin-top:8px;">${score} / ${total} 题正确</div>
           <div style="font-size:14px;color:var(--text2);margin-top:4px;">${label}</div>`}
    </div>

    <!-- 错题筛选工具栏 -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <span id="wrong-count-label" style="font-size:13px;color:var(--text2);">共 ${wrongCount} 题错误</span>
      ${wrongCount > 0 ? `<button id="wrong-only-btn" onclick="toggleWrongOnly()"
        style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid var(--border-md);background:var(--surface);color:var(--text2);transition:all 0.15s;">
        ✗ 只看错题
      </button>` : ''}
    </div>

    <div id="result-cards-container"></div>
    ${!isFrqExam && wrongCount > 0 && !isPractice ? `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <button id="ai-analyze-btn" onclick="analyzeWrongAnswers()" class="btn btn-lg" style="flex:1;min-width:200px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;gap:8px;font-size:15px;">
        <span style="font-size:18px;">✨</span> AI 分析错题
      </button>
      <button onclick="exportWrongPdf()" class="btn btn-lg" style="flex:1;min-width:200px;background:var(--surface);border:1.5px solid var(--border-md);color:var(--text);gap:8px;font-size:15px;">
        <span style="font-size:18px;">📄</span> 导出错题 PDF
      </button>
    </div>
    <div id="ai-result-box" style="display:none;margin-bottom:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;font-size:14px;line-height:1.9;color:var(--text);white-space:pre-wrap;"></div>` : ''}
    <button class="btn btn-primary btn-block btn-lg mb-3" onclick="returnToStudent()">返回我的考试</button>
    </div>`;

  _renderResultCards();
}

// ── 导出错题 PDF ─────────────────────────────────────────
function exportWrongPdf() {
  const exam = S.activeExam;
  const questions = exam.questionsList;
  const letters = getLetters(exam.choice_count || 4);

  const wrongQs = questions.map((q, i) => {
    const correct = q.correct_answer ?? null, myAns = S.answers[i];
    if (correct === null || myAns === correct) return null;
    let qImgs = [];
    if (q.imgs_json) { try { qImgs = JSON.parse(q.imgs_json).filter(Boolean); } catch(e) {} }
    if (!qImgs.length) { if (q.img_url) qImgs.push(q.img_url); if (q.img_url2) qImgs.push(q.img_url2); }
    return { idx: i + 1, q, myAns, correct, qImgs };
  }).filter(Boolean);

  if (!wrongQs.length) { toast('没有错题'); return; }

  const now = new Date().toLocaleDateString('zh-CN');
  const rows = wrongQs.map(({ idx, q, myAns, correct, qImgs }) => `
    <div class="q-block">
      <div class="q-header">
        <span class="q-num">第 ${idx} 题</span>
        <span class="wrong-tag">✗ 我选了 ${letters[myAns] ?? '?'}</span>
        <span class="correct-tag">✓ 正确答案 ${letters[correct]}</span>
      </div>
      ${q.question_text ? `<div class="q-text">${q.question_text}</div>` : ''}
      ${qImgs.map(u => `<img src="${u.startsWith('http') ? u : window.location.origin + u}" class="q-img" />`).join('')}
      ${q.explanation ? `<div class="explanation"><strong>解析：</strong>${q.explanation}</div>` : ''}
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<title>${exam.name} 错题本</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'PingFang SC','Microsoft YaHei',sans-serif; font-size: 14px; color: #1a1a18; background: white; padding: 32px 40px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #888; margin-bottom: 28px; }
  .q-block { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px; page-break-inside: avoid; }
  .q-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .q-num { font-weight: 700; font-size: 15px; }
  .wrong-tag { background: #FCEBEB; color: #A32D2D; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; }
  .correct-tag { background: #EAF3DE; color: #3B6D11; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; }
  .q-text { font-size: 14px; line-height: 1.8; color: #333; margin-bottom: 10px; white-space: pre-wrap; }
  .q-img { max-width: 100%; border-radius: 6px; border: 1px solid #eee; margin: 8px 0; display: block; }
  .explanation { margin-top: 12px; background: #F0EFE9; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #555; line-height: 1.7; }
  @media print {
    body { padding: 16px 20px; }
    .q-block { break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>${exam.name} · 错题本</h1>
  <div class="meta">科目：${exam.subject} &nbsp;·&nbsp; 共 ${wrongQs.length} 道错题 &nbsp;·&nbsp; 导出时间：${now}</div>
  ${rows}
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.print(); };
}

// ── AI 错题分析 ──────────────────────────────────────────
async function analyzeWrongAnswers() {
  const btn = document.getElementById('ai-analyze-btn');
  const box = document.getElementById('ai-result-box');
  if (!btn || !box) return;

  const exam = S.activeExam;
  const questions = exam.questionsList;
  const letters = getLetters(exam.choice_count || 4);

  // 收集错题（含图片URLs）
  const wrongQs = questions.map((q, i) => {
    const correct = q.correct_answer ?? null;
    const myAns = S.answers[i];
    if (correct === null || myAns === correct) return null;
    // 收集图片列表
    let imgs = [];
    if (q.imgs_json) { try { imgs = JSON.parse(q.imgs_json).filter(Boolean); } catch(e) {} }
    if (!imgs.length) { if (q.img_url) imgs.push(q.img_url); if (q.img_url2) imgs.push(q.img_url2); }
    // 转为绝对 URL
    imgs = imgs.map(u => u.startsWith('http') ? u : window.location.origin + u);
    return {
      idx: i + 1,
      text: q.question_text || '',
      imgs,
      myAns: letters[myAns] ?? '未作答',
      correctAns: letters[correct],
      explanation: q.explanation || ''
    };
  }).filter(Boolean);

  if (!wrongQs.length) { toast('没有错题，无需分析'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span style="font-size:16px;">⏳</span> AI 分析中…';
  box.style.display = 'block';
  box.textContent = '';

  // 构建 messages：每道错题单独一个 user content 块，图片用 image_url 传入
  const subject = exam.subject || '未知科目';

  // system prompt
  const systemMsg = {
    role: 'system',
    content: `你是一位经验丰富、严谨细致的${subject}老师。学生刚完成了一场考试，你需要帮他深入分析每道错题。

分析要求：
1. 仔细阅读题目（包括图片中的所有文字、数据、图表、代码等内容）
2. 理解题目考察的核心知识点
3. 分析学生为什么会选错（常见原因：概念混淆、计算失误、审题不仔细、知识盲区等）
4. 给出具体的改正方法和学习建议

回答格式（每题）：
【第X题】
▸ 题目考察：[这道题考察的核心知识点]
▸ 错误原因：[学生为什么会选X而不是正确答案，要结合题目具体内容分析]
▸ 正确思路：[解题的正确步骤或思考方式]
▸ 学习建议：[针对性的复习建议]`
  };

  // 把所有错题合并成一条 user 消息（支持图文混排）
  const userContent = [];
  userContent.push({ type: 'text', text: `以下是学生在"${subject}"考试中答错的 ${wrongQs.length} 道题，请逐题深入分析：` });

  for (const q of wrongQs) {
    const hasImg = q.imgs.length > 0;
    userContent.push({ type: 'text', text: `\n\n━━━━━━━━━━━━━━━━━━\n【第${q.idx}题】学生选了【${q.myAns}】，正确答案是【${q.correctAns}】${q.text ? '\n题目：' + q.text : hasImg ? '\n（题目内容见下方图片，请仔细阅读图中所有信息）' : ''}${q.explanation ? '\n官方解析：' + q.explanation : ''}` });
    for (const url of q.imgs) {
      try {
        const imgResp = await fetch(url);
        const blob = await imgResp.blob();
        const b64 = await new Promise(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(blob);
        });
        userContent.push({ type: 'image_url', image_url: { url: b64 } });
      } catch(e) {
        userContent.push({ type: 'text', text: `[图片加载失败]` });
      }
    }
  }

  userContent.push({ type: 'text', text: `\n\n请按格式逐题分析，要结合题目具体内容，不要泛泛而谈。` });

  try {
    const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 2391191d-05eb-45fd-987a-5cc25eb68b4e'
      },
      body: JSON.stringify({
        model: 'ep-20260407165106-5mjq4',
        stream: true,
        messages: [systemMsg, { role: 'user', content: userContent }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Doubao API error:', resp.status, errText);
      throw new Error('API 请求失败 ' + resp.status + ' | ' + errText);
    }

    // 流式读取
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的行
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) box.textContent += delta;
          } catch(e) {}
        }
      }
    }

    btn.innerHTML = '<span style="font-size:16px;">✨</span> 重新分析';
    btn.disabled = false;
  } catch(e) {
    box.textContent = '分析失败，请检查网络连接后重试。\n错误：' + e.message;
    btn.innerHTML = '<span style="font-size:16px;">✨</span> AI 分析错题';
    btn.disabled = false;
  }
}

function _updateLocalRecord(examId, studentKeyId, result) {
  // 提交后立即更新本地 _studentExamItems 缓存，让返回主页时无需重新拉取
  const item = _studentExamItems.find(i => i.exam.id === examId);
  if (!item) return;
  item.record = {
    score: result.score,
    total: result.total,
    frq_score: result.frq_score ?? null,
    frq_max_score: result.frq_max_score ?? null,
    answers_data: S.answers || {},
    frq_answers: S.frqAnswers || {},
    frq_feedback: {},
    frq_q_scores: {},
    correct_answers: result.correct_answers || {},
    created_at: new Date().toLocaleString('zh-CN')
  };
}

async function returnToStudent() {
  showScreen('student');
  const studentName = S.student.name;

  if (_studentExamItems.length) {
    // 有缓存：立即渲染，后台静默刷新
    _renderStudentLayout(studentName, _studentExamItems);
    api('GET', '/api/student/exams', { student_name: studentName })
      .then(items => {
        items.forEach(item => {
          const local = _studentExamItems.find(i => i.exam.id === item.exam.id);
          if (local?.record && !item.record) item.record = local.record;
        });
        _studentExamItems = items;
        _renderStudentLayout(studentName, items);
      })
      .catch(() => {});
  } else {
    // 无缓存（页面刷新后回来）：不显示加载中，直接拉取再渲染
    const cont = document.getElementById('student-exam-list');
    try {
      const saved = localStorage.getItem('fav_' + studentName);
      S._favorites = new Set(saved ? JSON.parse(saved) : []);
    } catch(e) { S._favorites = new Set(); }
    const items = await api('GET', '/api/student/exams', { student_name: studentName });
    _studentExamItems = items;
    S._navSubject = ''; S._navType = 'all'; S._navPage = 1;
    _renderStudentLayout(studentName, items);
  }
}

init();
