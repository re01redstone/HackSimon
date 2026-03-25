const API = "http://simon.nekko.cn:1234";
const S = {
  teacher: null,
  student: null,
  role: null,
  token: null,
  editingExamId: null,
  draftQuestions: [],
  choiceCount: 4,
  editingQIdx: null,
  draftQImg: null,
  draftQImgFile: null,
  draftQImg2: null,
  draftQImgFile2: null,
  activeExam: null,
  currentQIdx: 0,
  answers: {},
  tabSwitches: 0,
  _lastAntiCheatTime: 0,
  _timerInterval: null,
  _timerSecondsLeft: 0,
  _heartbeatInterval: null,
  _acVisibility: null,
  _acBlur: null,
  _acFocus: null,
  _acBlurTimer: null,
  viewingKeysExamId: null,
  viewingKeysData: [],
  eliminatedChoices: {},
  _currentExamRecords: [],
  _currentExamQuestions: [],
  _currentExamName: "",
};
function saveExamState() {
  if (!S.activeExam || !S.student) return;
  const examLight = {
    id: S.activeExam.id,
    name: S.activeExam.name,
    subject: S.activeExam.subject,
    choice_count: S.activeExam.choice_count,
    time_limit_minutes: S.activeExam.time_limit_minutes,
    is_active: S.activeExam.is_active,
    questionsList: S.activeExam.questionsList.map((q) => ({
      id: q.id,
      exam_id: q.exam_id,
      order_idx: q.order_idx,
      correct_answer: q.correct_answer,
      choices: q.choices,
      explanation: q.explanation,
      img_url: null,
      img_url2: null,
    })),
  };
  const state = {
    activeExam: examLight,
    examId: S.activeExam.id,
    student: S.student,
    answers: S.answers,
    currentQIdx: S.currentQIdx,
    tabSwitches: S.tabSwitches,
    timerSecondsLeft: S._timerSecondsLeft,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem("examState", JSON.stringify(state));
  } catch (e) {
    console.warn("状态保存失败（存储已满）", e);
  }
}
function loadExamState() {
  try {
    const raw = sessionStorage.getItem("examState");
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (Date.now() - state.savedAt > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem("examState");
      return null;
    }
    return state;
  } catch (e) {
    return null;
  }
}
function clearExamState() {
  sessionStorage.removeItem("examState");
}
function getLetters(n) {
  return ["A", "B", "C", "D", "E", "F", "G", "H"].slice(
    0,
    Math.max(2, Math.min(8, n || 4))
  );
}
function genKey(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let k = "";
  for (let i = 0; i < len; i++)
    k += chars[Math.floor(Math.random() * chars.length)];
  return k;
}
async function genUniqueKeys(count) {
  const keys = new Set();
  while (keys.size < count) keys.add(genKey(8));
  const candidates = [...keys];
  const taken = await api("POST", "/api/student-keys/check", {
    keys: candidates,
  });
  const safe = candidates.filter((k) => !taken.includes(k));
  while (safe.length < count) {
    let k;
    do {
      k = genKey(8);
    } while (taken.includes(k) || safe.includes(k));
    safe.push(k);
  }
  return safe;
}
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (S.token) opts.headers["x-session-token"] = S.token;
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const url =
    method === "GET" && body
      ? `${API}${path}?${new URLSearchParams(body)}`
      : `${API}${path}`;
  const res = await fetch(url, opts);
  if (res.status === 401) {
    logout();
    showAlert("tea-alert", "登录已过期，请重新登录");
    throw new Error("401");
  }
  return res.json();
}
async function uploadImageToStorage(file) {
  if (!file) return null;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.url;
}
function toast(msg, dur = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), dur);
}
function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById("screen-" + id).classList.add("active");
}
function showAlert(id, msg, type = "danger") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = "block";
}
function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}
function scoreColor(pct) {
  if (pct >= 80) return { bg: "var(--green-light)", fg: "#173404" };
  if (pct >= 60) return { bg: "var(--amber-light)", fg: "#412402" };
  return { bg: "var(--red-light)", fg: "#501313" };
}
async function init() {
  const examState = loadExamState();
  if (examState) {
    S.activeExam = examState.activeExam;
    S.student = examState.student;
    S.answers = examState.answers;
    S.currentQIdx = examState.currentQIdx;
    S.tabSwitches = examState.tabSwitches;
    document.getElementById("student-name-nav").textContent = S.student.name;
    document.getElementById("student-avatar-nav").textContent =
      S.student.name.trim()[0] || "S";
    showScreen("exam");
    try {
      const freshQs = await api("GET", `/api/questions/${S.activeExam.id}`);
      if (freshQs && freshQs.length) {
        S.activeExam.questionsList = freshQs;
      }
    } catch (e) {
      console.warn("图片重载失败", e);
    }
    renderQuestion(S.currentQIdx);
    startAntiCheat();
    if (examState.timerSecondsLeft > 0 && S.activeExam.time_limit_minutes) {
      S._timerSecondsLeft = examState.timerSecondsLeft;
      document.getElementById("exam-timer").style.display = "flex";
      updateTimerDisplay();
      S._timerInterval = setInterval(() => {
        S._timerSecondsLeft--;
        saveExamState();
        updateTimerDisplay();
        if (S._timerSecondsLeft <= 0) {
          stopTimer();
          toast("⏰ 时间到！正在自动提交…");
          setTimeout(() => autoSubmitExam(), 800);
        }
      }, 1000);
    } else {
      document.getElementById("exam-timer").style.display = "none";
    }
    return;
  }
  const saved = sessionStorage.getItem("teacher");
  if (saved) {
    S.teacher = JSON.parse(saved);
    S.role = "teacher";
    S.token = sessionStorage.getItem("teacherToken") || null;
    showTeacherDashboard();
    return;
  }
  const savedStudent = sessionStorage.getItem("student");
  if (savedStudent) {
    S.student = JSON.parse(savedStudent);
    S.role = "student";
    document.getElementById("student-name-nav").textContent = S.student.name;
    document.getElementById("student-avatar-nav").textContent =
      S.student.name.trim()[0] || "S";
    showScreen("student");
    await renderStudentDashboard(S.student.name);
    return;
  }
  showScreen("login");
}
function switchLoginTab(tab) {
  document
    .querySelectorAll("#screen-login .tab-btn")
    .forEach((b, i) =>
      b.classList.toggle("active", (i === 0) === (tab === "student"))
    );
  document.getElementById("login-student-panel").style.display =
    tab === "student" ? "" : "none";
  document.getElementById("login-teacher-panel").style.display =
    tab === "teacher" ? "" : "none";
}
async function teacherLogin() {
  const email = document.getElementById("tea-email").value.trim();
  const pass = document.getElementById("tea-pass").value;
  hideAlert("tea-alert");
  if (!email || !pass) {
    showAlert("tea-alert", "请填写账号和密码");
    return;
  }
  const btn = document.querySelector("#login-teacher-panel .btn-primary");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "登录中…";
  }
  const result = await api("POST", "/api/teacher/login", {
    email,
    password: pass,
  });
  if (result.error) {
    showAlert("tea-alert", result.error);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "教师登录";
    }
    return;
  }
  S.teacher = result.teacher;
  S.role = "teacher";
  S.token = result.token;
  sessionStorage.setItem("teacher", JSON.stringify(result.teacher));
  sessionStorage.setItem("teacherToken", result.token);
  showTeacherDashboard();
}
function registerTeacher() {
  showScreen("login");
}
function showRegister() {
  showScreen("login");
}
function logout() {
  sessionStorage.removeItem("teacher");
  sessionStorage.removeItem("teacherToken");
  sessionStorage.removeItem("student");
  if (S.token) {
    api("POST", "/api/teacher/logout").catch(() => {});
    S.token = null;
  }
  clearExamState();
  stopAntiCheat();
  stopTimer();
  if (typeof stopHeartbeat === "function") stopHeartbeat();
  S.teacher = null;
  S.student = null;
  S.role = null;
  const teacherBtn = document.querySelector(
    "#login-teacher-panel .btn-primary"
  );
  if (teacherBtn) {
    teacherBtn.disabled = false;
    teacherBtn.textContent = "教师登录";
  }
  const studentBtn = document.querySelector(
    "#login-student-panel .btn-primary"
  );
  if (studentBtn) {
    studentBtn.disabled = false;
    studentBtn.textContent = "进入考试";
  }
  ["tea-email", "tea-pass", "stu-key"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  hideAlert("tea-alert");
  hideAlert("stu-alert");
  showScreen("login");
}
function showTeacherDashboard() {
  const name = S.teacher?.full_name || "老师";
  document.getElementById("teacher-name-display").textContent = name;
  document.getElementById("teacher-avatar").textContent = name
    .trim()[0]
    .toUpperCase();
  showScreen("teacher");
  switchTeacherTab("exams");
}
function switchTeacherTab(tab) {
  ["exams", "records", "live"].forEach((t) => {
    document.getElementById("teacher-tab-" + t).style.display =
      t === tab ? "block" : "none";
  });
  document
    .querySelectorAll("#screen-teacher .tab-btn")
    .forEach((b, i) =>
      b.classList.toggle("active", ["exams", "records", "live"][i] === tab)
    );
  if (tab === "exams") renderExamList();
  if (tab === "live") renderLiveMonitor();
}
let _liveInterval = null;
async function renderLiveMonitor() {
  const cont = document.getElementById("teacher-tab-live");
  if (_liveInterval) clearInterval(_liveInterval);
  _liveInterval = setInterval(renderLiveMonitor, 10000);
  await _renderLive(cont);
}
async function _renderLive(cont) {
  const rows = await api("GET", "/api/heartbeat/active");
  if (!rows.length) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">👀</div><div class="empty-title">当前没有学生在考试</div></div>`;
    return;
  }
  const byExam = {};
  rows.forEach((r) => {
    if (!byExam[r.exam_name]) byExam[r.exam_name] = [];
    byExam[r.exam_name].push(r);
  });
  cont.innerHTML =
    `<div style="margin-bottom:12px;font-size:13px;color:var(--text2);">每10秒自动刷新 · 共 <strong style="color:var(--text);">${rows.length}</strong> 人在线</div>` +
    Object.entries(byExam)
      .map(
        ([examName, students]) => `
<div class="card mb-2">
<div style="font-weight:600;margin-bottom:10px;">${examName} <span class="badge badge-green">${
          students.length
        } 人在线</span></div>
<div style="display:flex;flex-wrap:wrap;gap:8px;">
${students
  .map((s) => {
    const sw = s.tab_switches || 0;
    const swTag =
      sw > 0
        ? `<span style="background:${
            sw >= 3 ? "var(--red-light)" : "var(--amber-light)"
          };color:${
            sw >= 3 ? "var(--red)" : "var(--amber)"
          };font-size:11px;padding:1px 6px;border-radius:999px;margin-left:4px;">⚠${sw}次</span>`
        : "";
    const progress = s.total_q
      ? `<span style="font-size:11px;color:var(--green);margin-left:4px;">${
          s.current_q || 1
        }/${s.total_q}题</span>`
      : "";
    const timer =
      s.timer_left > 0
        ? (() => {
            const m = Math.floor(s.timer_left / 60),
              sec = s.timer_left % 60;
            return `<span style="font-size:11px;color:${
              s.timer_left <= 60
                ? "var(--red)"
                : s.timer_left <= 300
                ? "var(--amber)"
                : "var(--green)"
            };margin-left:4px;">⏱${String(m).padStart(2, "0")}:${String(
              sec
            ).padStart(2, "0")}</span>`;
          })()
        : "";
    return `<span style="background:var(--green-light);color:var(--green);padding:4px 10px;border-radius:999px;font-size:13px;display:inline-flex;align-items:center;gap:2px;">● ${s.student_name}${progress}${timer}${swTag}</span>`;
  })
  .join("")}
</div>
</div>`
      )
      .join("");
}
async function renderExamList() {
  const cont = document.getElementById("exam-list-container");
  const filterSubject = document.getElementById("exam-filter-subject").value;
  cont.innerHTML =
    '<div style="color:var(--text2);font-size:13px;padding:20px 0;">加载中…</div>';
  let exams = await api("GET", "/api/student/exams",{student_name:"郭宇轩"});
  let exams2=[];
  for(let i=0;i<exams.length;i++){
        exams2.push(exams[i].exam);
    }
  exams=exams2;
  if (filterSubject) exams = exams.filter((e) => e.subject === filterSubject);
  if (!exams.length) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">还没有考试</div><div class="empty-desc">点击「新建考试」创建第一个</div></div>`;
    return;
  }
  cont.innerHTML = exams
    .map((e) => {
      const modeLabel = getLetters(e.choice_count || 4).join("/");
      const timeLabel = e.time_limit_minutes
        ? ` · ⏱ ${e.time_limit_minutes} 分钟`
        : "";
      const teacherTag =
        S.teacher.id === "teacher-1" && e.teacher_name
          ? `<span class="badge badge-amber" style="font-size:10px;">👤 ${e.teacher_name}</span>`
          : "";
      return `<div class="card card-hover mb-2">
<div class="flex-between">
<div style="flex:1;min-width:0;">
<div class="flex gap-2 mb-1" style="flex-wrap:wrap;">
<span style="font-weight:600;font-size:15px;">${e.name}</span>
<span class="badge badge-blue">${e.subject}</span>
<span class="badge badge-gray">${modeLabel}</span>
<span class="badge ${e.is_active ? "badge-green" : "badge-gray"}">${
        e.is_active ? "开放中" : "已关闭"
      }</span>
${teacherTag}
</div>
<div style="font-size:13px;color:var(--text2);">${e.questions_count} 题 · ${
        e.students_count
      } 位学生${timeLabel}${e.description ? " · " + e.description : ""}</div>
</div>
<div class="flex gap-1" style="margin-left:12px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
<button class="btn btn-sm" onclick="viewExamRecords('${e.id}','${
        e.name
      }')">查看成绩</button>
<button class="btn btn-sm" onclick="viewStudentKeys('${e.id}','${
        e.name
      }')">学生密钥</button>
<button class="btn btn-sm" onclick="toggleExamActive('${e.id}')">${
        e.is_active ? "关闭" : "开放"
      }</button>
<button class="btn btn-sm" onclick="editExam('${e.id}')">编辑</button>
<button class="btn btn-sm btn-danger" onclick="deleteExam('${
        e.id
      }')">删除</button>
</div>
</div>
</div>`;
    })
    .join("");
}
async function viewExamRecords(examId, examName) {
  document.getElementById(
    "exam-records-modal-title"
  ).textContent = `成绩 — ${examName}`;
  const cont = document.getElementById("exam-records-list");
  cont.innerHTML =
    '<div style="color:var(--text2);font-size:13px;padding:16px 0;">加载中…</div>';
  document.getElementById("modal-exam-records").classList.add("open");
  S._currentExamName = examName;
  const [recs, qs] = await Promise.all([
    api("GET", "/api/records", { exam_id: examId }),
    api("GET", `/api/questions/${examId}?role=teacher`),
  ]);
  S._currentExamRecords = recs;
  S._currentExamQuestions = qs;
  if (!recs.length) {
    cont.innerHTML =
      '<div style="color:var(--text2);font-size:13px;padding:16px 0;">暂无学生提交</div>';
    return;
  }
  const avg =
    recs.reduce((s, r) => s + (r.score / r.total) * 100, 0) / recs.length;
  const best = Math.max(...recs.map((r) => (r.score / r.total) * 100));
  const qAccuracy = qs.map((q, qi) => {
    const answered = recs.filter(
      (r) => r.answers_data && r.answers_data[qi] !== undefined
    );
    if (!answered.length) return 0;
    const correct = answered.filter(
      (r) => r.answers_data[qi] === q.correct_answer
    ).length;
    return Math.round((correct / answered.length) * 100);
  });
  const qAccuracyHtml = qs.length
    ? `
<div style="margin-bottom:18px;">
<div style="font-size:13px;font-weight:600;margin-bottom:10px;">每题正确率</div>
<div style="display:flex;flex-wrap:wrap;gap:8px;">
${qs
  .map((q, qi) => {
    const pct = qAccuracy[qi];
    const color =
      pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
    const bg =
      pct >= 80
        ? "var(--green-light)"
        : pct >= 50
        ? "var(--amber-light)"
        : "var(--red-light)";
    return `<div style="background:${bg};border-radius:var(--radius-sm);padding:6px 10px;text-align:center;min-width:52px;">
<div style="font-size:11px;color:var(--text2);margin-bottom:2px;">Q${
      qi + 1
    }</div>
<div style="font-size:14px;font-weight:600;color:${color};">${pct}%</div>
</div>`;
  })
  .join("")}
</div>
</div>`
    : "";
  cont.innerHTML = `
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
<div class="stat-card"><div class="stat-val">${
    recs.length
  }</div><div class="stat-label">提交人数</div></div>
<div class="stat-card"><div class="stat-val">${Math.round(
    avg
  )}%</div><div class="stat-label">平均分</div></div>
<div class="stat-card"><div class="stat-val">${Math.round(
    best
  )}%</div><div class="stat-label">最高分</div></div>
</div>
${qAccuracyHtml}
<div class="table-wrap"><table>
<thead><tr><th>学生姓名</th><th>成绩</th><th>正确率</th><th>切屏</th><th>提交时间</th></tr></thead>
<tbody>${recs
    .map((r) => {
      const pct = Math.round((r.score / r.total) * 100);
      const { bg, fg } = scoreColor(pct);
      const sw = r.tab_switches || 0;
      return `<tr>
<td style="font-weight:500;">${r.student_name}</td>
<td><span class="score-ring" style="background:${bg};color:${fg};">${r.score}/${
        r.total
      }</span></td>
<td><div class="flex gap-2">
<div class="progress" style="width:70px;flex-shrink:0;"><div class="progress-bar" style="width:${pct}%;background:${
        pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--amber)" : "var(--red)"
      };"></div></div>
<span style="font-size:13px;color:var(--text2);">${pct}%</span>
</div></td>
<td style="color:${
        sw >= 3 ? "var(--red)" : sw > 0 ? "var(--amber)" : "var(--text2)"
      };">${sw > 0 ? "⚠ " + sw : "0"}</td>
<td style="color:var(--text2);font-size:12px;">${r.created_at || "—"}</td>
</tr>`;
    })
    .join("")}</tbody>
</table></div>`;
}
function closeExamRecordsModal() {
  document.getElementById("modal-exam-records").classList.remove("open");
}
function downloadExamExcel() {
  const recs = S._currentExamRecords,
    qs = S._currentExamQuestions,
    name = S._currentExamName;
  if (!recs.length) {
    toast("暂无数据");
    return;
  }
  const qHeaders = qs.map((_, i) => `Q${i + 1}答题`).join(",");
  const qAccRow = qs
    .map((q, qi) => {
      const correct = recs.filter(
        (r) => r.answers_data && r.answers_data[qi] === q.correct_answer
      ).length;
      return recs.length > 0
        ? Math.round((correct / recs.length) * 100) + "%"
        : "0%";
    })
    .join(",");
  const letters = ["A", "B", "C", "D", "E"];
  const header = `姓名,得分,总题数,正确率(%),切屏次数,提交时间${
    qs.length ? "," + qHeaders : ""
  }`;
  const accRow = `全班正确率,,,,,${qs.length ? "," + qAccRow : ""}`;
  const rows = recs
    .map((r) => {
      const pct = Math.round((r.score / r.total) * 100),
        sw = r.tab_switches || 0;
      const qCells = qs
        .map((q, qi) => {
          const ans = r.answers_data?.[qi];
          return ans !== undefined ? letters[ans] || ans : "未答";
        })
        .join(",");
      return `${r.student_name},${r.score},${r.total},${pct}%,${sw},${
        r.created_at || ""
      }${qs.length ? "," + qCells : ""}`;
    })
    .join("\n");
  const csv = "\uFEFF" + header + "\n" + accRow + "\n" + rows;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `${name}_成绩单.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("成绩单已下载 ✓");
}
async function viewStudentKeys(examId, examName) {
  S.viewingKeysExamId = examId;
  document.getElementById(
    "keys-modal-title"
  ).textContent = `学生专属密钥 — ${examName}`;
  document.getElementById("keys-list").innerHTML =
    '<div style="color:var(--text2);font-size:13px;">加载中…</div>';
  document.getElementById("modal-keys").classList.add("open");
  S.viewingKeysData = await api("GET", `/api/student-keys/${examId}`);
  renderKeysList();
}
function renderKeysList() {
  const cont = document.getElementById("keys-list");
  if (!S.viewingKeysData.length) {
    cont.innerHTML =
      '<div style="color:var(--text2);font-size:13px;">此考试暂无学生名单</div>';
    return;
  }
  cont.innerHTML = S.viewingKeysData
    .map((sk) => {
      const submitted = sk.has_record;
      const scoreText = submitted ? ` · ${sk.score}/${sk.total}` : "";
      return `<div class="sk-row">
<span class="sk-name">${sk.student_name}</span>
<span class="sk-key">${sk.student_key}</span>
<span class="sk-status" style="color:${
        submitted ? "var(--green)" : "var(--text3)"
      };">${submitted ? "已提交" + scoreText : "未提交"}</span>
${
  submitted
    ? `<button class="btn btn-sm btn-danger" onclick="resetStudent('${sk.id}','${sk.student_name}')" style="padding:3px 8px;font-size:11px;">重置</button>`
    : '<span style="width:52px;display:inline-block;"></span>'
}
</div>`;
    })
    .join("");
}
async function resetStudent(studentKeyId, studentName) {
  if (
    !confirm(`确定重置「${studentName}」这场考试的成绩？该学生将可以重新作答。`)
  )
    return;
  const result = await api("DELETE", `/api/records/student/${studentKeyId}`);
  if (result.success) {
    toast(`已重置 ${studentName} 的考试成绩 ✓`);
    S.viewingKeysData = await api(
      "GET",
      `/api/student-keys/${S.viewingKeysExamId}`
    );
    renderKeysList();
  } else {
    toast("重置失败，请重试");
  }
}
function copyAllKeys() {
  const text = S.viewingKeysData
    .map((sk) => `${sk.student_name}\t${sk.student_key}`)
    .join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast("已复制到剪贴板 ✓"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    toast("已复制到剪贴板 ✓");
  } catch (e) {
    toast("请手动复制");
  }
  document.body.removeChild(ta);
}
function closeKeysModal() {
  document.getElementById("modal-keys").classList.remove("open");
}
function openCreateExam() {
  S.editingExamId = null;
  S.draftQuestions = [];
  S.choiceCount = 4;
  document.getElementById("exam-modal-title").textContent = "新建考试";
  [
    "modal-exam-name",
    "modal-exam-subject",
    "modal-exam-desc",
    "modal-time-limit",
    "modal-student-names",
  ].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("modal-choice-count").value = "4";
  document.getElementById("modal-student-names").placeholder =
    "每行一个学生姓名，例如：\n张三\n李四\n王五";
  updateChoicePreview();
  hideAlert("exam-modal-alert");
  renderDraftQuestions();
  document.getElementById("modal-exam").classList.add("open");
}
async function editExam(id) {
  const exams = await api("GET", "/api/exams", { teacher_id: S.teacher.id });
  const exam = exams.find((e) => e.id === id);
  if (!exam) return;
  const [questions, skeys] = await Promise.all([
    api("GET", `/api/questions/${id}?role=teacher`),
    api("GET", `/api/student-keys/${id}`),
  ]);
  S.editingExamId = id;
  S.choiceCount = exam.choice_count || 4;
  S.draftQuestions = questions.map((q) => ({
    id: q.id,
    img: q.img_url || null,
    imgFile: null,
    img2: q.img_url2 || null,
    imgFile2: null,
    answer: q.correct_answer ?? 0,
    explanation: q.explanation || "",
  }));
  document.getElementById("exam-modal-title").textContent = "编辑考试";
  document.getElementById("modal-exam-name").value = exam.name;
  document.getElementById("modal-exam-subject").value = exam.subject;
  document.getElementById("modal-exam-desc").value = exam.description || "";
  document.getElementById("modal-choice-count").value = String(S.choiceCount);
  document.getElementById("modal-time-limit").value =
    exam.time_limit_minutes || "";
  document.getElementById("modal-student-names").value = skeys
    .map((s) => s.student_name)
    .join("\n");
  document.getElementById("modal-student-names").placeholder =
    "编辑时，新增行才会新增学生密钥，已有学生不变";
  updateChoicePreview();
  hideAlert("exam-modal-alert");
  renderDraftQuestions();
  document.getElementById("modal-exam").classList.add("open");
}
function closeExamModal() {
  document.getElementById("modal-exam").classList.remove("open");
  document.getElementById("modal-student-names").placeholder =
    "每行一个学生姓名，例如：\n张三\n李四\n王五";
}
function onChoiceCountChange() {
  const val =
    parseInt(document.getElementById("modal-choice-count").value) || 4;
  S.choiceCount = Math.max(2, Math.min(8, val));
  updateChoicePreview();
  renderDraftQuestions();
}
function updateChoicePreview() {
  const n = parseInt(document.getElementById("modal-choice-count").value) || 4;
  const el = document.getElementById("choice-count-preview");
  if (el) el.textContent = getLetters(n).join("、");
}
async function saveExam() {
  const name = document.getElementById("modal-exam-name").value.trim();
  const subject = document.getElementById("modal-exam-subject").value.trim();
  const description = document.getElementById("modal-exam-desc").value.trim();
  const choiceCount = Math.max(
    2,
    Math.min(
      8,
      parseInt(document.getElementById("modal-choice-count").value) || 4
    )
  );
  const timeLimitRaw = document.getElementById("modal-time-limit").value.trim();
  const timeLimit = timeLimitRaw ? parseInt(timeLimitRaw) : null;
  const namesRaw = document.getElementById("modal-student-names").value;
  hideAlert("exam-modal-alert");
  if (!name) {
    showAlert("exam-modal-alert", "请输入考试名称");
    return;
  }
  if (!subject) {
    showAlert("exam-modal-alert", "请输入科目");
    return;
  }
  const allNames = namesRaw
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  const btn = document.getElementById("save-exam-btn");
  btn.disabled = true;
  document.getElementById("save-exam-text").textContent = "上传图片中…";
  try {
    for (let i = 0; i < S.draftQuestions.length; i++) {
      const q = S.draftQuestions[i];
      if (q.imgFile) {
        document.getElementById("save-exam-text").textContent = `上传图片1 ${
          i + 1
        }/${S.draftQuestions.length}…`;
        const url = await uploadImageToStorage(q.imgFile);
        S.draftQuestions[i].img = url;
        S.draftQuestions[i].imgFile = null;
      }
      if (q.imgFile2) {
        document.getElementById("save-exam-text").textContent = `上传图片2 ${
          i + 1
        }/${S.draftQuestions.length}…`;
        const url2 = await uploadImageToStorage(q.imgFile2);
        S.draftQuestions[i].img2 = url2;
        S.draftQuestions[i].imgFile2 = null;
      }
    }
    document.getElementById("save-exam-text").textContent = "保存中…";
    let examId = S.editingExamId;
    if (examId) {
      await api("PUT", `/api/exams/${examId}`, {
        name,
        subject,
        description,
        choice_count: choiceCount,
        time_limit_minutes: timeLimit,
      });
      if (allNames.length) {
        const existingKeys = await api("GET", `/api/student-keys/${examId}`);
        const existingNames = new Set(existingKeys.map((s) => s.student_name));
        const newNames = allNames.filter((n) => !existingNames.has(n));
        if (newNames.length) {
          const existingMap = await api(
            "POST",
            "/api/student-keys/lookup-names",
            { names: newNames }
          );
          const needNewKey = newNames.filter((n) => !existingMap[n]);
          const newKeys = needNewKey.length
            ? await genUniqueKeys(needNewKey.length)
            : [];
          const keyMap = { ...existingMap };
          needNewKey.forEach((n, i) => {
            keyMap[n] = newKeys[i];
          });
          await api("POST", "/api/student-keys", {
            keys: newNames.map((n) => ({
              exam_id: examId,
              student_name: n,
              student_key: keyMap[n],
            })),
          });
        }
      }
    } else {
      const result = await api("POST", "/api/exams", {
        name,
        subject,
        description,
        choice_count: choiceCount,
        time_limit_minutes: timeLimit,
        teacher_id: S.teacher.id,
      });
      examId = result.id;
      if (allNames.length) {
        const existingMap = await api(
          "POST",
          "/api/student-keys/lookup-names",
          { names: allNames }
        );
        const needNewKey = allNames.filter((n) => !existingMap[n]);
        const newKeys = needNewKey.length
          ? await genUniqueKeys(needNewKey.length)
          : [];
        const keyMap = { ...existingMap };
        needNewKey.forEach((n, i) => {
          keyMap[n] = newKeys[i];
        });
        await api("POST", "/api/student-keys", {
          keys: allNames.map((n) => ({
            exam_id: examId,
            student_name: n,
            student_key: keyMap[n],
          })),
        });
      }
    }
    const choices = getLetters(choiceCount);
    await api("POST", `/api/questions/${examId}`, {
      questions: S.draftQuestions.map((q, i) => ({
        order_idx: i,
        img_url: q.img || null,
        img_url2: q.img2 || null,
        question_text: q.text || null,
        choices,
        correct_answer: q.answer ?? 0,
        explanation: q.explanation || null,
      })),
    });
    closeExamModal();
    renderExamList();
    toast("考试已保存 ✓");
  } catch (err) {
    showAlert("exam-modal-alert", "保存失败：" + err.message);
  } finally {
    btn.disabled = false;
    document.getElementById("save-exam-text").textContent = "保存考试";
  }
}
async function toggleExamActive(id) {
  await api("PUT", `/api/exams/${id}/toggle`);
  renderExamList();
}
async function deleteExam(id) {
  if (!confirm("确定删除此考试？学生密钥和成绩记录也会一并删除。")) return;
  await api("DELETE", `/api/exams/${id}`);
  renderExamList();
  toast("考试已删除");
}
function renderDraftQuestions() {
  const cont = document.getElementById("modal-question-list");
  const letters = getLetters(S.choiceCount);
  document.getElementById(
    "modal-q-count"
  ).textContent = `(${S.draftQuestions.length} 题)`;
  if (!S.draftQuestions.length) {
    cont.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:12px 0 4px;">还没有题目，点击「批量上传图片」添加</div>`;
    return;
  }
  cont.innerHTML = S.draftQuestions
    .map((q, i) => {
      const hasImg = q.img || q.imgFile;
      const hasText = q.text && q.text.trim();
      const preview = q.filename
        ? `<span style="font-size:11px;color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.filename}</span>`
        : hasText
        ? `<span style="font-size:11px;color:var(--text2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.text.slice(
            0,
            40
          )}${q.text.length > 40 ? "…" : ""}</span>`
        : "";
      return `<div class="q-row">
<div class="q-row-left">
<span style="font-weight:600;color:var(--text2);font-size:12px;min-width:28px;">Q${
        i + 1
      }</span>
${
  hasImg
    ? `<span class="badge badge-blue" style="font-size:10px;">${
        (q.img || q.imgFile) && (q.img2 || q.imgFile2) ? "双图" : "图片"
      }</span>`
    : '<span class="badge badge-gray" style="font-size:10px;">文字</span>'
}
${
  q.imgFile
    ? '<span class="badge badge-amber" style="font-size:10px;">待上传</span>'
    : ""
}
<span class="badge badge-gray" style="font-size:10px;">答案 ${
        letters[q.answer] ?? "?"
      }</span>
${preview}
${
  q.explanation
    ? `<span style="font-size:11px;color:var(--text3);">解析✓</span>`
    : ""
}
</div>
<div class="flex gap-1">
<button class="btn btn-sm btn-ghost" onclick="openEditQuestion(${i})">编辑</button>
<button class="btn btn-sm btn-danger" onclick="deleteDraftQuestion(${i})">删除</button>
</div>
</div>`;
    })
    .join("");
}
function deleteDraftQuestion(i) {
  S.draftQuestions.splice(i, 1);
  renderDraftQuestions();
}
function handleBulkUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  if (files.length > 10) {
    toast("⚠ 一次最多上传 10 张图片，请分批上传");
    event.target.value = "";
    return;
  }
  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
  files.forEach((file) =>
    S.draftQuestions.push({
      img: URL.createObjectURL(file),
      imgFile: file,
      img2: null,
      imgFile2: null,
      filename: file.name,
      text: "",
      answer: 0,
      explanation: "",
    })
  );
  renderDraftQuestions();
  toast(`已添加 ${files.length} 道题，保存时自动上传图片 ✓`);
  event.target.value = "";
}
function addTextQuestion() {
  S.draftQuestions.push({
    img: null,
    imgFile: null,
    img2: null,
    imgFile2: null,
    filename: null,
    text: "",
    answer: 0,
    explanation: "",
  });
  renderDraftQuestions();
  openEditQuestion(S.draftQuestions.length - 1);
}
function openEditQuestion(idx) {
  const q = S.draftQuestions[idx];
  S.editingQIdx = idx;
  S.draftQImg = q.img || null;
  S.draftQImgFile = q.imgFile || null;
  S.draftQImg2 = q.img2 || null;
  S.draftQImgFile2 = q.imgFile2 || null;
  const letters = getLetters(S.choiceCount);
  document.getElementById("q-modal-title").textContent = `编辑 Q${idx + 1}`;
  document.getElementById("q-explanation-input").value = q.explanation || "";
  document.getElementById("q-text-input").value = q.text || "";
  const sel = document.getElementById("q-correct-answer");
  sel.innerHTML = letters
    .map(
      (l, i) =>
        `<option value="${i}" ${q.answer === i ? "selected" : ""}>${l}</option>`
    )
    .join("");
  if (q.img) {
    document.getElementById("upload-img-tag").src = q.img;
    document.getElementById("upload-preview").style.display = "";
    document.getElementById("upload-placeholder").style.display = "none";
  } else {
    document.getElementById("upload-preview").style.display = "none";
    document.getElementById("upload-placeholder").style.display = "";
  }
  if (q.img2) {
    document.getElementById("upload-img-tag2").src = q.img2;
    document.getElementById("upload-preview2").style.display = "";
    document.getElementById("upload-placeholder2").style.display = "none";
  } else {
    document.getElementById("upload-preview2").style.display = "none";
    document.getElementById("upload-placeholder2").style.display = "";
  }
  document.getElementById("modal-question").classList.add("open");
}
function closeQModal() {
  document.getElementById("modal-question").classList.remove("open");
}
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  S.draftQImgFile = file;
  S.draftQImg = URL.createObjectURL(file);
  document.getElementById("upload-img-tag").src = S.draftQImg;
  document.getElementById("upload-preview").style.display = "";
  document.getElementById("upload-placeholder").style.display = "none";
}
function handleImageUpload2(event) {
  const file = event.target.files[0];
  if (!file) return;
  S.draftQImgFile2 = file;
  S.draftQImg2 = URL.createObjectURL(file);
  document.getElementById("upload-img-tag2").src = S.draftQImg2;
  document.getElementById("upload-preview2").style.display = "";
  document.getElementById("upload-placeholder2").style.display = "none";
}
function removeImage2() {
  S.draftQImg2 = null;
  S.draftQImgFile2 = null;
  document.getElementById("upload-preview2").style.display = "none";
  document.getElementById("upload-placeholder2").style.display = "";
}
function saveQuestion() {
  if (S.editingQIdx === null) return;
  S.draftQuestions[S.editingQIdx] = {
    ...S.draftQuestions[S.editingQIdx],
    img: S.draftQImg,
    imgFile: S.draftQImgFile,
    img2: S.draftQImg2,
    imgFile2: S.draftQImgFile2,
    text: document.getElementById("q-text-input").value.trim(),
    answer: parseInt(document.getElementById("q-correct-answer").value) || 0,
    explanation: document.getElementById("q-explanation-input").value.trim(),
  };
  closeQModal();
  renderDraftQuestions();
}
async function studentLogin() {
  const key = document.getElementById("stu-key").value.trim().toUpperCase();
  hideAlert("stu-alert");
  if (!key) {
    showAlert("stu-alert", "请输入你的专属密钥");
    return;
  }
  const btn = document.querySelector("#login-student-panel .btn-primary");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "验证中…";
  }
  const sk = await api("GET", "/api/student/login", { key });
  if (sk.error) {
    showAlert("stu-alert", sk.error);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "进入考试";
    }
    return;
  }
  S.student = {
    name: sk.student_name,
    studentKeyId: sk.id,
    examId: sk.exam_id,
  };
  S.role = "student";
  sessionStorage.setItem("student", JSON.stringify(S.student));
  document.getElementById("student-name-nav").textContent = sk.student_name;
  document.getElementById("student-avatar-nav").textContent =
    sk.student_name.trim()[0] || "S";
  try {
    const tsData = await api("GET", "/api/records/tab-switches", {
      student_key_id: sk.id,
    });
    if (tsData.tab_switches > 0) S.tabSwitches = tsData.tab_switches;
  } catch (e) {}
  showScreen("student");
  await renderStudentDashboard(sk.student_name);
}
async function renderStudentDashboard(studentName) {
  const cont = document.getElementById("student-exam-list");
  cont.innerHTML =
    '<div style="color:var(--text2);font-size:13px;padding:20px 0;">加载中…</div>';
  S._lastResult = null;
  const items = await api("GET", "/api/student/exams", {
    student_name: studentName,
  });
  const doneCount = items.filter((i) => i.record).length;
  const subjects = [
    ...new Set(items.map((i) => i.exam.subject).filter(Boolean)),
  ].sort();
  const filterBar =
    subjects.length > 1
      ? `
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
<span style="font-size:12px;color:var(--text2);">筛选：</span>
<button onclick="filterStudentExams('')" id="sf-all" class="btn btn-sm" style="font-size:12px;background:var(--blue);color:white;border-color:var(--blue);">全部</button>
${subjects
  .map(
    (s) =>
      `<button onclick="filterStudentExams('${s}')" id="sf-${s}" class="btn btn-sm" style="font-size:12px;">${s}</button>`
  )
  .join("")}
</div>`
      : "";
  let html = `
<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
<div style="width:48px;height:48px;border-radius:50%;background:var(--blue-light);color:var(--blue);font-size:18px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${studentName
    .trim()[0]
    ?.toUpperCase()}</div>
<div>
<div style="font-size:18px;font-weight:600;">${studentName}</div>
<div style="font-size:13px;color:var(--text2);">共 ${
    items.length
  } 场考试 · 已完成 ${doneCount} 场</div>
</div>
</div>
${filterBar}
<div id="student-exam-cards">`;
  if (!items.length) {
    html +=
      '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">暂无考试</div><div class="empty-desc">请联系老师确认名单</div></div>';
    cont.innerHTML = html + "</div>";
    return;
  }
  const sorted = [...items].sort((a, b) => !!a.record - !!b.record);
  html += sorted
    .map(({ studentKey: sk, exam, record: rec }) => {
      if (rec) {
        const pct = Math.round((rec.score / rec.total) * 100),
          { fg } = scoreColor(pct);
        return `<div class="card mb-2">
<div class="flex-between" style="flex-wrap:wrap;gap:12px;">
<div style="flex:1;min-width:0;">
<div class="flex gap-2 mb-1" style="flex-wrap:wrap;">
<span style="font-weight:600;">${exam.name}</span>
<span class="badge badge-blue">${exam.subject}</span>
<span class="badge badge-green">✓ 已完成</span>
</div>
<div style="display:flex;align-items:baseline;gap:10px;margin-top:6px;">
<span style="font-size:28px;font-weight:700;letter-spacing:-1px;color:${fg};">${pct}%</span>
<span style="font-size:13px;color:var(--text2);">${rec.score} / ${rec.total} 题正确</span>
</div>
</div>
<button class="btn btn-sm" onclick="viewMyResult('${sk.id}','${exam.id}')">查看答卷</button>
</div>
</div>`;
      } else if (!exam.is_active) {
        return `<div class="card mb-2" style="opacity:0.55;">
<div class="flex gap-2">
<span style="font-weight:600;">${exam.name}</span>
<span class="badge badge-blue">${exam.subject}</span>
<span class="badge badge-gray">未开放</span>
</div>
</div>`;
      } else {
        return `<div class="card card-hover mb-2">
<div class="flex-between" style="flex-wrap:wrap;gap:12px;">
<div style="flex:1;min-width:0;">
<div class="flex gap-2 mb-1" style="flex-wrap:wrap;">
<span style="font-weight:600;">${exam.name}</span>
<span class="badge badge-blue">${exam.subject}</span>
<span class="badge badge-amber">未作答</span>
${
  exam.time_limit_minutes
    ? `<span class="badge badge-gray">⏱ ${exam.time_limit_minutes} 分钟</span>`
    : ""
}
</div>
${
  exam.description
    ? `<p style="font-size:13px;color:var(--text2);margin-top:4px;">${exam.description}</p>`
    : ""
}
</div>
<button class="btn btn-primary" onclick="startExamWithKey('${sk.id}','${
          exam.id
        }')">开始考试</button>
</div>
</div>`;
      }
    })
    .join("");
  html += "</div>";
  cont.innerHTML = html;
  cont._examItems = items;
}
function filterStudentExams(subject) {
  const cont = document.getElementById("student-exam-list");
  const items = cont._examItems;
  if (!items) return;
  document.querySelectorAll('[id^="sf-"]').forEach((b) => {
    b.style.background = "var(--surface)";
    b.style.color = "var(--text)";
    b.style.borderColor = "var(--border-md)";
  });
  const activeBtn = document.getElementById(
    subject ? "sf-" + subject : "sf-all"
  );
  if (activeBtn) {
    activeBtn.style.background = "var(--blue)";
    activeBtn.style.color = "white";
    activeBtn.style.borderColor = "var(--blue)";
  }
  const filtered = subject
    ? items.filter((i) => i.exam.subject === subject)
    : items;
  const sorted = [...filtered].sort((a, b) => !!a.record - !!b.record);
  const cards = document.getElementById("student-exam-cards");
  if (!cards) return;
  cards.innerHTML = sorted
    .map(({ studentKey: sk, exam, record: rec }) => {
      if (rec) {
        const pct = Math.round((rec.score / rec.total) * 100),
          { fg } = scoreColor(pct);
        return `<div class="card mb-2"><div class="flex-between" style="flex-wrap:wrap;gap:12px;"><div style="flex:1;min-width:0;"><div class="flex gap-2 mb-1" style="flex-wrap:wrap;"><span style="font-weight:600;">${exam.name}</span><span class="badge badge-blue">${exam.subject}</span><span class="badge badge-green">✓ 已完成</span></div><div style="display:flex;align-items:baseline;gap:10px;margin-top:6px;"><span style="font-size:28px;font-weight:700;letter-spacing:-1px;color:${fg};">${pct}%</span><span style="font-size:13px;color:var(--text2);">${rec.score} / ${rec.total} 题正确</span></div></div><button class="btn btn-sm" onclick="viewMyResult('${sk.id}','${exam.id}')">查看答卷</button></div></div>`;
      } else if (!exam.is_active) {
        return `<div class="card mb-2" style="opacity:0.55;"><div class="flex gap-2"><span style="font-weight:600;">${exam.name}</span><span class="badge badge-blue">${exam.subject}</span><span class="badge badge-gray">未开放</span></div></div>`;
      } else {
        return `<div class="card card-hover mb-2"><div class="flex-between" style="flex-wrap:wrap;gap:12px;"><div style="flex:1;min-width:0;"><div class="flex gap-2 mb-1" style="flex-wrap:wrap;"><span style="font-weight:600;">${
          exam.name
        }</span><span class="badge badge-blue">${
          exam.subject
        }</span><span class="badge badge-amber">未作答</span>${
          exam.time_limit_minutes
            ? `<span class="badge badge-gray">⏱ ${exam.time_limit_minutes} 分钟</span>`
            : ""
        }</div>${
          exam.description
            ? `<p style="font-size:13px;color:var(--text2);margin-top:4px;">${exam.description}</p>`
            : ""
        }</div><button class="btn btn-primary" onclick="startExamWithKey('${
          sk.id
        }','${exam.id}')">开始考试</button></div></div>`;
      }
    })
    .join("");
}
async function viewMyResult(studentKeyId, examId) {
  const [rec, questions] = await Promise.all([
    api("GET", "/api/records", { student_key_id: studentKeyId }),
    api("GET", `/api/questions/${examId}?role=teacher`),
  ]);
  const exam = (
    await api("GET", "/api/student/exams", { student_name: S.student.name })
  ).find((i) => i.exam.id === examId)?.exam;
  if (!rec || !exam) {
    toast("加载失败，请重试");
    return;
  }
  S.activeExam = { ...exam, questionsList: questions };
  S.answers = rec.answers_data || {};
  showResults(rec.score, rec.total, questions);
}
async function startExamWithKey(studentKeyId, examId) {
  const btn = document.querySelector(`button[onclick*="${studentKeyId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "加载中…";
  }
  const existing = await api("GET", "/api/records", {
    student_key_id: studentKeyId,
  });
  if (existing) {
    toast("你已完成此考试，不能重复作答");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "开始考试";
    }
    return;
  }
  const items = await api("GET", "/api/student/exams", {
    student_name: S.student.name,
  });
  const item = items.find((i) => i.exam.id === examId);
  const questions = await api("GET", `/api/questions/${examId}`);
  if (!item?.exam || !questions?.length) {
    toast("考试题目为空，请联系老师");
    return;
  }
  S.student = { ...S.student, studentKeyId, examId };
  S.activeExam = { ...item.exam, questionsList: questions };
  S.currentQIdx = 0;
  S.answers = {};
  S.eliminatedChoices = {};
  S._lastAntiCheatTime = 0;
  try {
    const tsData = await api("GET", "/api/records/tab-switches", {
      student_key_id: studentKeyId,
    });
    S.tabSwitches = tsData.tab_switches || 0;
  } catch (e) {
    S.tabSwitches = 0;
  }
  saveExamState();
  showScreen("exam");
  renderQuestion(0);
  startAntiCheat();
  startHeartbeat();
  if (item.exam.time_limit_minutes) {
    startTimer(item.exam.time_limit_minutes * 60);
  } else {
    stopTimer();
    document.getElementById("exam-timer").style.display = "none";
  }
}
function startHeartbeat() {
  stopHeartbeat();
  if (!S.student?.studentKeyId || !S.activeExam) return;
  const send = () =>
    api("POST", "/api/heartbeat", {
      student_key_id: S.student.studentKeyId,
      student_name: S.student.name,
      exam_id: S.activeExam.id,
      exam_name: S.activeExam.name,
      tab_switches: S.tabSwitches || 0,
      current_q: S.currentQIdx + 1,
      total_q: S.activeExam.questionsList?.length || 0,
      timer_left: S._timerSecondsLeft || 0,
    }).catch(() => {});
  send();
  S._heartbeatInterval = setInterval(send, 30000);
}
function stopHeartbeat() {
  if (S._heartbeatInterval) {
    clearInterval(S._heartbeatInterval);
    S._heartbeatInterval = null;
  }
  if (S.student?.studentKeyId) {
    api("DELETE", "/api/heartbeat", {
      student_key_id: S.student.studentKeyId,
    }).catch(() => {});
  }
}
function startTimer(totalSeconds) {
  stopTimer();
  S._timerSecondsLeft = totalSeconds;
  updateTimerDisplay();
  document.getElementById("exam-timer").style.display = "flex";
  S._timerInterval = setInterval(() => {
    S._timerSecondsLeft--;
    saveExamState();
    updateTimerDisplay();
    if (S._timerSecondsLeft <= 0) {
      stopTimer();
      toast("⏰ 时间到！正在自动提交…");
      setTimeout(() => autoSubmitExam(), 800);
    }
  }, 1000);
}
function stopTimer() {
  if (S._timerInterval) {
    clearInterval(S._timerInterval);
    S._timerInterval = null;
  }
}
function updateTimerDisplay() {
  const el = document.getElementById("exam-timer-text");
  if (!el) return;
  const m = Math.floor(S._timerSecondsLeft / 60),
    s = S._timerSecondsLeft % 60;
  el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(
    2,
    "0"
  )}`;
  const timerEl = document.getElementById("exam-timer");
  if (timerEl)
    timerEl.style.color =
      S._timerSecondsLeft <= 60
        ? "var(--red)"
        : S._timerSecondsLeft <= 300
        ? "var(--amber)"
        : "var(--text)";
}
async function autoSubmitExam() {
  stopTimer();
  stopAntiCheat();
  stopHeartbeat();
  clearExamState();
  const exam = S.activeExam,
    qs = exam.questionsList;
  let score = 0;
  qs.forEach((q, i) => {
    if (S.answers[i] === (q.correct_answer ?? 0)) score++;
  });
  const result = await api("POST", "/api/records", {
    exam_id: exam.id,
    student_key_id: S.student.studentKeyId,
    student_name: S.student.name,
    answers_data: S.answers,
    tab_switches: S.tabSwitches || 0,
  });
  showResults(result.score, result.total, qs);
}
function triggerAntiCheat() {
  if (!document.getElementById("screen-exam")?.classList.contains("active"))
    return;
  const now = Date.now();
  if (S._lastAntiCheatTime && now - S._lastAntiCheatTime < 10000) return;
  S._lastAntiCheatTime = now;
  S.tabSwitches = (S.tabSwitches || 0) + 1;
  saveExamState();
  if (S.student?.studentKeyId) {
    api("POST", "/api/records/tab-switches", {
      student_key_id: S.student.studentKeyId,
      tab_switches: S.tabSwitches,
    }).catch(() => {});
    api("POST", "/api/heartbeat", {
      student_key_id: S.student.studentKeyId,
      student_name: S.student.name,
      exam_id: S.activeExam?.id,
      exam_name: S.activeExam?.name,
      tab_switches: S.tabSwitches,
    }).catch(() => {});
  }
  _showAntiCheatOverlay();
}
function _showAntiCheatOverlay() {
  const overlay = document.getElementById("anticheat-overlay");
  const msgEl = document.getElementById("anticheat-msg");
  const countEl = document.getElementById("anticheat-count");
  const btnEl = document.getElementById("anticheat-btn");
  if (!overlay) return;
  countEl.textContent = S.tabSwitches;
  if (S.tabSwitches >= 3) {
    msgEl.textContent = "你已离开考试页面 3 次，系统正在自动提交你的答卷…";
    btnEl.style.display = "none";
    overlay._shouldShow = true;
    overlay.style.display = "flex";
    setTimeout(() => autoSubmitExam(), 2000);
    return;
  } else {
    msgEl.textContent = `检测到你离开了考试页面（第 ${
      S.tabSwitches
    } 次），再离开 ${3 - S.tabSwitches} 次将自动提交答卷。`;
    btnEl.style.display = "";
    btnEl.textContent = "我知道了，继续答题";
    btnEl.onclick = () => {
      overlay._shouldShow = false;
      overlay.style.display = "none";
    };
  }
  overlay._shouldShow = true;
  overlay.style.display = "flex";
}
function ensureOverlay() {
  if (!document.getElementById("screen-exam")?.classList.contains("active"))
    return;
  let overlay = document.getElementById("anticheat-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "anticheat-overlay";
    overlay.style.cssText =
      "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:9998;align-items:center;justify-content:center;padding:24px;";
    overlay.innerHTML = `<div style="background:var(--surface);border-radius:var(--radius);padding:28px 32px;max-width:420px;width:100%;text-align:center;box-shadow:var(--shadow-md);">
<div style="font-size:40px;margin-bottom:14px;">⚠️</div>
<div style="font-size:17px;font-weight:600;margin-bottom:10px;color:var(--red);">检测到离开考试页面</div>
<div id="anticheat-msg" style="font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:12px;"></div>
<div style="font-size:13px;color:var(--text3);margin-bottom:22px;">累计次数：<strong id="anticheat-count" style="color:var(--red);font-size:16px;">0</strong> / 3 次（超过 3 次自动提交答卷）</div>
<button id="anticheat-btn" class="btn btn-primary btn-block btn-lg">我知道了，继续答题</button>
</div>`;
    document.body.appendChild(overlay);
    if (S.tabSwitches > 0 && S.tabSwitches < 3) {
      triggerAntiCheat();
    }
  }
  const computedDisplay = window.getComputedStyle(overlay).display;
  if (overlay._shouldShow && computedDisplay === "none") {
    overlay.style.display = "flex";
  }
}
function requestExamFullscreen() {
  const el = document.documentElement;
  const req =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;
  if (req) req.call(el).catch(() => {});
}
function startAntiCheat() {
  stopAntiCheat();
  S._acVisibility = () => {
    if (document.hidden) triggerAntiCheat();
  };
  document.addEventListener("visibilitychange", S._acVisibility);
  S._acBlur = () => {
    S._acBlurTimer = setTimeout(() => {
      if (!document.getElementById("screen-exam")?.classList.contains("active"))
        return;
      const overlay = document.getElementById("anticheat-overlay");
      if (overlay && overlay.style.display === "flex") return;
      triggerAntiCheat();
    }, 1500);
  };
  S._acFocus = () => {
    if (S._acBlurTimer) {
      clearTimeout(S._acBlurTimer);
      S._acBlurTimer = null;
    }
  };
  window.addEventListener("blur", S._acBlur);
  window.addEventListener("focus", S._acFocus);
  S._acFullscreen = () => {
    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement
    );
    if (
      !isFullscreen &&
      document.getElementById("screen-exam")?.classList.contains("active")
    ) {
      triggerAntiCheat();
      setTimeout(() => requestExamFullscreen(), 2500);
    }
  };
  document.addEventListener("fullscreenchange", S._acFullscreen);
  document.addEventListener("webkitfullscreenchange", S._acFullscreen);
  requestExamFullscreen();
  S._overlayGuard = setInterval(ensureOverlay, 500);
}
function stopAntiCheat() {
  if (S._acVisibility) {
    document.removeEventListener("visibilitychange", S._acVisibility);
    S._acVisibility = null;
  }
  if (S._acBlur) {
    window.removeEventListener("blur", S._acBlur);
    S._acBlur = null;
  }
  if (S._acFocus) {
    window.removeEventListener("focus", S._acFocus);
    S._acFocus = null;
  }
  if (S._acBlurTimer) {
    clearTimeout(S._acBlurTimer);
    S._acBlurTimer = null;
  }
  if (S._overlayGuard) {
    clearInterval(S._overlayGuard);
    S._overlayGuard = null;
  }
  if (S._acFullscreen) {
    document.removeEventListener("fullscreenchange", S._acFullscreen);
    document.removeEventListener("webkitfullscreenchange", S._acFullscreen);
    S._acFullscreen = null;
  }
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen;
  if (exit && (document.fullscreenElement || document.webkitFullscreenElement))
    exit.call(document).catch(() => {});
}
function renderQuestion(idx) {
  S.currentQIdx = idx;
  saveExamState();
  const exam = S.activeExam,
    qs = exam.questionsList,
    q = qs[idx];
  const total = qs.length,
    letters = getLetters(exam.choice_count || 4);
  document.getElementById("exam-nav-info").textContent = `${exam.name} · ${
    idx + 1
  } / ${total}`;
  document.getElementById("exam-progress-bar").style.width = `${
    ((idx + 1) / total) * 100
  }%`;
  const imgSrc = q.img_url || null;
  const imgSrc2 = q.img_url2 || null;
  const qText = q.question_text || null;
  const answered = Object.keys(S.answers).length;
  const navGrid = qs
    .map((_, i) => {
      let bg, color, border;
      if (i === idx) {
        bg = "var(--blue)";
        color = "white";
        border = "var(--blue)";
      } else if (S.answers[i] !== undefined) {
        bg = "var(--green-light)";
        color = "var(--green)";
        border = "var(--green)";
      } else {
        bg = "var(--surface)";
        color = "var(--text3)";
        border = "var(--border-md)";
      }
      return `<button onclick="renderQuestion(${i})" style="width:34px;height:34px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:2px solid ${border};background:${bg};color:${color};display:inline-flex;align-items:center;justify-content:center;transition:all 0.1s;">${
        i + 1
      }</button>`;
    })
    .join("");
  const choiceHtml = letters
    .map((l, i) => {
      const sel = S.answers[idx] === i;
      const elim = S.eliminatedChoices[idx]?.has(i) || false;
      return buildChoiceBtn(l, i, idx, sel, elim);
    })
    .join("");
  document.getElementById("exam-question-area").innerHTML = `
<div style="display:flex;height:calc(100vh - 110px);gap:0;overflow:hidden;">
<!-- 左栏：题目图片/文字，占70% -->
<div style="flex:0 0 70%;display:flex;flex-direction:column;padding-right:16px;overflow:hidden;">
<!-- 题目图片/文字区，撑满剩余高度 -->
<div style="flex:1;overflow:hidden;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;">
${
  imgSrc && imgSrc2
    ? `<div style="display:flex;flex-direction:column;width:100%;height:100%;overflow-y:auto;">
<img src="${imgSrc}" style="max-width:100%;object-fit:contain;display:block;flex:1;" />
<div style="height:1px;background:var(--border);margin:4px 0;flex-shrink:0;"></div>
<img src="${imgSrc2}" style="max-width:100%;object-fit:contain;display:block;flex:1;" />
</div>`
    : imgSrc
    ? `<img src="${imgSrc}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" />`
    : qText
    ? `<div style="padding:32px 36px;font-size:19px;line-height:1.9;color:var(--text);white-space:pre-wrap;overflow-y:auto;width:100%;height:100%;">${qText}</div>`
    : `<p style="color:var(--text3);font-size:16px;">(无题目内容)</p>`
}
</div>
<!-- 翻页按钮在左栏底部 -->
<div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;flex-shrink:0;">
<button class="btn btn-lg" onclick="renderQuestion(${idx - 1})" ${
    idx === 0 ? "disabled" : ""
  } style="min-width:110px;font-size:15px;">← 上一题</button>
<span style="font-size:13px;color:var(--text2);">${answered} / ${total} 已作答</span>
${
  idx < total - 1
    ? `<button class="btn btn-primary btn-lg" onclick="renderQuestion(${
        idx + 1
      })" style="min-width:110px;font-size:15px;">下一题 →</button>`
    : `<button class="btn btn-primary btn-lg" onclick="submitExam()" style="min-width:130px;font-size:15px;">提交答案 ✓</button>`
}
</div>
</div>
<!-- 右栏：导航+选项，占30% -->
<div style="flex:0 0 30%;display:flex;flex-direction:column;overflow-y:auto;padding-left:16px;border-left:1px solid var(--border);">
<!-- 题号信息 -->
<div style="margin-bottom:12px;flex-shrink:0;">
<div style="font-size:13px;color:var(--text2);margin-bottom:2px;">${
    exam.subject
  }</div>
<div style="font-size:18px;font-weight:700;color:var(--text);">第 ${
    idx + 1
  } 题 <span style="font-size:14px;font-weight:400;color:var(--text2);">/ 共 ${total} 题</span></div>
</div>
<!-- 题目导航 -->
<div style="margin-bottom:16px;flex-shrink:0;">
<div style="font-size:11px;color:var(--text3);margin-bottom:6px;"><span style="color:var(--green);">●</span> 已答 &nbsp;<span style="color:var(--text3);">●</span> 未答 &nbsp;<span style="color:var(--blue);">●</span> 当前</div>
<div style="display:flex;flex-wrap:wrap;gap:5px;">${navGrid}</div>
</div>
<!-- 选项 -->
<div id="choices-area" style="flex:1;">${choiceHtml}</div>
</div>
</div>`;
}
function toggleEliminate(qIdx, choiceIdx, event) {
  event.stopPropagation();
  if (!S.eliminatedChoices[qIdx]) S.eliminatedChoices[qIdx] = new Set();
  const set = S.eliminatedChoices[qIdx];
  if (set.has(choiceIdx)) set.delete(choiceIdx);
  else set.add(choiceIdx);
  const choices = document.getElementById("choices-area");
  if (choices) {
    const exam = S.activeExam;
    const letters = getLetters(exam.choice_count || 4);
    choices.innerHTML = letters
      .map((l, i) => {
        const sel = S.answers[qIdx] === i;
        const elim = S.eliminatedChoices[qIdx]?.has(i);
        return buildChoiceBtn(l, i, qIdx, sel, elim);
      })
      .join("");
  }
}
function buildChoiceBtn(l, i, qIdx, sel, elim) {
  const elimStyle = elim ? "opacity:0.38;text-decoration:line-through;" : "";
  return `<button class="choice-option ${
    sel && !elim ? "selected" : ""
  }" onclick="selectAnswer(${qIdx},${i})"
style="width:100%;padding:16px 20px;font-size:17px;margin-bottom:10px;display:flex;align-items:center;gap:16px;border-radius:10px;${
    sel && !elim ? "border-color:var(--blue);background:var(--blue-light);" : ""
  }${elimStyle}position:relative;">
<span style="width:32px;height:32px;border-radius:50%;background:${
    sel && !elim ? "var(--blue)" : "var(--surface2)"
  };color:${
    sel && !elim ? "white" : "var(--text2)"
  };font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${l}</span>
<span style="font-size:16px;font-weight:${
    sel && !elim ? "600" : "400"
  };flex:1;">${l}</span>
<span onclick="toggleEliminate(${qIdx},${i},event)" title="划掉此选项" style="font-size:13px;color:${
    elim ? "var(--red)" : "var(--text3)"
  };padding:4px 6px;border-radius:4px;cursor:pointer;flex-shrink:0;" title="排除此选项">${
    elim ? "↩" : "✕"
  }</span>
</button>`;
}
function selectAnswer(qIdx, choiceIdx) {
  S.answers[qIdx] = choiceIdx;
  saveExamState();
  const exam = S.activeExam,
    qs = exam.questionsList;
  const letters = getLetters(exam.choice_count || 4);
  const choicesArea = document.getElementById("choices-area");
  if (choicesArea) {
    choicesArea.innerHTML = letters
      .map((l, i) => {
        const sel = S.answers[qIdx] === i;
        const elim = S.eliminatedChoices[qIdx]?.has(i) || false;
        return buildChoiceBtn(l, i, qIdx, sel, elim);
      })
      .join("");
  }
  const navGrid = document.querySelector(
    '#exam-question-area [style*="display:flex;flex-wrap:wrap;gap:5px"]'
  );
  if (navGrid) {
    navGrid.innerHTML = qs
      .map((_, i) => {
        let bg, color, border;
        if (i === qIdx) {
          bg = "var(--blue)";
          color = "white";
          border = "var(--blue)";
        } else if (S.answers[i] !== undefined) {
          bg = "var(--green-light)";
          color = "var(--green)";
          border = "var(--green)";
        } else {
          bg = "var(--surface)";
          color = "var(--text3)";
          border = "var(--border-md)";
        }
        return `<button onclick="renderQuestion(${i})" style="width:34px;height:34px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:2px solid ${border};background:${bg};color:${color};display:inline-flex;align-items:center;justify-content:center;transition:all 0.1s;">${
          i + 1
        }</button>`;
      })
      .join("");
  }
  const answered = Object.keys(S.answers).length;
  const countEl = document.querySelector(
    '#exam-question-area span[style*="font-size:13px;color:var(--text2)"]'
  );
  if (countEl) countEl.textContent = `${answered} / ${qs.length} 已作答`;
}
function exitExam() {
  if (!confirm("退出考试？已作答内容不会保存。")) return;
  stopAntiCheat();
  stopTimer();
  stopHeartbeat();
  clearExamState();
  document.getElementById("exam-timer").style.display = "none";
  S.tabSwitches = 0;
  showScreen("student");
}
async function submitExam() {
  const exam = S.activeExam,
    qs = exam.questionsList;
  const answered = Object.keys(S.answers).length;
  if (
    answered < qs.length &&
    !confirm(`还有 ${qs.length - answered} 题未作答，确定提交？`)
  )
    return;
  stopAntiCheat();
  stopTimer();
  stopHeartbeat();
  clearExamState();
  let score = 0;
  qs.forEach((q, i) => {
    if (S.answers[i] === (q.correct_answer ?? 0)) score++;
  });
  const result = await api("POST", "/api/records", {
    exam_id: exam.id,
    student_key_id: S.student.studentKeyId,
    student_name: S.student.name,
    answers_data: S.answers,
    tab_switches: S.tabSwitches || 0,
  });
  if (result.error) {
    toast("提交失败：" + result.error);
    return;
  }
  document.getElementById("exam-timer").style.display = "none";
  showResults(result.score, result.total, qs);
}
function showResults(score, total, questions) {
  const exam = S.activeExam;
  S._lastResult = { examId: exam?.id, score, total };
  const pct = Math.round((score / total) * 100);
  const letters = getLetters(exam.choice_count || 4);
  const { fg } = scoreColor(pct);
  const label =
    pct >= 80 ? "优秀！" : pct >= 60 ? "良好，继续加油 💪" : "需要多加复习 📖";
  showScreen("results");
  document.getElementById("results-content").innerHTML = `
<div class="card mb-3 result-hero">
<div style="font-size:13px;color:var(--text2);margin-bottom:6px;">${
    exam.name
  }</div>
<div class="result-score" style="color:${fg};">${pct}%</div>
<div style="font-size:16px;margin-top:8px;">${score} / ${total} 题正确</div>
<div style="font-size:14px;color:var(--text2);margin-top:4px;">${label}</div>
</div>
${questions
  .map((q, i) => {
    const correct = q.correct_answer ?? 0,
      myAns = S.answers[i];
    const isCorrect = myAns === correct,
      imgSrc = q.img_url || null,
      imgSrc2 = q.img_url2 || null,
      qText = q.question_text || null;
    return `<div class="card mb-2">
<div class="flex gap-2 mb-2">
<span style="font-weight:600;color:var(--text2);font-size:13px;">Q${
      i + 1
    }</span>
<span class="badge ${isCorrect ? "badge-green" : "badge-red"}">${
      isCorrect ? "✓ 正确" : "✗ 错误"
    }</span>
${myAns === undefined ? '<span class="badge badge-gray">未作答</span>' : ""}
</div>
${imgSrc ? `<img src="${imgSrc}" class="question-img" />` : ""}${
      imgSrc2 ? `<img src="${imgSrc2}" class="question-img" />` : ""
    }${
      !imgSrc && qText
        ? `<div style="font-size:15px;line-height:1.8;padding:12px 4px;color:var(--text);white-space:pre-wrap;">${qText}</div>`
        : ""
    }
<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
${letters
  .map(
    (l, ci) => `
<div class="choice-option ${
      ci === correct
        ? "correct-ans"
        : ci === myAns && !isCorrect
        ? "wrong-ans"
        : ""
    }" style="pointer-events:none;min-width:56px;justify-content:center;">
<span class="choice-letter" style="min-width:auto;">${l}</span>
${
  ci === correct
    ? '<span style="font-size:11px;color:var(--green);margin-left:4px;">✓</span>'
    : ""
}
${
  ci === myAns && !isCorrect
    ? '<span style="font-size:11px;color:var(--red);margin-left:4px;">✗</span>'
    : ""
}
</div>`
  )
  .join("")}
</div>
${
  q.explanation
    ? `<div style="background:var(--surface2);padding:10px 14px;border-radius:var(--radius-sm);margin-top:10px;font-size:13px;color:var(--text2);line-height:1.6;"><strong style="color:var(--text);">解析：</strong>${q.explanation}</div>`
    : ""
}
</div>`;
  })
  .join("")}
<button class="btn btn-primary btn-block btn-lg mb-3" onclick="returnToStudent()">返回我的考试</button>`;
}
async function returnToStudent() {
  showScreen("student");
  await renderStudentDashboard(S.student.name);
}
init();
