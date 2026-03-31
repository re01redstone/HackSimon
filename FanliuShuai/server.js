// ============================================================
// NEBS 模拟考试平台 — server.js
// 运行方式：node server.js
// ============================================================

const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app  = express();
const PORT = 3001;

// ── 创建必要目录 ──────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// ── 数据库初始化 ──────────────────────────────────────────
const db = new Database(path.join(__dirname, 'exam.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    full_name TEXT,
    password TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    teacher_id TEXT,
    name TEXT NOT NULL,
    subject TEXT,
    description TEXT,
    choice_count INTEGER DEFAULT 4,
    time_limit_minutes INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    exam_id TEXT,
    order_idx INTEGER,
    img_url TEXT,
    img_url2 TEXT,
    question_text TEXT,
    choices TEXT,
    correct_answer INTEGER DEFAULT 0,
    explanation TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS student_keys (
    id TEXT PRIMARY KEY,
    exam_id TEXT,
    student_name TEXT,
    student_key TEXT UNIQUE,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    exam_id TEXT,
    student_key_id TEXT,
    student_name TEXT,
    score INTEGER,
    total INTEGER,
    answers_data TEXT,
    tab_switches INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── 教师账号列表 ─────────────────────────────────────────
const TEACHER_ACCOUNTS = [
  { id: 'teacher-1',  email: 'admin',   full_name: 'Admin',   password: 'nebs1'   },
  { id: 'teacher-2',  email: 'cl',      full_name: 'CL',      password: 'nebs1'  },
  { id: 'teacher-3',  email: 'zmm',     full_name: 'ZMM',     password: 'nebs2'  },
  { id: 'teacher-4',  email: 'zz',      full_name: 'ZZ',      password: 'nebs3'  },
  { id: 'teacher-5',  email: 'grace',   full_name: 'GRACE',   password: 'nebs4'  },
  { id: 'teacher-6',  email: 'cjy',     full_name: 'CJY',     password: 'nebs5'  },
  { id: 'teacher-7',  email: 'fls',  full_name: 'fls',  password: 'nebs6'  },
  { id: 'teacher-8',  email: 'ping',    full_name: 'PING',    password: 'nebs7'  },
  { id: 'teacher-9',  email: 'keqing',  full_name: 'KEQING',  password: 'nebs8'  },
  { id: 'teacher-10', email: 'cnc',     full_name: 'CNC',     password: 'nebs9'  },
  { id: 'teacher-11', email: 'ljb',     full_name: 'LJB',     password: 'nebs10' },
  { id: 'teacher-12', email: 'amelia',  full_name: 'AMELIA',  password: 'nebs11' },
  { id: 'teacher-13', email: 'lyy',     full_name: 'LYY',     password: 'nebs12' },
  { id: 'teacher-14', email: 'zyg',     full_name: 'ZYG',     password: 'nebs13' },
  { id: 'teacher-15', email: 'cjx',     full_name: 'CJX',     password: 'nebs14' },
  { id: 'teacher-16', email: 'sida',    full_name: 'SIDA',    password: 'nebs15' },
  { id: 'teacher-17', email: 'dw',      full_name: 'DW',      password: 'nebs16' },
  { id: 'teacher-18', email: 'scy',     full_name: 'SCY',     password: 'nebs17' },
  { id: 'teacher-19', email: 'gyd',     full_name: 'GYD',     password: 'nebs18' },
  { id: 'teacher-20', email: 'bhy',     full_name: 'BHY',     password: 'nebs19' },
  { id: 'teacher-21', email: 'jiamin',     full_name: 'jiamin',     password: 'nebs20' },
  { id: 'teacher-22', email: 'liam',    full_name: 'LIAM',    password: 'nebs21' },
];
const upsertTeacher = db.prepare(`INSERT OR IGNORE INTO teachers (id, email, full_name, password) VALUES (?, ?, ?, ?)`);
TEACHER_ACCOUNTS.forEach(t => upsertTeacher.run(t.id, t.email, t.full_name, t.password));
// 更新密码（如果账号已存在）
const updatePwd = db.prepare(`UPDATE teachers SET password=?, full_name=? WHERE email=?`);
TEACHER_ACCOUNTS.forEach(t => updatePwd.run(t.password, t.full_name, t.email));
console.log('教师账号已初始化（22个账号）');

// ── 工具函数 ──────────────────────────────────────────────
function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Session token 存储（内存，重启失效）────────────────────
const sessions = new Map(); // token -> { teacher_id, full_name, email }

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query._token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: '未登录或登录已过期，请重新登录' });
  }
  req.teacher = sessions.get(token);
  next();
}

// ── 中间件 ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname)); // 托管前端文件
app.use('/uploads', express.static(UPLOADS_DIR)); // 托管图片

// 图片上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── API：保存切屏次数（只允许递增，防止前端篡改清零）─────────
app.post('/api/records/tab-switches', (req, res) => {
  const { student_key_id, tab_switches } = req.body;
  db.exec(`CREATE TABLE IF NOT EXISTS exam_progress (
    student_key_id TEXT PRIMARY KEY,
    tab_switches INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  const newVal = parseInt(tab_switches) || 0;
  // 取服务器现有值和前端上报值的最大值，只允许递增不允许减少
  const existing = db.prepare('SELECT tab_switches FROM exam_progress WHERE student_key_id = ?').get(student_key_id);
  const serverVal = existing ? existing.tab_switches : 0;
  const finalVal = Math.max(serverVal, newVal);
  db.prepare(`INSERT INTO exam_progress (student_key_id, tab_switches, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(student_key_id) DO UPDATE SET tab_switches=excluded.tab_switches, updated_at=excluded.updated_at`)
    .run(student_key_id, finalVal);
  res.json({ success: true });
});

// ── API：获取切屏次数（重新登录时恢复）──────────────────────
app.get('/api/records/tab-switches', (req, res) => {
  const { student_key_id } = req.query;
  try {
    const row = db.prepare('SELECT tab_switches FROM exam_progress WHERE student_key_id = ?').get(student_key_id);
    res.json({ tab_switches: row?.tab_switches || 0 });
  } catch(e) {
    res.json({ tab_switches: 0 });
  }
});

// ── API：重置学生某场考试成绩（教师操作）────────────────────
app.delete('/api/records/student/:student_key_id', requireAuth, (req, res) => {
  const { student_key_id } = req.params;
  // 只删成绩记录和切屏记录，不动密钥（全局密钥不重置）
  db.prepare('DELETE FROM records WHERE student_key_id = ?').run(student_key_id);
  try { db.prepare('DELETE FROM exam_progress WHERE student_key_id = ?').run(student_key_id); } catch(e) {}
  res.json({ success: true });
});

// ── API：心跳（学生在线状态）────────────────────────────────
app.post('/api/heartbeat', (req, res) => {
  db.exec(`CREATE TABLE IF NOT EXISTS heartbeats (
    student_key_id TEXT PRIMARY KEY,
    student_name TEXT,
    exam_id TEXT,
    exam_name TEXT,
    tab_switches INTEGER DEFAULT 0,
    updated_at INTEGER
  )`);
  // 动态加列（兼容旧表没有 tab_switches 列）
  try { db.exec('ALTER TABLE heartbeats ADD COLUMN tab_switches INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE heartbeats ADD COLUMN current_q INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE heartbeats ADD COLUMN total_q INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec('ALTER TABLE heartbeats ADD COLUMN timer_left INTEGER DEFAULT 0'); } catch(e) {}
  const { student_key_id, student_name, exam_id, exam_name, tab_switches, current_q, total_q, timer_left } = req.body;
  db.prepare(`INSERT INTO heartbeats (student_key_id, student_name, exam_id, exam_name, tab_switches, current_q, total_q, timer_left, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_key_id) DO UPDATE SET updated_at=excluded.updated_at, exam_name=excluded.exam_name, tab_switches=excluded.tab_switches, current_q=excluded.current_q, total_q=excluded.total_q, timer_left=excluded.timer_left`)
    .run(student_key_id, student_name, exam_id, exam_name, tab_switches||0, current_q||0, total_q||0, timer_left||0, Date.now());
  res.json({ success: true });
});

app.delete('/api/heartbeat', (req, res) => {
  const { student_key_id } = req.body;
  try { db.prepare('DELETE FROM heartbeats WHERE student_key_id = ?').run(student_key_id); } catch(e) {}
  res.json({ success: true });
});

app.get('/api/heartbeat/active', (req, res) => {
  try {
    const cutoff = Date.now() - 45000; // 45秒没心跳算离线
    const rows = db.prepare('SELECT * FROM heartbeats WHERE updated_at > ?').all(cutoff);
    res.json(rows);
  } catch(e) { res.json([]); }
});

// ── API：教师登录 ─────────────────────────────────────────
app.post('/api/teacher/login', (req, res) => {
  const { email, password } = req.body;
  const teacher = db.prepare('SELECT * FROM teachers WHERE email = ? AND password = ?').get(email, password);
  if (!teacher) return res.json({ error: '账号或密码错误' });
  const token = uuid() + uuid(); // 随机 token
  sessions.set(token, { id: teacher.id, email: teacher.email, full_name: teacher.full_name });
  res.json({ success: true, token, teacher: { id: teacher.id, email: teacher.email, full_name: teacher.full_name } });
});

// ── API：教师登出 ─────────────────────────────────────────
app.post('/api/teacher/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// ── API：图片上传 ─────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ error: '上传失败' });
  try {
    const data = fs.readFileSync(req.file.path);
    const b64 = 'data:' + req.file.mimetype + ';base64,' + data.toString('base64');
    fs.unlinkSync(req.file.path);
    res.json({ url: b64 });
  } catch(e) {
    res.json({ error: '读取文件失败: ' + e.message });
  }
});

// ── API：考试列表 ─────────────────────────────────────────
app.get('/api/exams', requireAuth, (req, res) => {
  const { teacher_id } = req.query;
  const exams = db.prepare('SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC').all(teacher_id);
  exams.forEach(e => {
    e.is_active = e.is_active === 1;
    e.questions_count = db.prepare('SELECT COUNT(*) as c FROM questions WHERE exam_id = ?').get(e.id).c;
    e.students_count  = db.prepare('SELECT COUNT(*) as c FROM student_keys WHERE exam_id = ?').get(e.id).c;
  });
  res.json(exams);
});

// ── API：所有考试（admin专用）────────────────────────────
app.get('/api/exams/all', requireAuth, (req, res) => {
  const exams = db.prepare('SELECT exams.*, teachers.full_name as teacher_name FROM exams LEFT JOIN teachers ON exams.teacher_id = teachers.id ORDER BY exams.created_at DESC').all();
  exams.forEach(e => {
    e.is_active = e.is_active === 1;
    e.questions_count = db.prepare('SELECT COUNT(*) as c FROM questions WHERE exam_id = ?').get(e.id).c;
    e.students_count  = db.prepare('SELECT COUNT(*) as c FROM student_keys WHERE exam_id = ?').get(e.id).c;
  });
  res.json(exams);
});

// ── API：所有成绩（admin专用）────────────────────────────
app.get('/api/records/all/admin', requireAuth, (req, res) => {
  const recs = db.prepare('SELECT * FROM records ORDER BY created_at DESC').all();
  recs.forEach(r => { r.answers_data = JSON.parse(r.answers_data || '{}'); });
  res.json(recs);
});

// ── API：新建考试 ─────────────────────────────────────────
app.post('/api/exams', requireAuth, (req, res) => {
  const { name, subject, description, choice_count, time_limit_minutes, teacher_id } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO exams (id, teacher_id, name, subject, description, choice_count, time_limit_minutes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, teacher_id, name, subject, description || '', choice_count || 4, time_limit_minutes || null);
  res.json({ id });
});

// ── API：更新考试 ─────────────────────────────────────────
app.put('/api/exams/:id', requireAuth, (req, res) => {
  const { name, subject, description, choice_count, time_limit_minutes } = req.body;
  db.prepare(`UPDATE exams SET name=?, subject=?, description=?, choice_count=?, time_limit_minutes=? WHERE id=?`)
    .run(name, subject, description || '', choice_count || 4, time_limit_minutes || null, req.params.id);
  res.json({ success: true });
});

// ── API：开关考试 ─────────────────────────────────────────
app.put('/api/exams/:id/toggle', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT is_active FROM exams WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE exams SET is_active = ? WHERE id = ?').run(exam.is_active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

// ── API：删除考试 ─────────────────────────────────────────
app.delete('/api/exams/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM student_keys WHERE exam_id = ?').run(id);
  db.prepare('DELETE FROM questions WHERE exam_id = ?').run(id);
  db.prepare('DELETE FROM records WHERE exam_id = ?').run(id);
  db.prepare('DELETE FROM exams WHERE id = ?').run(id);
  res.json({ success: true });
});

// ── API：获取题目 ─────────────────────────────────────────
// role=teacher 返回完整数据（含答案），学生端去掉答案和解析
app.get('/api/questions/:exam_id', (req, res) => {
  const qs = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_idx').all(req.params.exam_id);
  qs.forEach(q => { q.choices = JSON.parse(q.choices || '[]'); });
  if (req.query.role === 'teacher') {
    return res.json(qs);
  }
  // 学生端：去掉正确答案和解析，防止前端脚本读取
  res.json(qs.map(q => ({
    id: q.id, exam_id: q.exam_id, order_idx: q.order_idx,
    img_url: q.img_url, img_url2: q.img_url2,
    question_text: q.question_text, choices: q.choices
  })));
});

// ── API：保存题目（批量替换）────────────────────────────────
app.post('/api/questions/:exam_id', requireAuth, (req, res) => {
  const { questions } = req.body;
  db.prepare('DELETE FROM questions WHERE exam_id = ?').run(req.params.exam_id);
  const insert = db.prepare(`INSERT INTO questions (id, exam_id, order_idx, img_url, img_url2, question_text, choices, correct_answer, explanation)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertMany = db.transaction((qs) => {
    qs.forEach((q, i) => {
      insert.run(uuid(), req.params.exam_id, i, q.img_url || null, q.img_url2 || null, q.question_text || null,
                 JSON.stringify(q.choices || []), q.correct_answer ?? 0, q.explanation || null);
    });
  });
  insertMany(questions);
  res.json({ success: true });
});

// ── API：学生密钥列表 ─────────────────────────────────────
app.get('/api/student-keys/:exam_id', (req, res) => {
  const keys = db.prepare('SELECT * FROM student_keys WHERE exam_id = ? ORDER BY student_name').all(req.params.exam_id);
  // 每个学生带上是否已提交这场考试的成绩
  keys.forEach(k => {
    const rec = db.prepare('SELECT id, score, total FROM records WHERE student_key_id = ?').get(k.id);
    k.has_record = !!rec;
    k.score = rec ? rec.score : null;
    k.total = rec ? rec.total : null;
  });
  res.json(keys);
});

// ── API：批量添加学生密钥（同名学生复用已有密钥）─────────────
app.post('/api/student-keys', (req, res) => {
  const { keys } = req.body; // [{exam_id, student_name, student_key}]
  const insertMany = db.transaction((ks) => {
    ks.forEach(k => {
      // 检查这个学生是否已在这场考试里，避免重复
      const alreadyIn = db.prepare(
        'SELECT id FROM student_keys WHERE exam_id = ? AND student_name = ?'
      ).get(k.exam_id, k.student_name);
      if (alreadyIn) return; // 已在这场考试里，跳过

      // 查找该学生是否已有全局密钥（在任意考试里）
      const existing = db.prepare(
        'SELECT student_key FROM student_keys WHERE student_name = ? LIMIT 1'
      ).get(k.student_name);
      const keyToUse = existing ? existing.student_key : k.student_key;

      // 直接插入，不用 OR IGNORE（让错误暴露出来）
      db.prepare('INSERT INTO student_keys (id, exam_id, student_name, student_key) VALUES (?, ?, ?, ?)')
        .run(uuid(), k.exam_id, k.student_name, keyToUse);
    });
  });
  insertMany(keys);
  res.json({ success: true });
});

// ── API：检查密钥是否已存在（全局）────────────────────────
app.post('/api/student-keys/check', (req, res) => {
  const { keys } = req.body;
  const placeholders = keys.map(() => '?').join(',');
  const existing = db.prepare(`SELECT student_key FROM student_keys WHERE student_key IN (${placeholders})`).all(...keys);
  res.json(existing.map(r => r.student_key));
});

// ── API：按学生姓名查询已有密钥 ──────────────────────────
app.post('/api/student-keys/lookup-names', (req, res) => {
  const { names } = req.body;
  if (!names || !names.length) return res.json({});
  const placeholders = names.map(() => '?').join(',');
  const existing = db.prepare(
    `SELECT DISTINCT student_name, student_key FROM student_keys WHERE student_name IN (${placeholders})`
  ).all(...names);
  const map = {};
  existing.forEach(r => { map[r.student_name] = r.student_key; });
  res.json(map);
});

// ── API：学生用密钥登录 ───────────────────────────────────
app.get('/api/student/login', (req, res) => {
  const { key } = req.query;
  const sk = db.prepare('SELECT * FROM student_keys WHERE student_key = ?').get(key);
  if (!sk) return res.json({ error: '密钥无效' });
  if (!sk.used_at) {
    // 更新该学生所有考试记录的首次使用时间
    db.prepare("UPDATE student_keys SET used_at = datetime('now') WHERE student_name = ? AND used_at IS NULL")
      .run(sk.student_name);
  }
  res.json({ ...sk, student_key: key });
});

// ── API：学生获取考试列表 ─────────────────────────────────
app.get('/api/student/exams', (req, res) => {
  const { student_name } = req.query;
  const keys = db.prepare('SELECT * FROM student_keys WHERE student_name = ?').all(student_name);
  const result = keys.map(sk => {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(sk.exam_id);
    if (!exam) return null;
    exam.is_active = exam.is_active === 1;
    const record = db.prepare('SELECT * FROM records WHERE student_key_id = ?').get(sk.id);
    return { studentKey: sk, exam, record: record || null };
  }).filter(Boolean);
  res.json(result);
});

// ── API：提交成绩（服务器算分，不信任前端分数）────────────────
app.post('/api/records', (req, res) => {
  const { exam_id, student_key_id, student_name, answers_data, tab_switches } = req.body;
  // 防止重复提交
  const existing = db.prepare('SELECT id FROM records WHERE student_key_id = ?').get(student_key_id);
  if (existing) return res.json({ error: '已提交过' });
  // 服务器自己算分，不信任前端传来的 score
  const qs = db.prepare('SELECT correct_answer FROM questions WHERE exam_id = ? ORDER BY order_idx').all(exam_id);
  const total = qs.length;
  let score = 0;
  const answers = answers_data || {};
  qs.forEach((q, i) => {
    if (parseInt(answers[i]) === q.correct_answer) score++;
  });
  db.prepare(`INSERT INTO records (id, exam_id, student_key_id, student_name, score, total, answers_data, tab_switches)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuid(), exam_id, student_key_id, student_name, score, total, JSON.stringify(answers_data), tab_switches || 0);
  // 提交成功后返回正确答案，供结果页显示（仅此一次，不存前端）
  const correct_answers = qs.map(q => q.correct_answer);
  res.json({ success: true, score, total, correct_answers });
});

// ── API：获取成绩 ─────────────────────────────────────────
app.get('/api/records', (req, res) => {
  const { exam_id, student_key_id } = req.query;
  if (student_key_id) {
    const r = db.prepare('SELECT * FROM records WHERE student_key_id = ?').get(student_key_id);
    if (r) r.answers_data = JSON.parse(r.answers_data || '{}');
    return res.json(r || null);
  }
  if (exam_id) {
    const recs = db.prepare('SELECT * FROM records WHERE exam_id = ? ORDER BY student_name').all(exam_id);
    recs.forEach(r => { r.answers_data = JSON.parse(r.answers_data || '{}'); });
    return res.json(recs);
  }
  res.json([]);
});

// ── API：获取所有成绩（教师端）────────────────────────────
app.get('/api/records/all', requireAuth, (req, res) => {
  const { teacher_id } = req.query;
  const exams = db.prepare('SELECT id FROM exams WHERE teacher_id = ?').all(teacher_id);
  if (!exams.length) return res.json([]);
  const ids = exams.map(e => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const recs = db.prepare(`SELECT * FROM records WHERE exam_id IN (${placeholders}) ORDER BY created_at DESC`).all(...ids);
  recs.forEach(r => { r.answers_data = JSON.parse(r.answers_data || '{}'); });
  res.json(recs);
});

// ── 启动服务器 ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  // 获取本机局域网IP
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }
  console.log('\n========================================');
  console.log('  NEBS 模拟考试平台 已启动！');
  console.log('========================================');
  console.log(`  本机访问：http://localhost:${PORT}`);
  console.log(`  局域网访问：http://${localIP}:${PORT}`);
  console.log(`  （把上面的局域网地址发给学生）`);
  console.log('========================================');
  console.log('  教师账号：admin');
  console.log('  教师密码：Nebs2026');
  console.log('========================================\n');
});