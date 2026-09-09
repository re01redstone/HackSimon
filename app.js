// ============================================================
// NEBS 模拟考试平台 — app.js
// v6: 混合题型(mixed) + 填空题(fill) + 隐私模式(is_private)
// ============================================================

const API = window.location.origin;

const S = {
  teacher: null, student: null, role: null, token: null,
  editingExamId: null, draftQuestions: [], choiceCount: 4,
  editingQIdx: null, draftQImgs: [],
  activeExam: null, currentQIdx: 0, answers: {},
  tabSwitches: 0, _lastAntiCheatTime: 0,
  _timerInterval: null, _timerSecondsLeft: 0, _heartbeatInterval: null,
  _acVisibility: null, _acBlur: null, _acFocus: null, _acBlurTimer: null,
  viewingKeysExamId: null, viewingKeysData: [],
  eliminatedChoices: {}, flaggedQuestions: new Set(),
  examType: 'choice', frqAnswers: {},
  _currentExamRecords: [], _currentExamQuestions: [], _currentExamName: '',
  _navSubject: '', _navType: 'all', _favorites: new Set(),
  _navPage: 1, _navExpanded: {}, _wrongOnlyMode: false,
  _examListPage: 1, _examListTypeFilter: 'all',
};

const ITEMS_PER_PAGE = 8;

// 页数很多时只显示首页、尾页和当前页附近，避免分页条横向溢出。
function compactPagination(current,total,handler){
  if(total<=1)return'';
  const tokens=[];
  if(total<=7){for(let p=1;p<=total;p++)tokens.push(p);}
  else{
    tokens.push(1);
    let start,end;
    if(current<=3){start=2;end=5;}
    else if(current>=total-2){start=total-4;end=total-1;}
    else{start=current-2;end=current+2;}
    if(start>2)tokens.push('…');
    for(let p=start;p<=end;p++)tokens.push(p);
    if(end<total-1)tokens.push('…');
    tokens.push(total);
  }
  const pages=tokens.map(token=>token==='…'
    ?'<span aria-hidden="true" style="min-width:20px;text-align:center;color:var(--text3);">…</span>'
    :`<button onclick="${handler}(${token})" aria-label="第 ${token} 页" ${token===current?'aria-current="page"':''} class="btn btn-sm" style="min-width:34px;${token===current?'background:var(--blue);color:white;border-color:var(--blue);':''}">${token}</button>`
  ).join('');
  return`<div style="display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;margin-top:14px;padding-bottom:8px;">
    <button onclick="${handler}(${current-1})" ${current<=1?'disabled':''} class="btn btn-sm">← 上页</button>
    ${pages}
    <button onclick="${handler}(${current+1})" ${current>=total?'disabled':''} class="btn btn-sm">下页 →</button>
  </div>`;
}

function numEqC(a, b) {
  if (a == null || b == null) return false;
  function parseFrac(s) {
    s = String(s).replace(/,/g, '').trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 2) {
        const num = parseFloat(parts[0]), den = parseFloat(parts[1]);
        if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
      }
      return NaN;
    }
    return parseFloat(s);
  }
  const x = parseFrac(a), y = parseFrac(b);
  if (isNaN(x) || isNaN(y)) return false;
  return Math.abs(x - y) < 1e-9;
}
function strEqC(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// 获取一道题的有效类型（mixed时看q.question_type，否则看exam.exam_type）
function getQType(q, exam) {
  if (!exam) return 'choice';
  if (exam.exam_type === 'mixed') return (q && q.question_type) || 'choice';
  return exam.exam_type || 'choice';
}
// 多空填空：解析题目的 blanks_json
function getQBlanks(q){
  if(!q||!q.blanks_json)return null;
  try{const b=JSON.parse(q.blanks_json);return Array.isArray(b)&&b.length?b:null;}catch(e){return null;}
}
// 此题是否为人工批改的填空
function isManualQ(q,qt){return (qt==='fill'||qt==='fill_text')&&(q.grading||'auto')==='manual';}

// ── 英语题型辅助（cloze/audio_choice/audio_fill/reading/matching）──
const ENG_QTS=['cloze','audio_choice','audio_fill','reading','matching'];
const TFNG=['TRUE','FALSE','NOT GIVEN'];
function _qtLabel(qt){return qt==='frq'?'FRQ':qt==='fill'?'填空（数字）':qt==='fill_text'?'填空（文字）':qt==='cloze'?'补全单词':qt==='audio_choice'?'听力选择':qt==='audio_fill'?'听力填空':qt==='reading'?'阅读理解':qt==='matching'?'对应题':'MCQ';}
function parseSubs(q){if(!q||!q.subs_json)return null;if(typeof q.subs_json==='object')return q.subs_json;try{return JSON.parse(q.subs_json);}catch(e){return null;}}
// cloze 文本解析：教师版 [answer]，学生版 [[n]]；返回 [{t:'txt',v}|{t:'blank',len,ans}]
function clozeSegs(text){
  text=String(text||'');
  const re=/\[\[(\d+)\]\]|\[([^\[\]\n]+)\]/g;const segs=[];let last=0,m;
  while((m=re.exec(text))!==null){
    if(m.index>last)segs.push({t:'txt',v:text.slice(last,m.index)});
    if(m[1]!==undefined)segs.push({t:'blank',len:parseInt(m[1])||3,ans:null});
    else segs.push({t:'blank',len:m[2].trim().length,ans:m[2].trim()});
    last=re.lastIndex;
  }
  if(last<text.length)segs.push({t:'txt',v:text.slice(last)});
  return segs;
}
const _ansNum=v=>(v===null||v===undefined||v==='')?NaN:Number(v);
// 对应题数据规范化：新格式 {stems:[描述文字...], options:[{text,correct(描述编号),score}...]}
// 旧格式（stems 带 correct、options 是字符串）自动换向兼容
function matchCanon(m){
  if(!m)return{stems:[],options:[]};
  const opts=m.options||[];
  if(opts.length&&typeof opts[0]==='string'){
    return{stems:opts.slice(),options:(m.stems||[]).map(st=>({text:st.text||'',correct:st.correct??0,score:st.score??1}))};
  }
  return{stems:(m.stems||[]).map(s=>typeof s==='string'?s:(s.text||'')),options:opts.map(o=>({text:o.text||'',correct:o.correct??0,score:o.score??1}))};
}
function _setEq(a,b){
  const x=(Array.isArray(a)?a:[a]).map(_ansNum).filter(n=>!isNaN(n)).sort((p,q)=>p-q);
  const y=(Array.isArray(b)?b:[b]).map(_ansNum).filter(n=>!isNaN(n)).sort((p,q)=>p-q);
  return x.length>0&&x.length===y.length&&x.every((v,i)=>v===y[i]);
}
// 英语题型得分（correct 来自 correct_answers 数组；分值来自题目 blanks/subs）
function engEarnedClient(q,qt,myAns,correct){
  if(qt==='cloze'||qt==='audio_fill'){
    const bs=getQBlanks(q);const corArr=Array.isArray(correct)?correct:[correct];const myArr=Array.isArray(myAns)?myAns:[myAns];
    return corArr.reduce((s,c,bi)=>s+(strEqC(myArr[bi],c)?(bs?.[bi]?.score??1):0),0);
  }
  const subs=parseSubs(q);if(!subs)return 0;
  const corArr=Array.isArray(correct)?correct:[];const myArr=Array.isArray(myAns)?myAns:[];
  if(qt==='matching'){const items=matchCanon(subs).options;return items.reduce((s,it,i)=>s+(_ansNum(myArr[i])===Number(corArr[i])?(it.score??1):0),0);}
  return (Array.isArray(subs)?subs:[]).reduce((s,sub,i)=>{
    const per=sub.score??1;
    // 多选：每选对一项得 per 分；单选：全对才给分
    if(Array.isArray(corArr[i])&&corArr[i].length>1){
      const sel=(Array.isArray(myArr[i])?myArr[i]:[myArr[i]]).map(_ansNum).filter(n=>!isNaN(n));
      const matches=corArr[i].filter(c=>sel.includes(Number(c))).length;
      return s+matches*per;
    }
    const corr=Array.isArray(corArr[i])?corArr[i][0]:corArr[i];
    const mine=Array.isArray(myArr[i])?(myArr[i].length===1?myArr[i][0]:NaN):myArr[i];
    return s+(_ansNum(mine)===Number(corr)?per:0);
  },0);
}
// 英语题型正确答案（需要教师/练习模式的完整题目数据）
function engKeyClient(q,qt){
  if(qt==='cloze'||qt==='audio_fill'){const bs=getQBlanks(q);return bs?bs.map(b=>b.answer):null;}
  const subs=parseSubs(q);if(!subs)return null;
  if(qt==='matching')return matchCanon(subs).options.map(it=>it.correct);
  return (Array.isArray(subs)?subs:[]).map(s=>s.correct);
}
function _teacherEngOk(q,qt,ans){const key=engKeyClient(q,qt);if(key===null)return false;return engEarnedClient(q,qt,ans,key)>=(q.max_score||1);}
// 选择题（单选/多选）是否全对
function _teacherChoiceOk(q,ans){const cm=choiceMulti(q);if(cm)return choiceMultiEarnedClient(cm,ans,(cm.correct||[]).map(Number))>=(q.max_score||1);return parseInt(ans)===q.correct_answer;}
// 填空判对（兼容单空字符串和多空数组）
function fillAnsCorrect(qt,myAns,correct){
  const eq=qt==='fill'?numEqC:strEqC;
  if(Array.isArray(correct)){const arr=Array.isArray(myAns)?myAns:[myAns];return correct.length>0&&correct.every((c,i)=>eq(arr[i],c));}
  return eq(myAns,correct);
}
// 把当前页面上填空输入框的值同步进 S.answers（单空/多空都支持）
function _syncFillInputs(qIdx){
  const exam=S.activeExam;if(!exam)return;
  const q=exam.questionsList?.[qIdx];if(!q)return;
  const qt=getQType(q,exam);
  if(qt!=='fill'&&qt!=='fill_text'&&qt!=='audio_fill')return;
  const multi=document.querySelectorAll('.fill-blank-input');
  if(multi.length){
    const arr=[];multi.forEach(el=>{arr[parseInt(el.dataset.bi)]=String(el.value).trim();});
    if(arr.some(v=>v))S.answers[qIdx]=arr;else delete S.answers[qIdx];
    return;
  }
  const fa=document.getElementById('fill-answer-input');
  if(fa){const v=qt==='fill'?String(fa.value).replace(/[^0-9.\-\/]/g,'').trim():String(fa.value).trim();if(v)S.answers[qIdx]=v;else delete S.answers[qIdx];}
}

// ── 考试状态持久化 ────────────────────────────────────────
function saveExamState() {
  if (!S.activeExam || !S.student) return;
  const examLight = {
    id: S.activeExam.id, name: S.activeExam.name, subject: S.activeExam.subject,
    choice_count: S.activeExam.choice_count, time_limit_minutes: S.activeExam.time_limit_minutes,
    is_active: S.activeExam.is_active, exam_type: S.activeExam.exam_type || 'choice',
    is_homework: S.activeExam.is_homework || 0, is_private: S.activeExam.is_private || 0,
    questionsList: S.activeExam.questionsList.map(q => ({
      id: q.id, exam_id: q.exam_id, order_idx: q.order_idx, choices: q.choices,
      img_url: null, img_url2: null, question_type: q.question_type || 'choice',
      blanks_json: q.blanks_json || null, grading: q.grading || 'auto'
    }))
  };
  const state = {
    activeExam: examLight, examId: S.activeExam.id, student: S.student,
    answers: S.answers, currentQIdx: S.currentQIdx, tabSwitches: S.tabSwitches,
    flaggedQuestions: [...S.flaggedQuestions], frqAnswers: S.frqAnswers || {},
    audioPlayed: S._audioPlayed || {}, audioProg: S._audioProg || {},
    examType: S.examType || 'choice', timerSecondsLeft: S._timerSecondsLeft, savedAt: Date.now()
  };
  try { sessionStorage.setItem('examState', JSON.stringify(state)); }
  catch(e) {
    try { sessionStorage.setItem('examState', JSON.stringify({ ...state, activeExam: { ...state.activeExam, questionsList: [] } })); }
    catch(e2) { try { sessionStorage.setItem('examState_frq', JSON.stringify({ frqAnswers: state.frqAnswers, answers: state.answers, examId: state.examId, savedAt: state.savedAt })); } catch(e3) {} }
  }
  _saveHwTime();
}
function _saveHwTime(){try{if(S._isHomeworkMode&&S.activeExam&&S.activeExam.time_limit_minutes&&S.student&&S.student.studentKeyId&&S._timerSecondsLeft>0)localStorage.setItem('nebsHwTime_'+S.activeExam.id+'_'+S.student.studentKeyId,String(S._timerSecondsLeft));}catch(e){}}
function loadExamState() {
  try {
    const raw = sessionStorage.getItem('examState'); if (!raw) return null;
    const state = JSON.parse(raw);
    if (Date.now() - state.savedAt > 24*60*60*1000) { sessionStorage.removeItem('examState'); return null; }
    try { const frqRaw = sessionStorage.getItem('examState_frq'); if (frqRaw) { const fd = JSON.parse(frqRaw); if (fd.examId === state.examId && fd.frqAnswers) { state.frqAnswers = { ...state.frqAnswers, ...fd.frqAnswers }; state.answers = { ...state.answers, ...fd.answers }; } } } catch(e2) {}
    return state;
  } catch(e) { return null; }
}
function clearExamState() { sessionStorage.removeItem('examState'); }

function getLetters(n) { return ['A','B','C','D','E','F','G','H'].slice(0, Math.max(2, Math.min(8, n||4))); }
// 单条选择题的选项数：优先用题目自己存的选项数（choices 数组长度），否则回退到整卷设置
function qChoiceCount(q, exam){ const n=(q&&Array.isArray(q.choices)&&q.choices.length)?q.choices.length:0; return n>=2?n:(exam?.choice_count||4); }
function qLetters(q, exam){ return getLetters(qChoiceCount(q, exam)); }
// 多选选择题配置：{multi:true, correct:[...]?, pick:N?, per:P}；学生端只有 pick，无 correct
function choiceMulti(q){ if(!q||!q.subs_json)return null; try{const s=(typeof q.subs_json==='object')?q.subs_json:JSON.parse(q.subs_json);return (s&&s.multi)?s:null;}catch(e){return null;} }
function choiceMultiPick(cfg){ return cfg?(cfg.pick!=null?cfg.pick:(cfg.correct||[]).length):1; }
function choiceMultiEarnedClient(cfg,myAns,correct){ const per=cfg?.per??1; const cor=(Array.isArray(correct)?correct:(cfg?.correct||[])).map(Number); const sel=(Array.isArray(myAns)?myAns:[myAns]).map(Number).filter(n=>!isNaN(n)); return cor.filter(c=>sel.includes(c)).length*per; }
function choiceMultiMaxClient(cfg,correct){ const per=cfg?.per??1; const n=Array.isArray(correct)?correct.length:choiceMultiPick(cfg); return n*per; }
function genKey(len=8) { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let k=''; for(let i=0;i<len;i++) k+=c[Math.floor(Math.random()*c.length)]; return k; }
async function genUniqueKeys(count) {
  const keys=new Set(); while(keys.size<count) keys.add(genKey(8));
  const candidates=[...keys];
  const taken=await api('POST','/api/student-keys/check',{keys:candidates});
  const safe=candidates.filter(k=>!taken.includes(k));
  while(safe.length<count) { let k; do{k=genKey(8);}while(taken.includes(k)||safe.includes(k)); safe.push(k); }
  return safe;
}

async function api(method, path, body) {
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(S.token) opts.headers['x-session-token']=S.token;
  if(body && method!=='GET') opts.body=JSON.stringify(body);
  const url=method==='GET'&&body?`${API}${path}?${new URLSearchParams(body)}`:`${API}${path}`;
  const res=await fetch(url,opts);
  if(res.status===401){logout();showAlert('tea-alert','登录已过期，请重新登录');throw new Error('401');}
  const raw=await res.text();
  try{return raw?JSON.parse(raw):{};}
  catch(e){
    if(res.status===504)throw new Error('服务器判题超时，请稍后重试；你的代码仍保存在答题进度中');
    throw new Error(`服务器返回异常（${res.status}），请稍后重试`);
  }
}
async function uploadImageToStorage(file) {
  if(!file) return null;
  const form=new FormData(); form.append('file',file);
  const res=await fetch(`${API}/api/upload`,{method:'POST',body:form});
  const data=await res.json(); if(data.error) throw new Error(data.error); return data.url;
}
function toast(msg,dur=2600){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),dur);}
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('screen-'+id).classList.add('active');}
function showAlert(id,msg,type='danger'){const el=document.getElementById(id);if(!el)return;el.className=`alert alert-${type}`;el.textContent=msg;el.style.display='block';}
function hideAlert(id){const el=document.getElementById(id);if(el)el.style.display='none';}
function scoreColor(pct){if(pct>=80)return{bg:'var(--green-light)',fg:'#173404'};if(pct>=60)return{bg:'var(--amber-light)',fg:'#412402'};return{bg:'var(--red-light)',fg:'#501313'};}
function escapeHtml(str){if(!str)return'';return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ── Init ──────────────────────────────────────────────────
async function init() {
  const examState=loadExamState();
  if(examState){
    S.activeExam=examState.activeExam; S.student=examState.student;
    S.answers=examState.answers; S.currentQIdx=examState.currentQIdx;
    S.tabSwitches=examState.tabSwitches; S.flaggedQuestions=new Set(examState.flaggedQuestions||[]);
    S.frqAnswers=examState.frqAnswers||{}; S.examType=examState.examType||'choice';
    S._audioPlayed=examState.audioPlayed||{}; S._audioProg=examState.audioProg||{};
    document.getElementById('student-name-nav').textContent=S.student.name;
    document.getElementById('student-avatar-nav').textContent=S.student.name.trim()[0]||'S';
    showScreen('exam');
    try {
      const [freshQs,progress]=await Promise.all([
        api('GET',`/api/questions/${S.activeExam.id}`),
        api('GET','/api/homework-progress',{student_key_id:S.student.studentKeyId,exam_id:S.activeExam.id}).catch(()=>null)
      ]);
      if(freshQs&&freshQs.length){ S.activeExam.questionsList=freshQs; S.examType=S.activeExam.exam_type||'choice'; }
      if(progress?.frq_answers){
        const srv=typeof progress.frq_answers==='string'?JSON.parse(progress.frq_answers):progress.frq_answers;
        if(srv&&Object.keys(srv).length){Object.keys(srv).forEach(k=>{const sv=srv[k]||'',lv=S.frqAnswers[k]||'';if(sv.length>lv.length)S.frqAnswers[k]=sv;});}
      }
    } catch(e){}
    renderQuestion(S.currentQIdx,true);
    const _isHw=S.activeExam.is_homework===1||S.activeExam.is_homework===true;
    const _eb=document.getElementById('exit-exam-btn');
    if(_eb)_eb.style.display=_isHw?'':'none';
    if(_isHw){stopAntiCheat();S._isHomeworkMode=true;}else{startAntiCheat();}
    startHeartbeat();
    if(examState.timerSecondsLeft>0&&S.activeExam.time_limit_minutes){
      S._timerSecondsLeft=examState.timerSecondsLeft;
      document.getElementById('exam-timer').style.display='flex'; updateTimerDisplay();
      S._timerInterval=setInterval(()=>{S._timerSecondsLeft--;saveExamState();updateTimerDisplay();if(S._timerSecondsLeft<=0){stopTimer();toast('⏰ 时间到！正在自动提交…');setTimeout(()=>autoSubmitExam(),800);}},1000);
    } else{document.getElementById('exam-timer').style.display='none';}
    return;
  }
  const saved=sessionStorage.getItem('teacher');
  if(saved){S.teacher=JSON.parse(saved);S.role='teacher';S.token=sessionStorage.getItem('teacherToken')||null;showTeacherDashboard();return;}
  const savedStudent=sessionStorage.getItem('student');
  if(savedStudent){
    S.student=JSON.parse(savedStudent);S.role='student';
    document.getElementById('student-name-nav').textContent=S.student.name;
    document.getElementById('student-avatar-nav').textContent=S.student.name.trim()[0]||'S';
    showScreen('student'); await renderStudentDashboard(S.student.name); return;
  }
  showScreen('login');
}

// ── Auth ──────────────────────────────────────────────────
function switchLoginTab(tab){
  document.querySelectorAll('#screen-login .tab-btn').forEach((b,i)=>b.classList.toggle('active',(i===0)===(tab==='student')));
  document.getElementById('login-student-panel').style.display=tab==='student'?'':'none';
  document.getElementById('login-teacher-panel').style.display=tab==='teacher'?'':'none';
}
async function teacherLogin(){
  const email=document.getElementById('tea-email').value.trim(),pass=document.getElementById('tea-pass').value;
  hideAlert('tea-alert');
  if(!email||!pass){showAlert('tea-alert','请填写账号和密码');return;}
  const btn=document.querySelector('#login-teacher-panel .btn-primary');
  if(btn&&btn.disabled)return;
  if(btn){btn.disabled=true;btn.textContent='登录中…';}
  const result=await api('POST','/api/teacher/login',{email,password:pass});
  if(result.error){showAlert('tea-alert',result.error);if(btn){btn.disabled=false;btn.textContent='教师登录';}return;}
  S.teacher=result.teacher;S.role='teacher';S.token=result.token;
  sessionStorage.setItem('teacher',JSON.stringify(result.teacher));sessionStorage.setItem('teacherToken',result.token);
  showTeacherDashboard();
}
function registerTeacher(){showScreen('login');}
function showRegister(){showScreen('login');}
function logout(){
  const skid=S.student?.studentKeyId;
  sessionStorage.removeItem('teacher');sessionStorage.removeItem('teacherToken');sessionStorage.removeItem('student');
  if(S.token){api('POST','/api/teacher/logout').catch(()=>{});S.token=null;}
  clearExamState();stopAntiCheat();stopTimer();
  if(S._heartbeatInterval){clearInterval(S._heartbeatInterval);S._heartbeatInterval=null;}
  if(skid)api('DELETE','/api/heartbeat',{student_key_id:skid}).catch(()=>{});
  S.teacher=null;S.student=null;S.role=null;
  S._courses=null;S._coursesOwnerId=null;S._sidebarExams=[];S._examUnitFilter='';S._examSidebarExpanded={};
  S._navSubject='';S._navType='all';S._navPage=1;S._navExpanded={};S._courseNames={};S._unitNames={};S._favorites=new Set();
  _studentExamItems=[];
  const tb=document.querySelector('#login-teacher-panel .btn-primary');if(tb){tb.disabled=false;tb.textContent='教师登录';}
  const sb=document.querySelector('#login-student-panel .btn-primary');if(sb){sb.disabled=false;sb.textContent='进入考试';}
  ['tea-email','tea-pass','stu-key'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  hideAlert('tea-alert');hideAlert('stu-alert');showScreen('login');
}

// ── Teacher Dashboard ──────────────────────────────────────
function showTeacherDashboard(){
  const name=S.teacher?.full_name||'老师';
  // 课程缓存严格绑定当前登录教师，切换账号时不得复用上一位教师的数据。
  if(S._coursesOwnerId!==S.teacher?.id){S._courses=null;S._coursesOwnerId=S.teacher?.id;S._examUnitFilter='';S._examSidebarExpanded={};}
  document.getElementById('teacher-name-display').textContent=name;
  document.getElementById('teacher-avatar').textContent=name.trim()[0].toUpperCase();
  const adminBtn=document.getElementById('admin-create-teacher-btn');
  if(adminBtn)adminBtn.style.display=['super_admin','program_admin'].includes(S.teacher?.role)?'':'none';
  showScreen('teacher');switchTeacherTab('exams');
}
function openTeacherAccountModal(){
  if(!['super_admin','program_admin'].includes(S.teacher?.role))return;
  document.getElementById('new-teacher-email').value='';
  document.getElementById('new-teacher-password').value='';
  document.getElementById('new-teacher-role').value='teacher';
  document.getElementById('new-teacher-program').value=S.teacher?.role==='program_admin'?(S.teacher.program||'ap'):'ap';
  const isProgramAdmin=S.teacher?.role==='program_admin';
  document.getElementById('new-teacher-role-group').style.display=isProgramAdmin?'none':'';
  document.getElementById('new-teacher-program-group').style.display=isProgramAdmin?'none':'';
  const note=document.getElementById('teacher-account-scope-note');
  note.style.display=isProgramAdmin?'':'none';
  note.textContent=isProgramAdmin?`你只能创建 ${S.teacher.program==='a_level'?'A Level':'AP'} 普通教师账号。`:'';
  hideAlert('teacher-account-alert');
  document.getElementById('modal-teacher-account').classList.add('open');
  setTimeout(()=>document.getElementById('new-teacher-email').focus(),0);
}
function closeTeacherAccountModal(){document.getElementById('modal-teacher-account').classList.remove('open');}
async function createTeacherAccount(){
  const email=document.getElementById('new-teacher-email').value.trim();
  const password=document.getElementById('new-teacher-password').value;
  const role=document.getElementById('new-teacher-role').value;
  const program=document.getElementById('new-teacher-program').value;
  hideAlert('teacher-account-alert');
  if(!email||!password){showAlert('teacher-account-alert','请填写账号和密码');return;}
  if(password.length<4){showAlert('teacher-account-alert','密码至少需要 4 个字符');return;}
  const btn=document.getElementById('create-teacher-account-submit');
  btn.disabled=true;btn.textContent='创建中…';
  try{
    const result=await api('POST','/api/admin/teachers',{email,password,role,program});
    if(result.error){showAlert('teacher-account-alert',result.error);return;}
    const roleLabel=role==='program_admin'?'项目管理员':'普通教师';
    const programLabel=program==='a_level'?'A Level':'AP';
    closeTeacherAccountModal();toast(`${programLabel} ${roleLabel}账号 ${email} 创建成功`);
  }catch(e){
    if(e.message!=='401')showAlert('teacher-account-alert','创建失败，请稍后重试');
  }finally{btn.disabled=false;btn.textContent='创建账号';}
}
function switchTeacherTab(tab){
  ['exams','records','live','collection'].forEach(t=>document.getElementById('teacher-tab-'+t).style.display=t===tab?'block':'none');
  document.querySelectorAll('#screen-teacher .tab-btn').forEach((b,i)=>b.classList.toggle('active',(['exams','records','live','collection'][i])===tab));
  if(tab!=='live'){if(_liveInterval){clearInterval(_liveInterval);_liveInterval=null;}}
  if(tab==='exams')renderExamList();
  if(tab==='records')renderRecords();
  if(tab==='live')renderLiveMonitor();
  if(tab==='collection')openTeacherCollection();
}

let _liveInterval=null;
async function renderLiveMonitor(){
  const cont=document.getElementById('teacher-tab-live');
  if(_liveInterval)clearInterval(_liveInterval);
  _liveInterval=setInterval(renderLiveMonitor,10000);
  const rows=await api('GET','/api/heartbeat/active');
  if(!rows.length){cont.innerHTML=`<div class="empty-state"><div class="empty-icon">👀</div><div class="empty-title">当前没有学生在考试</div></div>`;return;}
  const byExam={};
  rows.forEach(r=>{if(!byExam[r.exam_name])byExam[r.exam_name]=[];byExam[r.exam_name].push(r);});
  cont.innerHTML=`<div style="margin-bottom:12px;font-size:13px;color:var(--text2);">每10秒自动刷新 · 共 <strong style="color:var(--text);">${rows.length}</strong> 人在线</div>`+
    Object.entries(byExam).map(([examName,students])=>`
      <div class="card mb-2">
        <div style="font-weight:600;margin-bottom:10px;">${examName} <span class="badge badge-green">${students.length} 人在线</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${students.map(s=>{
            const sw=s.tab_switches||0;
            const swTag=sw>0?`<span style="background:${sw>=3?'var(--red-light)':'var(--amber-light)'};color:${sw>=3?'var(--red)':'var(--amber)'};font-size:11px;padding:1px 6px;border-radius:999px;margin-left:4px;">⚠${sw}次</span>`:'';
            const progress=s.total_q?`<span style="font-size:11px;color:var(--green);margin-left:4px;">${s.current_q||1}/${s.total_q}题</span>`:'';
            const timer=s.timer_left>0?(()=>{const m=Math.floor(s.timer_left/60),sec=s.timer_left%60;return`<span style="font-size:11px;color:${s.timer_left<=60?'var(--red)':s.timer_left<=300?'var(--amber)':'var(--green)'};margin-left:4px;">⏱${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}</span>`;})():'';
            return`<span style="background:var(--green-light);color:var(--green);padding:4px 10px;border-radius:999px;font-size:13px;display:inline-flex;align-items:center;gap:2px;">● ${s.student_name}${progress}${timer}${swTag}</span>`;
          }).join('')}
        </div>
      </div>`).join('');
}

// ── 考试列表 ──────────────────────────────────────────────
const EXAM_LIST_PAGE_SIZE=6;
async function renderExamList(){
  const cont=document.getElementById('exam-list-container');
  const filterSubject=document.getElementById('exam-filter-subject').value;
  const teacherQuery=(S._examTeacherFilter||'').trim().toLowerCase();
  cont.innerHTML='<div style="color:var(--text2);font-size:13px;padding:20px 0;">加载中…</div>';
  const canViewProgram=S.teacher.role==='super_admin'||S.teacher.role==='program_admin';
  let exams=canViewProgram?await api('GET','/api/exams/all'):await api('GET','/api/exams');
  S._sidebarExams=exams.slice();renderExamSidebar(exams);
  const _uf=S._examUnitFilter||'';
  if(_uf==='__none__')exams=exams.filter(e=>!e.unit_id);
  else if(_uf)exams=exams.filter(e=>e.unit_id===_uf);
  if(filterSubject)exams=exams.filter(e=>e.subject===filterSubject);
  if(teacherQuery)exams=exams.filter(e=>`${e.teacher_name||''} ${e.teacher_email||''}`.toLowerCase().includes(teacherQuery));
  if(S._examListTypeFilter==='mcq')exams=exams.filter(e=>e.exam_type==='choice');
  if(S._examListTypeFilter==='frq')exams=exams.filter(e=>e.exam_type==='frq');
  if(S._examListTypeFilter==='fill')exams=exams.filter(e=>e.exam_type==='fill');
  if(S._examListTypeFilter==='fill_text')exams=exams.filter(e=>e.exam_type==='fill_text');
  if(S._examListTypeFilter==='mixed')exams=exams.filter(e=>e.exam_type==='mixed');
  if(S._examListTypeFilter==='toefl')exams=exams.filter(e=>e.exam_type==='toefl');
  if(S._examListTypeFilter==='ielts')exams=exams.filter(e=>e.exam_type==='ielts');
  if(S._examListTypeFilter==='java')exams=exams.filter(e=>e.exam_type==='java');
  const tf=S._examListTypeFilter||'all';
  const teacherSearchHtml=canViewProgram?`<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
    <span style="font-size:12px;color:var(--text3);">教师：</span>
    <input id="exam-teacher-search" class="form-input" style="width:220px;padding:7px 10px;" value="${escapeHtml(S._examTeacherFilter||'')}" placeholder="输入教师姓名或账号" onkeydown="if(event.key==='Enter')examListSearchTeacher()">
    <button class="btn btn-sm" onclick="examListSearchTeacher()">搜索卷子</button>
    ${teacherQuery?`<button class="btn btn-sm" onclick="examListClearTeacher()">清除</button>`:''}
  </div>`:'';
  const typeFilterHtml=teacherSearchHtml+`<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
    <span style="font-size:12px;color:var(--text3);margin-right:2px;">类型：</span>
    ${[['all','全部'],['mcq','MCQ'],['frq','FRQ'],['fill','填空（数字）'],['fill_text','填空（文字）'],['mixed','🔀 混合'],['toefl','🎧 TOEFL'],['ielts','🇬🇧 IELTS'],['java','☕ Java']].map(([v,l])=>
      `<button onclick="examListSetType('${v}')" style="padding:4px 12px;border-radius:999px;font-size:12px;font-weight:500;cursor:pointer;border:1.5px solid ${tf===v?'var(--blue)':'var(--border-md)'};background:${tf===v?'var(--blue)':'var(--surface)'};color:${tf===v?'white':'var(--text2)'};">${l}</button>`
    ).join('')}
    <span style="font-size:12px;color:var(--text3);margin-left:6px;">共 ${exams.length} 场</span>
  </div>`;
  if(!exams.length){
    const _filtered=(S._examListTypeFilter&&S._examListTypeFilter!=='all')||_uf||filterSubject||teacherQuery;
    cont.innerHTML=typeFilterHtml+(_filtered
      ?`<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">该筛选下暂无考试</div><div class="empty-desc">换个类型 / 单元，或点上方「全部」</div></div>`
      :`<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">还没有考试</div><div class="empty-desc">点击「新建考试」创建第一个</div></div>`);
    return;
  }
  const totalPages=Math.ceil(exams.length/EXAM_LIST_PAGE_SIZE);
  if(S._examListPage>totalPages)S._examListPage=totalPages;
  const pageExams=exams.slice((S._examListPage-1)*EXAM_LIST_PAGE_SIZE,S._examListPage*EXAM_LIST_PAGE_SIZE);
  const listHtml=pageExams.map(e=>{
    const isFrq=e.exam_type==='frq',isFill=e.exam_type==='fill',isFillText=e.exam_type==='fill_text',isMixed=e.exam_type==='mixed',isToefl=e.exam_type==='toefl',isIelts=e.exam_type==='ielts',isJava=e.exam_type==='java';
    const isReadonly=!!e.is_readonly;
    const timeLabel=e.time_limit_minutes?` · ⏱ ${e.time_limit_minutes} 分钟`:'';
    const teacherTag=canViewProgram&&e.teacher_name?`<span class="badge badge-amber" style="font-size:10px;">👤 ${e.teacher_name}</span>`:'';
    const programTag=S.teacher.role==='super_admin'?`<span class="badge badge-gray" style="font-size:10px;">${e.program==='a_level'?'A Level':'AP'}</span>`:'';
    const typeTag=isFrq?`<span class="badge badge-amber" style="font-size:10px;">FRQ</span>`:isFill?`<span class="badge badge-blue" style="font-size:10px;">填空（数字）</span>`:isFillText?`<span class="badge badge-blue" style="font-size:10px;">填空（文字）</span>`:isMixed?`<span class="badge badge-amber" style="font-size:10px;">🔀 混合</span>`:isToefl?`<span class="badge badge-blue" style="font-size:10px;">🎧 TOEFL iBT</span>`:isIelts?`<span class="badge badge-blue" style="font-size:10px;">🇬🇧 IELTS</span>`:isJava?`<span class="badge badge-amber" style="font-size:10px;">☕ Java 自动判题</span>`:`<span class="badge badge-gray" style="font-size:10px;">MCQ</span>`;
    const hwTag=e.is_homework?`<span class="badge badge-blue" style="font-size:10px;">📚 作业</span>`:'';
    const privTag=e.is_private?`<span class="badge badge-gray" style="font-size:10px;">🔒 隐私</span>`:'';
    const unitTag=e.unit_name?`<span class="badge badge-green" style="font-size:10px;">📁 ${e.course_name||''}${e.course_name?' · ':''}${e.unit_name}</span>`:'';
    return`<div class="card card-hover mb-2">
      <div class="flex-between">
        <div style="flex:1;min-width:0;">
          <div class="flex gap-2 mb-1" style="flex-wrap:wrap;">
            <span style="font-weight:600;font-size:15px;">${e.name}</span>
            <span class="badge badge-blue">${e.subject}</span>
            ${typeTag}${hwTag}${privTag}${unitTag}${programTag}
            <span class="badge ${e.is_active?'badge-green':'badge-gray'}">${e.is_active?'开放中':'已关闭'}</span>
            ${teacherTag}
            ${isReadonly?'<span class="badge badge-gray" style="font-size:10px;">授权查看 · 只读</span>':''}
          </div>
          <div style="font-size:13px;color:var(--text2);">${e.questions_count} 题 · ${e.students_count} 位学生${timeLabel}${e.description?' · '+e.description:''}</div>
        </div>
        ${isReadonly?'':`<div class="flex gap-1" style="margin-left:12px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-sm" onclick="viewExamRecords('${e.id}','${e.name}')">查看成绩</button>
          <button class="btn btn-sm" onclick="viewStudentKeys('${e.id}','${e.name}')">学生密钥</button>
          <button class="btn btn-sm" onclick="toggleExamActive('${e.id}')">${e.is_active?'关闭':'开放'}</button>
          <button class="btn btn-sm" onclick="editExam('${e.id}')">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="deleteExam('${e.id}')">删除</button>
        </div>`}
      </div>
    </div>`;
  }).join('');
  const paginationHtml=compactPagination(S._examListPage,totalPages,'examListPage');
  cont.innerHTML=typeFilterHtml+listHtml+paginationHtml;
}
function examListPage(p){S._examListPage=p;renderExamList();}
function examListSetType(type){S._examListTypeFilter=type;S._examListPage=1;renderExamList();}
function examListSearchTeacher(){const input=document.getElementById('exam-teacher-search');S._examTeacherFilter=(input?.value||'').trim();S._examListPage=1;renderExamList();}
function examListClearTeacher(){S._examTeacherFilter='';S._examListPage=1;renderExamList();}
async function renderExamSidebar(exams){
  const sb=document.getElementById('exam-sidebar');if(!sb)return;
  if(!S._courses||S._coursesOwnerId!==S.teacher?.id){try{await loadCourses();}catch(e){S._courses=[];}}
  const courses=S._courses||[],uf=S._examUnitFilter||'';
  const cnt={};let none=0;
  (exams||[]).forEach(e=>{if(e.unit_id)cnt[e.unit_id]=(cnt[e.unit_id]||0)+1;else none++;});
  const b=n=>`<span class="cnt">${n}</span>`;
  let html=`<div class="exam-nav-item ${uf===''?'active':''}" onclick="examListSetUnit('')"><span class="lbl">📋 全部考试</span>${b((exams||[]).length)}</div>`;
  courses.forEach(c=>{
    const totalC=(c.units||[]).reduce((s,u)=>s+(cnt[u.id]||0),0);
    const expanded=!!(S._examSidebarExpanded&&S._examSidebarExpanded[c.id]);
    html+=`<div class="exam-nav-course" onclick="examSidebarToggle('${c.id}')" style="cursor:pointer;" aria-expanded="${expanded}"><span class="chev">${expanded?'▼':'▶'}</span><span class="lbl">📁 ${escapeHtml(c.name)}</span>${b(totalC)}</div>`;
    if(expanded){
      html+='<div class="exam-nav-units">';
      if((c.units||[]).length)html+=(c.units).map(u=>`<div class="exam-nav-unit ${uf===u.id?'active':''}" onclick="examListSetUnit('${u.id}')"><span class="lbl">${escapeHtml(u.name)}</span>${b(cnt[u.id]||0)}</div>`).join('');
      else html+='<div class="exam-nav-empty">暂无单元</div>';
      html+='</div>';
    }
  });
  html+=`<div class="exam-nav-item ${uf==='__none__'?'active':''}" onclick="examListSetUnit('__none__')"><span class="lbl">📄 未分类</span>${b(none)}</div>`;
  sb.innerHTML=`<div class="exam-nav"><div class="exam-nav-title">📚 课程 / 单元</div>${html}<div class="exam-nav-manage"><button class="btn btn-sm" style="width:100%;font-size:12px;" onclick="openCourseManager()">＋ 管理课程 / 单元</button></div></div>`;
}
function examListSetUnit(u){S._examUnitFilter=u;S._examListPage=1;renderExamList();}
function examSidebarToggle(cid){if(!S._examSidebarExpanded)S._examSidebarExpanded={};S._examSidebarExpanded[cid]=!S._examSidebarExpanded[cid];renderExamSidebar(S._sidebarExams||[]);}
async function toggleExamActive(id){await api('PUT',`/api/exams/${id}/toggle`);renderExamList();}
async function deleteExam(id){
  if(!confirm('确定删除此考试？学生密钥和成绩记录也会一并删除。'))return;
  await api('DELETE',`/api/exams/${id}`);renderExamList();toast('考试已删除');
}

// ── 课程 / 单元管理 ────────────────────────────────────────
async function loadCourses(){
  const ownerId=S.teacher.id;
  S._courses=await api('GET','/api/courses');
  S._coursesOwnerId=ownerId;
  return S._courses;
}
async function openCourseManager(){
  document.getElementById('modal-courses').classList.add('open');
  document.getElementById('course-manager-list').innerHTML='<div style="color:var(--text2);font-size:13px;padding:16px 0;">⏳ 加载中…</div>';
  await loadCourses();renderCourseManager();
}
function closeCourseManager(){document.getElementById('modal-courses').classList.remove('open');try{if(document.getElementById('exam-sidebar'))renderExamSidebar(S._sidebarExams||[]);}catch(e){}}
function renderCourseManager(){
  const cont=document.getElementById('course-manager-list');
  const courses=S._courses||[];
  if(!courses.length){cont.innerHTML='<div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center;">还没有课程，先在上方新建一门课</div>';return;}
  cont.innerHTML=courses.map(c=>`
    <div class="card mb-2" style="padding:12px 14px;">
      <div class="flex-between" style="align-items:center;">
        <div style="font-weight:600;font-size:14px;">📘 ${_esc(c.name)}</div>
        <div class="flex gap-1">
          <button class="btn btn-sm" onclick="renameCourse('${c.id}')">重命名</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCourse('${c.id}')">删除</button>
        </div>
      </div>
      <div style="margin-top:10px;padding-left:6px;">
        ${(c.units||[]).map((u,unitIndex)=>`
          <div class="flex-between" style="align-items:center;padding:5px 0;border-top:1px solid var(--border);">
            <div style="font-size:13px;color:var(--text2);">📄 ${_esc(u.name)} <span style="color:var(--text3);font-size:11px;">· ${u.exam_count} 场</span></div>
            <div class="flex gap-1">
              <button class="btn btn-sm" title="上移" aria-label="上移 ${_esc(u.name)}" onclick="moveUnit('${c.id}','${u.id}',-1)" ${unitIndex===0?'disabled':''}>↑</button>
              <button class="btn btn-sm" title="下移" aria-label="下移 ${_esc(u.name)}" onclick="moveUnit('${c.id}','${u.id}',1)" ${unitIndex===(c.units||[]).length-1?'disabled':''}>↓</button>
              <button class="btn btn-sm" onclick="renameUnit('${u.id}')">重命名</button>
              <button class="btn btn-sm btn-danger" onclick="deleteUnit('${u.id}')">删除</button>
            </div>
          </div>`).join('')||'<div style="font-size:12px;color:var(--text3);padding:4px 0;">暂无单元</div>'}
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input class="form-input" id="new-unit-${c.id}" placeholder="新单元，如：Unit 1" style="flex:1;font-size:13px;padding:6px 10px;" onkeydown="if(event.key==='Enter')addUnit('${c.id}')" />
          <button class="btn btn-sm btn-primary" onclick="addUnit('${c.id}')">＋ 加单元</button>
        </div>
      </div>
    </div>`).join('');
}
function _esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function addCourse(){
  const el=document.getElementById('new-course-name');const name=el.value.trim();
  if(!name){el.focus();return;}
  await api('POST','/api/courses',{teacher_id:S.teacher.id,name});
  el.value='';await loadCourses();renderCourseManager();
}
async function renameCourse(id){
  const c=(S._courses||[]).find(x=>x.id===id);const name=prompt('课程名称',c?c.name:'');
  if(name==null||!name.trim())return;
  await api('PUT',`/api/courses/${id}`,{name:name.trim()});await loadCourses();renderCourseManager();
}
async function deleteCourse(id){
  if(!confirm('删除此课程及其所有单元？归属这些单元的考试会变回「未分类」（考试本身不会删除）。'))return;
  await api('DELETE',`/api/courses/${id}`);await loadCourses();renderCourseManager();
}
async function addUnit(courseId){
  const el=document.getElementById('new-unit-'+courseId);const name=el.value.trim();
  if(!name){el.focus();return;}
  await api('POST','/api/units',{course_id:courseId,name});
  await loadCourses();renderCourseManager();
}
async function renameUnit(id){
  let cur='';(S._courses||[]).forEach(c=>(c.units||[]).forEach(u=>{if(u.id===id)cur=u.name;}));
  const name=prompt('单元名称',cur);if(name==null||!name.trim())return;
  await api('PUT',`/api/units/${id}`,{name:name.trim()});await loadCourses();renderCourseManager();
}
async function moveUnit(courseId,id,direction){
  const course=(S._courses||[]).find(c=>c.id===courseId);if(!course)return;
  const units=course.units||[];const from=units.findIndex(u=>u.id===id);const to=from+direction;
  if(from<0||to<0||to>=units.length)return;
  const previous=units.slice();
  units.splice(to,0,units.splice(from,1)[0]);renderCourseManager();
  try{
    const result=await api('PUT','/api/units/reorder',{course_id:courseId,ordered_ids:units.map(u=>u.id)});
    if(result&&result.error)throw new Error(result.error);
    await loadCourses();renderCourseManager();
    try{if(document.getElementById('exam-sidebar'))renderExamSidebar(S._sidebarExams||[]);}catch(e){}
  }catch(e){
    course.units=previous;renderCourseManager();toast('移动失败：'+e.message);
  }
}
async function deleteUnit(id){
  if(!confirm('删除此单元？归属它的考试会变回「未分类」（考试本身不会删除）。'))return;
  await api('DELETE',`/api/units/${id}`);await loadCourses();renderCourseManager();
}
// 填充「所属单元」下拉（课程 → 单元 分组）
async function populateExamUnitSelect(selectedUnitId){
  const sel=document.getElementById('modal-exam-unit');if(!sel)return;
  if(!S._courses)await loadCourses();
  let html='<option value="">未分类</option>';
  (S._courses||[]).forEach(c=>{
    if(!(c.units||[]).length)return;
    html+=`<optgroup label="${_esc(c.name)}">`+c.units.map(u=>`<option value="${u.id}">${_esc(u.name)}</option>`).join('')+`</optgroup>`;
  });
  sel.innerHTML=html;
  sel.value=selectedUnitId||'';
}

// ── 成绩查看（教师端）────────────────────────────────────
async function viewExamRecords(examId,examName){
  document.getElementById('exam-records-modal-title').textContent=`成绩 — ${examName}`;
  const cont=document.getElementById('exam-records-list');
  cont.innerHTML='<div style="color:var(--text2);font-size:13px;padding:16px 0;">⏳ 加载中…</div>';
  document.getElementById('modal-exam-records').classList.add('open');
  S._currentExamName=examName;
  const [recs,qs]=await Promise.all([api('GET','/api/records',{exam_id:examId}),api('GET',`/api/questions/${examId}?role=teacher`)]);
  S._currentExamRecords=recs;S._currentExamQuestions=qs;
  if(!recs.length){cont.innerHTML='<div style="color:var(--text2);font-size:13px;padding:16px 0;">暂无学生提交</div>';return;}
  const examInfo=(S._sidebarExams||[]).find(e=>e.id===examId)||await api('GET',['super_admin','program_admin'].includes(S.teacher?.role)?'/api/exams/all':'/api/exams').then(es=>es.find(e=>e.id===examId)).catch(()=>null);
  const isFrqModal=examInfo&&examInfo.exam_type==='frq';
  const isFillModal=examInfo&&examInfo.exam_type==='fill';
  const isFillTextModal=examInfo&&examInfo.exam_type==='fill_text';
  const isMixedModal=examInfo&&examInfo.exam_type==='mixed';
  if(isFrqModal){
    S._frqGradingExamId=examId;S._frqGradingQuestions=qs;S._frqGradingRecords=recs;
    S._frqViewMode=S._frqViewMode||'student';
    _renderFrqRecordsList(cont,recs,qs);return;
  }
  // 是否存在需要人工批改的题（FRQ 或人工改填空）
  const hasManual=qs.some(q=>{const t=q.question_type||'choice';return t==='frq'||((t==='fill'||t==='fill_text')&&(q.grading||'auto')==='manual');});
  if(hasManual){S._frqGradingExamId=examId;S._frqGradingQuestions=qs;S._frqGradingRecords=recs;}
  const _recTotal=r=>{const g=r.frq_score!==null&&r.frq_score!==undefined;return hasManual&&g?(r.score+(r.frq_score||0)):r.score;};
  const avg=recs.reduce((s,r)=>s+_recTotal(r)/r.total*100,0)/recs.length;
  const best=Math.max(...recs.map(r=>_recTotal(r)/r.total*100));
  // 拆出每题的「单元」：多空填空/补全单词/听力填空 → 每个空；听力选择/阅读 → 每个小题；对应题 → 每条
  const _qUnits=(q,qt)=>{
    if(qt==='fill'||qt==='fill_text'||qt==='cloze'||qt==='audio_fill'){
      const bs=getQBlanks(q);
      if(!bs)return null;
      if((qt==='fill'||qt==='fill_text')&&bs.length<2)return null; // 单空填空不拆
      return bs.map((b,bi)=>({label:b.label||`空${bi+1}`}));
    }
    if(qt==='audio_choice'||qt==='reading'){const subs=parseSubs(q);return Array.isArray(subs)&&subs.length?subs.map((s,si)=>({label:`小题${si+1}`})):null;}
    if(qt==='matching'){const m=matchCanon(parseSubs(q));return m.options.length?m.options.map((o,oi)=>({label:`第${oi+1}项`})):null;}
    return null;
  };
  const _qUnitWrong=(q,qt,ans,ui)=>{
    if(qt==='fill'||qt==='fill_text'||qt==='cloze'||qt==='audio_fill'){
      const bs=getQBlanks(q);const eq=qt==='fill'?numEqC:strEqC;
      const arr=Array.isArray(ans)?ans:[ans];
      return !eq(arr[ui],bs[ui]?.answer);
    }
    const subs=parseSubs(q);const arr=Array.isArray(ans)?ans:[];
    if(qt==='matching')return _ansNum(arr[ui])!==Number(matchCanon(subs).options[ui]?.correct);
    const sub=subs[ui];if(!sub)return true;
    if(Array.isArray(sub.correct)&&sub.correct.length>1){
      const sel=(Array.isArray(arr[ui])?arr[ui]:[arr[ui]]).map(_ansNum).filter(n=>!isNaN(n));
      return sub.correct.filter(c=>sel.includes(Number(c))).length<sub.correct.length;
    }
    const corr=Array.isArray(sub.correct)?sub.correct[0]:sub.correct;
    const mine=Array.isArray(arr[ui])?(arr[ui].length===1?arr[ui][0]:NaN):arr[ui];
    return _ansNum(mine)!==Number(corr);
  };
  const qAccuracy=qs.map((q,qi)=>{
    const answered=recs.filter(r=>r.answers_data&&r.answers_data[qi]!==undefined);
    if(!answered.length)return 0;
    const qt=isMixedModal?(q.question_type||'choice'):(isFillModal?'fill':isFillTextModal?'fill_text':'choice');
    if(qt==='frq'||isManualQ(q,qt))return -1;
    const units=_qUnits(q,qt);
    if(units){
      let tot=0,wrong=0;
      answered.forEach(r=>units.forEach((u,ui)=>{tot++;if(_qUnitWrong(q,qt,r.answers_data[qi],ui))wrong++;}));
      return tot?Math.round((1-wrong/tot)*100):0;
    }
    const correct=answered.filter(r=>ENG_QTS.includes(qt)?_teacherEngOk(q,qt,r.answers_data[qi]):(qt==='fill'||qt==='fill_text')?_teacherFillOk(q,qt,r.answers_data[qi]):_teacherChoiceOk(q,r.answers_data[qi])).length;
    return Math.round(correct/answered.length*100);
  });
  const qAccuracyHtml=qs.length?`
    <div style="margin-bottom:18px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;">每题正确率 <span style="font-weight:400;color:var(--text3);font-size:11px;">点击查看每空/每小题错误详情</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${qs.map((q,qi)=>{
          const pct=qAccuracy[qi];
          const isFrqQ=pct===-1;
          const color=isFrqQ?'var(--amber)':pct>=80?'var(--green)':pct>=50?'var(--amber)':'var(--red)';
          const bg=isFrqQ?'var(--amber-light)':pct>=80?'var(--green-light)':pct>=50?'var(--amber-light)':'var(--red-light)';
          const qt=isMixedModal?(q.question_type||'choice'):(isFillModal?'fill':isFillTextModal?'fill_text':'choice');
          const _badge=n=>`<span style="display:inline-block;background:var(--red-light);color:var(--red);font-size:11px;padding:2px 7px;border-radius:999px;margin:2px;">${n}</span>`;
          const units=isFrqQ?null:_qUnits(q,qt);
          let popupBody;
          if(isFrqQ){popupBody='<span style="font-size:11px;color:var(--text3);">人工批改不计算</span>';}
          else if(units){
            // 每空/每小题：错误人数 + 名单
            popupBody=units.map((u,ui)=>{
              const wrongNames=recs.filter(r=>r.answers_data&&r.answers_data[qi]!==undefined&&_qUnitWrong(q,qt,r.answers_data[qi],ui)).map(r=>r.student_name);
              return`<div style="margin-bottom:7px;">
                <div style="font-size:11px;font-weight:600;color:${wrongNames.length?'var(--red)':'var(--green)'};margin-bottom:2px;">${u.label} · ${wrongNames.length}人错</div>
                <div style="display:flex;flex-wrap:wrap;gap:2px;">${wrongNames.length?wrongNames.map(_badge).join(''):'<span style="font-size:11px;color:var(--text3);">无人答错</span>'}</div>
              </div>`;
            }).join('');
          } else{
            const wrongStudents=recs.filter(r=>r.answers_data&&r.answers_data[qi]!==undefined&&
              (ENG_QTS.includes(qt)?!_teacherEngOk(q,qt,r.answers_data[qi]):(qt==='fill'||qt==='fill_text')?!_teacherFillOk(q,qt,r.answers_data[qi]):!_teacherChoiceOk(q,r.answers_data[qi]))
            ).map(r=>r.student_name);
            popupBody=`<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px;">答错的学生（${wrongStudents.length}人）</div><div style="display:flex;flex-wrap:wrap;gap:3px;">${wrongStudents.length?wrongStudents.map(_badge).join(''):'<span style="font-size:11px;color:var(--text3);">无人答错</span>'}</div>`;
          }
          const popupId='wpop_'+qi;
          const qtLabel=isMixedModal?(qt==='frq'?'FRQ':qt==='fill'||qt==='fill_text'?'填':qt==='cloze'?'词':qt==='audio_choice'?'听选':qt==='audio_fill'?'听填':qt==='reading'?'读':qt==='matching'?'配':'MCQ'):'';
          return`<div style="position:relative;">
            <div onclick="document.querySelectorAll('[id^=wpop_]').forEach(p=>p.style.display='none');(function(el){el.style.display=el.style.display==='none'?'block':'none';})(document.getElementById('${popupId}'))"
              style="background:${bg};border-radius:var(--radius-sm);padding:6px 10px;text-align:center;min-width:52px;cursor:pointer;user-select:none;">
              <div style="font-size:11px;color:var(--text2);margin-bottom:2px;">Q${qi+1}${qtLabel?'·'+qtLabel:''}</div>
              <div style="font-size:14px;font-weight:600;color:${color};">${isFrqQ?'人工':pct+'%'}</div>
            </div>
            <div id="${popupId}" style="display:none;position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--border-md);border-radius:var(--radius-sm);padding:10px 12px;box-shadow:var(--shadow-md);z-index:99;min-width:180px;max-width:280px;max-height:320px;overflow-y:auto;white-space:normal;">
              ${popupBody}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`:'';
  cont.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
      <div class="stat-card"><div class="stat-val">${recs.length}</div><div class="stat-label">提交人数</div></div>
      <div class="stat-card"><div class="stat-val">${Math.round(avg)}%</div><div class="stat-label">平均分</div></div>
      <div class="stat-card"><div class="stat-val">${Math.round(best)}%</div><div class="stat-label">最高分</div></div>
    </div>
    ${qAccuracyHtml}
    <div class="table-wrap"><table>
      <thead><tr><th>学生姓名</th><th>成绩</th><th>正确率</th><th>切屏</th><th>提交时间</th><th>用时</th>${hasManual?'<th>人工批改</th>':''}</tr></thead>
      <tbody>${recs.map(r=>{
        const _rGraded=r.frq_score!==null&&r.frq_score!==undefined;
        const _rTotal=hasManual&&_rGraded?(r.score+(r.frq_score||0)):r.score;
        const pct=Math.round(_rTotal/r.total*100);const{bg,fg}=scoreColor(pct);const sw=r.tab_switches||0;
        const isGraded=_rGraded;
        return`<tr>
          <td style="font-weight:500;">${r.student_name}</td>
          <td><span class="score-ring" style="background:${bg};color:${fg};">${_rTotal}/${r.total}</span></td>
          <td><div class="flex gap-2"><div class="progress" style="width:70px;flex-shrink:0;"><div class="progress-bar" style="width:${pct}%;background:${pct>=80?'var(--green)':pct>=60?'var(--amber)':'var(--red)'};"></div></div><span style="font-size:13px;color:var(--text2);">${pct}%</span></div></td>
          <td style="color:${sw>=3?'var(--red)':sw>0?'var(--amber)':'var(--text2)'};">${sw>0?'⚠ '+sw:'0'}</td>
          <td style="color:var(--text2);font-size:12px;">${r.created_at||'—'}</td>
          <td style="color:var(--text2);font-size:12px;">${fmtDur(r.duration_seconds)}</td>
          ${hasManual?`<td><button class="btn btn-sm" onclick="openFrqGrading('${r.id}')" style="${isGraded?'':'border-color:var(--amber);color:var(--amber);'}">${isGraded?'已批改 ✓':'✍️ 批改'}</button></td>`:''}
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}
function closeExamRecordsModal(){document.getElementById('modal-exam-records').classList.remove('open');}

// ── FRQ 批改 ──────────────────────────────────────────────
function _renderFrqRecordsList(cont,recs,qs){
  const mode=S._frqViewMode||'student';
  const tabBtn=(label,m)=>`<button onclick="S._frqViewMode='${m}';_renderFrqRecordsList(document.getElementById('exam-records-list'),S._frqGradingRecords,S._frqGradingQuestions)" style="padding:6px 16px;border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid ${mode===m?'var(--blue)':'var(--border-md)'};background:${mode===m?'var(--blue)':'var(--surface)'};color:${mode===m?'white':'var(--text2)'};">${label}</button>`;
  let body=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
    <span style="font-size:13px;color:var(--text2);">${recs.length} 位学生已提交</span>
    <div style="display:flex;gap:6px;">${tabBtn('按学生','student')}${tabBtn('按题目','question')}</div>
  </div>`;
  if(mode==='student'){
    body+=recs.map(r=>{
      const isGraded=r.frq_score!==null&&r.frq_score!==undefined;
      return`<div class="card card-hover mb-2" style="cursor:pointer;border-left:3px solid ${isGraded?'var(--green)':'var(--amber)'};" onclick="openFrqGrading('${r.id}')">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <span style="font-weight:600;">${r.student_name}</span>
            <span style="font-size:12px;color:var(--text3);margin-left:8px;">${r.created_at||''}</span>${r.duration_seconds!=null?`<span style="font-size:12px;color:var(--text3);margin-left:6px;">· 用时 ${fmtDur(r.duration_seconds)}</span>`:''}
            ${r.tab_switches>0?`<span class="badge badge-amber" style="font-size:10px;margin-left:4px;">⚠ 切屏${r.tab_switches}次</span>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${isGraded?`<span class="badge badge-green">已批改 ${r.frq_score}/${r.frq_max_score??qs.reduce((s,q)=>s+(q.max_score||1),0)}分</span>`:`<span class="badge badge-amber">待批改</span>`}
            <span style="font-size:13px;color:var(--text3);">查看作答 →</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } else {
    body+=qs.map((q,qi)=>{
      const studentAnswers=recs.map(r=>{
        if(typeof r.frq_answers==='string')try{r.frq_answers=JSON.parse(r.frq_answers);}catch(e){r.frq_answers={};}
        if(typeof r.frq_q_scores==='string')try{r.frq_q_scores=JSON.parse(r.frq_q_scores);}catch(e){r.frq_q_scores={};}
        return{name:r.student_name,ans:r.frq_answers?.[qi]||'',score:r.frq_q_scores?.[qi]};
      });
      const answered=studentAnswers.filter(s=>s.ans.trim()).length;
      return`<div class="card mb-3" style="border-left:3px solid var(--blue);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;cursor:pointer;" onclick="this.parentElement.querySelector('.frq-q-answers').style.display=this.parentElement.querySelector('.frq-q-answers').style.display==='none'?'block':'none'">
          <div><span style="font-weight:600;font-size:14px;">Q${qi+1}</span>${q.question_text?`<span style="font-size:13px;color:var(--text2);margin-left:8px;">${q.question_text.slice(0,60)}${q.question_text.length>60?'…':''}</span>`:''}<span style="font-size:12px;color:var(--text3);margin-left:8px;">${answered}/${recs.length} 人作答</span></div>
          <span style="font-size:12px;color:var(--text3);">点击展开 ▾</span>
        </div>
        <div class="frq-q-answers" style="display:none;">
          ${studentAnswers.map(s=>`<div style="margin-bottom:10px;padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border);">
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
  cont.innerHTML=body;
}
// 此题是否需要人工批改（FRQ 或人工改填空）
function _needsGrading(q){const t=q.question_type||'choice';return t==='frq'||((t==='fill'||t==='fill_text')&&(q.grading||'auto')==='manual');}
// 教师端：填空题自动判分（多空兼容）
function _teacherFillOk(q,qt,ans){const bs=getQBlanks(q);const key=bs?bs.map(b=>b.answer):q.answer_key;return fillAnsCorrect(qt,ans,key);}
function openFrqGrading(recordId){
  const rec=S._frqGradingRecords.find(r=>r.id===recordId),qs=S._frqGradingQuestions;
  if(!rec||!qs)return;
  S._gradingRecordId=recordId;
  if(typeof rec.frq_feedback==='string')try{rec.frq_feedback=JSON.parse(rec.frq_feedback);}catch(e){rec.frq_feedback={};}
  if(typeof rec.frq_q_scores==='string')try{rec.frq_q_scores=JSON.parse(rec.frq_q_scores);}catch(e){rec.frq_q_scores={};}
  if(typeof rec.frq_answers==='string')try{rec.frq_answers=JSON.parse(rec.frq_answers);}catch(e){rec.frq_answers={};}
  if(typeof rec.answers_data==='string')try{rec.answers_data=JSON.parse(rec.answers_data);}catch(e){rec.answers_data={};}
  const gradable=qs.map((q,qi)=>({q,qi})).filter(({q})=>_needsGrading(q));
  S._gradingQIdxs=gradable.map(g=>g.qi);
  document.getElementById('frq-grading-title').textContent=`批改 — ${rec.student_name}`;
  document.getElementById('frq-grading-body').innerHTML=gradable.map(({q,qi})=>{
    const isFillQ=q.question_type==='fill'||q.question_type==='fill_text';
    let studentAns,refAns='';
    if(isFillQ){
      const bs=getQBlanks(q);const ans=rec.answers_data?.[qi];const arr=Array.isArray(ans)?ans:[ans];
      if(bs){
        studentAns=bs.map((b,bi)=>`${b.label||('空'+(bi+1))}：${(arr[bi]===undefined||arr[bi]==='')?'（未作答）':arr[bi]}`).join('\n');
        refAns=bs.map((b,bi)=>`${b.label||('空'+(bi+1))}：${b.answer??''}`).join('\n');
      } else{studentAns=ans!=null?String(ans):'';refAns=q.answer_key||'';}
    } else studentAns=rec.frq_answers?.[qi]||'';
    const feedback=rec.frq_feedback?.[qi]||'',qScore=rec.frq_q_scores?.[qi]??'';
    return`<div style="margin-bottom:20px;padding:16px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
      <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.4px;">Q${qi+1}${isFillQ?' · ✍️ 人工改填空':''}</div>
      ${q.question_text?`<div style="font-size:14px;color:var(--text2);margin-bottom:10px;white-space:pre-wrap;line-height:1.7;">${q.question_text}</div>`:''}
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px;font-weight:500;">学生作答：</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;font-size:14px;line-height:1.8;white-space:pre-wrap;min-height:48px;color:${studentAns?'var(--text)':'var(--text3)'};">${escapeHtml(studentAns)||'（未作答）'}</div>
      ${refAns?`<div style="font-size:12px;color:var(--green);margin:8px 0 4px;font-weight:500;">参考答案：</div><div style="background:var(--green-light);border:1px solid rgba(59,109,17,0.15);border-radius:var(--radius-sm);padding:10px 14px;font-size:13px;line-height:1.8;white-space:pre-wrap;color:var(--text);">${escapeHtml(refAns)}</div>`:''}
      <div style="display:flex;gap:10px;margin-top:12px;align-items:flex-start;">
        <div style="flex:1;"><div style="font-size:12px;color:var(--text3);margin-bottom:4px;font-weight:500;">教师评语（可选）：</div><textarea id="feedback-${qi}" placeholder="输入评语…" style="width:100%;padding:8px 10px;border:1px solid var(--border-md);border-radius:var(--radius-sm);font-size:13px;font-family:'DM Sans',sans-serif;resize:vertical;min-height:60px;background:var(--surface);color:var(--text);">${escapeHtml(feedback)}</textarea></div>
        <div style="flex-shrink:0;width:90px;"><div style="font-size:12px;color:var(--text3);margin-bottom:4px;font-weight:500;">分数 / ${q.max_score??1}：</div><input id="score-${qi}" type="number" min="0" max="${q.max_score??1}" value="${qScore}" placeholder="分" style="width:100%;padding:8px;border:1px solid var(--border-md);border-radius:var(--radius-sm);font-size:14px;text-align:center;background:var(--surface);color:var(--text);" /></div>
      </div>
    </div>`;
  }).join('')||'<div style="color:var(--text2);font-size:13px;padding:16px 0;">此考试没有需要人工批改的题目</div>';
  document.getElementById('modal-frq-grading').classList.add('open');
}
async function saveFrqGrade(){
  const rec=S._frqGradingRecords.find(r=>r.id===S._gradingRecordId),qs=S._frqGradingQuestions;
  if(!rec||!qs)return;
  const btn=document.getElementById('frq-grade-save-btn');btn.disabled=true;btn.textContent='保存中…';
  const feedback={},qScores={};let totalScore=0,maxTotal=0;
  const gradingIdxs=S._gradingQIdxs||qs.map((_,qi)=>qi);
  gradingIdxs.forEach(qi=>{
    const q=qs[qi];
    const fb=document.getElementById(`feedback-${qi}`)?.value?.trim()||'';
    const maxSc=q.max_score??1,sc=Math.min(parseInt(document.getElementById(`score-${qi}`)?.value)||0,maxSc);
    if(fb)feedback[qi]=fb;qScores[qi]=sc;totalScore+=sc;maxTotal+=maxSc;
  });
  const result=await api('PUT',`/api/records/${S._gradingRecordId}/grade`,{frq_feedback:feedback,frq_q_scores:qScores,frq_score:totalScore,frq_max_score:maxTotal});
  if(result.success){
    toast('批改已保存 ✓');
    const idx=S._frqGradingRecords.findIndex(r=>r.id===S._gradingRecordId);
    if(idx>=0){S._frqGradingRecords[idx].frq_feedback=feedback;S._frqGradingRecords[idx].frq_q_scores=qScores;S._frqGradingRecords[idx].frq_score=totalScore;}
    btn.disabled=false;btn.textContent='保存批改';
    document.getElementById('modal-frq-grading').classList.remove('open');
    viewExamRecords(S._frqGradingExamId,S._currentExamName);
  } else{toast('保存失败，请重试');btn.disabled=false;btn.textContent='保存批改';}
}

function downloadExamExcel(){
  const recs=S._currentExamRecords,qs=S._currentExamQuestions,name=S._currentExamName;
  if(!recs.length){toast('暂无数据');return;}
  const isMixedExcel=qs.length>0&&qs.some((q,i)=>i>0&&q.question_type!==qs[0].question_type);
  const isFillExcel=!isMixedExcel&&qs.length>0&&qs[0].question_type==='fill';
  const isFillTextExcel=!isMixedExcel&&qs.length>0&&qs[0].question_type==='fill_text';
  const qHeaders=qs.map((_,i)=>`Q${i+1}答题`).join(',');
  const qAccRow=qs.map((q,qi)=>{
    const qt=isMixedExcel?(q.question_type||'choice'):(isFillExcel?'fill':isFillTextExcel?'fill_text':'choice');
    if(qt==='frq'||isManualQ(q,qt))return'人工批改';
    const correct=recs.filter(r=>r.answers_data&&(ENG_QTS.includes(qt)?_teacherEngOk(q,qt,r.answers_data[qi]):(qt==='fill'||qt==='fill_text')?_teacherFillOk(q,qt,r.answers_data[qi]):_teacherChoiceOk(q,r.answers_data[qi]))).length;
    return recs.length>0?Math.round(correct/recs.length*100)+'%':'0%';
  }).join(',');
  const letters=getLetters(8); // A–H，覆盖最多 8 个选项（旧写法只有 A–E，第 6 个选项会显示成数字 5）
  const header=`姓名,得分,总题数,正确率(%),切屏次数,提交时间,用时${qs.length?','+qHeaders:''}`;
  const accRow=`全班正确率,,,,,,${qs.length?','+qAccRow:''}`;
  const rows=recs.map(r=>{
    const pct=Math.round(r.score/r.total*100),sw=r.tab_switches||0;
    const qCells=qs.map((q,qi)=>{
      const ans=r.answers_data?.[qi];if(ans===undefined)return'未答';
      const qt=isMixedExcel?(q.question_type||'choice'):(isFillExcel?'fill':isFillTextExcel?'fill_text':'choice');
      if(qt==='frq')return String(r.frq_answers?.[qi]||'').slice(0,30);
      if(ENG_QTS.includes(qt)){
        const earned=engEarnedClient(q,qt,ans,engKeyClient(q,qt));
        return`${earned>=(q.max_score||1)?'✓':'✗'}得${earned}/${q.max_score||1}分`;
      }
      if(qt==='fill'||qt==='fill_text'){
        const ansTxt=_fmtAns(ans).replace(/,/g,'，');
        if(isManualQ(q,qt))return'✍'+ansTxt.slice(0,40);
        const bs=getQBlanks(q);const keyTxt=_fmtAns(bs?bs.map(b=>b.answer):q.answer_key).replace(/,/g,'，');
        const ok=_teacherFillOk(q,qt,ans);return ok?('✓'+ansTxt):('✗'+ansTxt+'(正确:'+keyTxt+')');
      }
      const _cmx=choiceMulti(q);
      if(_cmx){const sel=(Array.isArray(ans)?ans:[ans]).map(Number).filter(n=>!isNaN(n)).map(x=>letters[x]||x).join('');const ok=_teacherChoiceOk(q,ans);return `${ok?'✓':'✗'}${sel||'—'}`;}
      const ok=parseInt(ans)===q.correct_answer;return ok?('✓'+(letters[ans]||ans)):('✗'+(letters[ans]||ans));
    }).join(',');
    return`${r.student_name},${r.score},${r.total},${pct}%,${sw},${r.created_at||''},${fmtDur(r.duration_seconds)}${qs.length?','+qCells:''}`;
  }).join('\n');
  const wrongByQ=qs.map((q,qi)=>{
    const qt=isMixedExcel?(q.question_type||'choice'):(isFillExcel?'fill':isFillTextExcel?'fill_text':'choice');
    if(qt==='frq'||isManualQ(q,qt))return'人工批改不自动判分';
    const wrongNames=recs.filter(r=>{if(r.answers_data?.[qi]===undefined)return false;return ENG_QTS.includes(qt)?!_teacherEngOk(q,qt,r.answers_data[qi]):(qt==='fill'||qt==='fill_text')?!_teacherFillOk(q,qt,r.answers_data[qi]):!_teacherChoiceOk(q,r.answers_data[qi]);}).map(r=>r.student_name);
    return wrongNames.length?wrongNames.join('、'):'无';
  });
  const wrongByStudentRows=recs.map(r=>{
    const wl=qs.map((q,qi)=>{
      const ans=r.answers_data?.[qi];if(ans===undefined)return`Q${qi+1}(未答)`;
      const qt=isMixedExcel?(q.question_type||'choice'):(isFillExcel?'fill':isFillTextExcel?'fill_text':'choice');
      if(qt==='frq'||isManualQ(q,qt))return null;
      if(ENG_QTS.includes(qt)){const earned=engEarnedClient(q,qt,ans,engKeyClient(q,qt));return earned>=(q.max_score||1)?null:`Q${qi+1}(得${earned}/${q.max_score||1}分)`;}
      const _cmw=choiceMulti(q);
      if(_cmw){if(_teacherChoiceOk(q,ans))return null;const cor=(_cmw.correct||[]).map(c=>letters[c]||c).join('');const sel=(Array.isArray(ans)?ans:[ans]).map(Number).filter(n=>!isNaN(n)).map(x=>letters[x]||x).join('');return`Q${qi+1}(选了${sel||'—'}，正确${cor})`;}
      const isWrong=(qt==='fill'||qt==='fill_text')?!_teacherFillOk(q,qt,ans):(parseInt(ans)!==q.correct_answer);
      if(!isWrong)return null;
      if(qt==='fill'||qt==='fill_text'){const bs=getQBlanks(q);const keyTxt=_fmtAns(bs?bs.map(b=>b.answer):q.answer_key).replace(/,/g,'，');return`Q${qi+1}(填了${_fmtAns(ans).replace(/,/g,'，')}，正确${keyTxt})`;}
      return`Q${qi+1}(选了${letters[ans]||ans}，正确${letters[q.correct_answer]})`;
    }).filter(Boolean);
    return`${r.student_name},${wl.length?wl.join('、'):'全部正确'}`;
  }).join('\n');
  const csv='\uFEFF'+header+'\n'+accRow+'\n'+rows+'\n\n每题答错学生汇总\n题目,答错学生\n'+qs.map((q,qi)=>`Q${qi+1},${wrongByQ[qi]}`).join('\n')+'\n\n每位学生答错题目汇总\n学生,答错题目\n'+wrongByStudentRows;
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`${name}_成绩单.csv`;a.click();URL.revokeObjectURL(url);
  toast('成绩单已下载 ✓');
}

// ── 密钥管理 ──────────────────────────────────────────────
async function viewStudentKeys(examId,examName){
  S.viewingKeysExamId=examId;
  document.getElementById('keys-modal-title').textContent=`学生专属密钥 — ${examName}`;
  document.getElementById('keys-list').innerHTML='<div style="color:var(--text2);font-size:13px;">加载中…</div>';
  document.getElementById('modal-keys').classList.add('open');
  S.viewingKeysData=await api('GET',`/api/student-keys/${examId}`);
  renderKeysList();
}
function renderKeysList(){
  const cont=document.getElementById('keys-list');
  if(!S.viewingKeysData.length){cont.innerHTML='<div style="color:var(--text2);font-size:13px;">此考试暂无学生名单</div>';return;}
  cont.innerHTML=S.viewingKeysData.map(sk=>{
    const submitted=sk.has_record,inProgress=!submitted&&sk.has_progress,scoreText=submitted?` · ${sk.score}/${sk.total}`:'';
    return`<div class="sk-row">
      <span class="sk-name">${sk.student_name}</span>
      <span class="sk-key">${sk.student_key}</span>
      <span class="sk-status" style="color:${submitted?'var(--green)':inProgress?'var(--blue)':'var(--text3)'};">${submitted?'已提交'+scoreText:inProgress?'答题中（已有进度）':'未开始'}</span>
      <div style="display:flex;gap:4px;">
        ${(submitted||inProgress)?`<button class="btn btn-sm" onclick="resetStudent('${sk.id}','${sk.student_name}')" style="padding:3px 8px;font-size:11px;">重置作答</button>`:''}
        <button class="btn btn-sm btn-danger" onclick="removeStudentFromExam('${sk.id}','${sk.student_name}')" style="padding:3px 8px;font-size:11px;">删除</button>
      </div>
    </div>`;
  }).join('');
}
async function removeStudentFromExam(studentKeyId,studentName){
  if(!confirm(`确定将「${studentName}」从此考试中删除？该学生的密钥和成绩记录都会删除。`))return;
  const result=await api('DELETE',`/api/student-keys/single/${studentKeyId}`);
  if(result.success){toast(`已删除 ${studentName} ✓`);S.viewingKeysData=await api('GET',`/api/student-keys/${S.viewingKeysExamId}`);renderKeysList();}
  else toast('删除失败，请重试');
}
async function resetStudent(studentKeyId,studentName){
  if(!confirm(`确定完整重置「${studentName}」这场考试的作答？成绩、答题进度、录音、切屏记录和计时状态都会清除，学生密钥保持不变。`))return;
  const result=await api('DELETE',`/api/records/student/${studentKeyId}`);
  if(result.success){toast(`已完整重置 ${studentName} 的本次作答，原密钥仍可使用 ✓`);S.viewingKeysData=await api('GET',`/api/student-keys/${S.viewingKeysExamId}`);renderKeysList();}
  else toast('重置失败，请重试');
}
function copyAllKeys(){
  const text=S.viewingKeysData.map(sk=>`${sk.student_name}\t${sk.student_key}`).join('\n');
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(()=>toast('已复制到剪贴板 ✓')).catch(()=>fallbackCopy(text));}
  else fallbackCopy(text);
}
function fallbackCopy(text){
  const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand('copy');toast('已复制到剪贴板 ✓');}catch(e){toast('请手动复制');}
  document.body.removeChild(ta);
}
function closeKeysModal(){document.getElementById('modal-keys').classList.remove('open');}

// ── 创建/编辑考试 ──────────────────────────────────────────
function openCreateExam(){
  S.editingExamId=null;S.draftQuestions=[];S.choiceCount=4;S.examType='choice';
  document.getElementById('exam-modal-title').textContent='新建考试';
  ['modal-exam-name','modal-exam-subject','modal-exam-desc','modal-time-limit','modal-student-names'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('modal-choice-count').value='4';
  document.getElementById('modal-exam-type').value='choice';
  const hwEl=document.getElementById('modal-is-homework');if(hwEl)hwEl.value='0';
  document.querySelectorAll('input[name="hw-type-radio"]').forEach(r=>r.checked=r.value==='0');
  const pvEl=document.getElementById('modal-is-private');if(pvEl)pvEl.checked=false;
  document.getElementById('modal-student-names').placeholder='每行输入一个名字，例如：\n张三\n李四\n王五';
  populateExamUnitSelect('');
  onExamTypeChange();updateChoicePreview();hideAlert('exam-modal-alert');renderDraftQuestions();
  document.getElementById('modal-exam').classList.add('open');
}
async function editExam(id){
  let exam=(S._sidebarExams||[]).find(e=>e.id===id);
  if(!exam){const exams=await api('GET',['super_admin','program_admin'].includes(S.teacher?.role)?'/api/exams/all':'/api/exams');exam=exams.find(e=>e.id===id);}
  if(!exam){toast('找不到该考试，或当前账号没有查看权限');return;}
  const questions=await api('GET',`/api/questions/${id}?role=teacher`);
  S.editingExamId=id;S.choiceCount=exam.choice_count||4;S.examType=exam.exam_type||'choice';
  S.draftQuestions=questions.map(q=>{
    let imgs=[];
    if(q.imgs_json){try{imgs=JSON.parse(q.imgs_json).map(url=>({url,file:null,filename:null}));}catch(e){}}
    else{if(q.img_url)imgs.push({url:q.img_url,file:null,filename:null});if(q.img_url2)imgs.push({url:q.img_url2,file:null,filename:null});}
    let blanks=[];if(q.blanks_json){try{const b=JSON.parse(q.blanks_json);if(Array.isArray(b))blanks=b;}catch(e){}}
    if(!blanks.length&&(q.question_type==='fill'||q.question_type==='fill_text'||q.question_type==='audio_fill')&&q.answer_key)blanks=[{label:'',answer:q.answer_key}];
    let subs=null,match=null,choiceMulti=false,choiceCorrect=[],choicePer=1;
    if(q.subs_json){try{const s=JSON.parse(q.subs_json);
      if(q.question_type==='matching')match=matchCanon(s);
      else if((q.question_type||'choice')==='choice'&&s&&s.multi){choiceMulti=true;choiceCorrect=(s.correct||[]).map(Number);choicePer=s.per||1;}
      else subs=s;
    }catch(e){}}
    const _cc=(Array.isArray(q.choices)&&q.choices.length>=2)?q.choices.length:(exam.choice_count||4);
    return{id:q.id,imgs,text:q.question_text||'',answer:q.correct_answer??0,answer_key:q.answer_key||'',blanks,grading:q.grading||'auto',
      subs,match,audio:q.audio_url?{url:q.audio_url,file:null,filename:null}:null,
      clozePer:q.question_type==='cloze'?(blanks[0]?.score??1):1,choiceCount:_cc,
      choiceMulti,choiceCorrect,choicePer,
      explanation:q.explanation||'',max_score:q.max_score??1,question_type:q.question_type||'choice',java_config_json:q.java_config_json||null};
  });
  document.getElementById('exam-modal-title').textContent='编辑考试';
  document.getElementById('modal-exam-name').value=exam.name;
  document.getElementById('modal-exam-subject').value=exam.subject;
  document.getElementById('modal-exam-desc').value=exam.description||'';
  document.getElementById('modal-choice-count').value=String(S.choiceCount);
  document.getElementById('modal-exam-type').value=S.examType;
  const _hwVal=exam.is_homework?'1':'0';
  const _hwEl=document.getElementById('modal-is-homework');if(_hwEl)_hwEl.value=_hwVal;
  document.querySelectorAll('input[name="hw-type-radio"]').forEach(r=>r.checked=r.value===_hwVal);
  const _pvEl=document.getElementById('modal-is-private');if(_pvEl)_pvEl.checked=!!exam.is_private;
  document.getElementById('modal-time-limit').value=exam.time_limit_minutes||'';
  document.getElementById('modal-student-names').value='';
  document.getElementById('modal-student-names').placeholder='留空不会影响已有学生；如需新增，请每行输入一个名字';
  populateExamUnitSelect(exam.unit_id||'');
  onExamTypeChange();updateChoicePreview();hideAlert('exam-modal-alert');renderDraftQuestions();
  document.getElementById('modal-exam').classList.add('open');
}
function closeExamModal(){document.getElementById('modal-exam').classList.remove('open');document.getElementById('modal-student-names').placeholder='每行输入一个名字，例如：\n张三\n李四\n王五';}
function onChoiceCountChange(){const old=S.choiceCount;const val=parseInt(document.getElementById('modal-choice-count').value)||4;S.choiceCount=Math.max(2,Math.min(8,val));S.draftQuestions.forEach(q=>{const qt=S.examType==='mixed'?(q.question_type||'choice'):S.examType;if(qt==='choice'&&(!q.choiceCount||q.choiceCount===old))q.choiceCount=S.choiceCount;});updateChoicePreview();renderDraftQuestions();}
function updateChoicePreview(){const n=parseInt(document.getElementById('modal-choice-count').value)||4;const el=document.getElementById('choice-count-preview');if(el)el.textContent=getLetters(n).join('、');}
function onExamTypeChange(){
  const t=document.getElementById('modal-exam-type')?.value||'choice';
  S.examType=t;
  const choiceGroup=document.getElementById('choice-count-group');
  // mixed 显示选项数量（因为可能含选择题），纯 frq/fill/fill_text 隐藏
  if(choiceGroup)choiceGroup.style.display=(t==='frq'||t==='fill'||t==='fill_text'||t==='java')?'none':'';
  renderDraftQuestions();
}

// 数学符号工具栏
const _MATH_SYMS=['π','²','³','^','√','Σ','log(','sin(','cos(','tan(','sec(','ln(','/','(, )','≤','≥','∞','e'];
const _MATH_LABELS=['π','x²','x³','xⁿ','√','Σ','log','sin','cos','tan','sec','ln','a/b','( , )','≤','≥','∞','e'];
let _lastFillEl=null;
function _mathInsert(i){
  const sym=_MATH_SYMS[i];
  const el=_lastFillEl||document.querySelector('.fill-blank-input')||document.getElementById('fill-answer-input');
  if(!el)return;
  el.focus();
  const s=el.selectionStart??el.value.length,e=el.selectionEnd??s;
  const v=el.value;
  el.value=v.substring(0,s)+sym+v.substring(e);
  try{el.setSelectionRange(s+sym.length,s+sym.length);}catch(_){}
  el.dispatchEvent(new Event('input',{bubbles:true}));
}
function _mathToolbarHtml(){
  return`<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:10px;">${_MATH_SYMS.map((s,i)=>`<button type="button" onclick="_mathInsert(${i})" onmousedown="event.preventDefault()" style="padding:2px 8px;border:1px solid var(--border-md);background:var(--surface);border-radius:4px;font-size:13px;cursor:pointer;font-family:'DM Mono',monospace;color:var(--text);line-height:1.6;">${escapeHtml(_MATH_LABELS[i])}</button>`).join('')}</div>`;
}

// 混合题型：每题题型切换回调
let _draftBlanks=[];   // 当前编辑题目的填空列表 [{label,answer,placeholder,score}]
let _draftGrading='auto';
let _draftQt='choice'; // 当前编辑题目的题型（用于填空提示文案）
let _draftChoiceCount=4; // 当前编辑题目的选项数量
let _draftSubs=[];     // audio_choice / reading 小题列表
let _draftMatch={stems:[],options:[]}; // matching 对应题
let _draftAudio=null;  // {url,file,filename} 听力音频
let _draftClozePer=1;  // cloze 每空分值
function onQTypeChange(val){
  _draftQt=val;
  const isFrq=val==='frq',isFill=val==='fill'||val==='fill_text';
  const isCloze=val==='cloze',isSubsType=val==='audio_choice'||val==='reading',isMatch=val==='matching',isAFill=val==='audio_fill';
  const isAudio=val==='audio_choice'||val==='audio_fill';
  if(isAFill)_draftGrading='auto'; // 听力填空只支持机器改
  const clozeLike=isCloze||isAFill; // 听力填空与补全单词同样用文中方括号挖空
  const choiceGroup=document.getElementById('q-choice-answer-group');
  const fillGroup=document.getElementById('q-fill-answer-group');
  const scoreGroup=document.getElementById('q-max-score-group');
  if(choiceGroup)choiceGroup.style.display=(val==='choice')?'':'none';
  if(fillGroup){
    fillGroup.style.display=isFill?'':'none';
    if(isFill){
      if(!_draftBlanks.length)_draftBlanks=[{label:'',answer:'',placeholder:'',score:1}];
      document.querySelectorAll('input[name="q-grading-radio"]').forEach(r=>r.checked=r.value===_draftGrading);
      _updateGradingHint();_renderBlanksEditor();
    }
  }
  const clozeGroup=document.getElementById('q-cloze-group');
  if(clozeGroup){
    clozeGroup.style.display=clozeLike?'':'none';
    if(clozeLike){
      const cl=document.getElementById('q-cloze-label'),ch=document.getElementById('q-cloze-hint');
      if(cl)cl.textContent=isAFill?'听力填空设置':'补全单词设置';
      if(ch)ch.innerHTML=isAFill
        ?'在上方「题目文字」中输入笔记/原文，把要学生填的单词放进方括号。例如：<br/>Erosion is more likely in soil that is <strong>[dry]</strong>.<br/>学生听音频后直接在文中空格里填写（不区分大小写，可含数字）。'
        :'在上方「题目文字」中输入整段文字，把要学生填的字母放进方括号。例如：<br/>Each ma<strong>[le]</strong> tiger estab<strong>[lishes]</strong> control ov<strong>[er]</strong> its territory.<br/>学生会看到 ma__ 样式的空格，在里面填写缺失字母。';
      const ci=document.getElementById('q-cloze-score');if(ci)ci.value=_draftClozePer;
      _renderClozeInfo();
    }
  }
  const audioGroup=document.getElementById('q-audio-group');
  if(audioGroup){audioGroup.style.display=isAudio?'':'none';if(isAudio)_renderAudioEditor();}
  const subsGroup=document.getElementById('q-subs-group');
  if(subsGroup){
    subsGroup.style.display=isSubsType?'':'none';
    if(isSubsType){
      document.getElementById('q-subs-label').textContent=val==='reading'?'阅读小题（基于左侧文章作答）':'听力小题（同一页面展示，方便学生边听边答）';
      document.getElementById('q-subs-hint').textContent=val==='reading'?'文章请填在上方「题目文字」中。小题支持选择题和 TRUE/FALSE/NOT GIVEN 判断题。':'多选题在「正确答案」中填多个字母（如 BD），每选对一项得一份分值（双选全对得 2 倍分值）。';
      document.getElementById('q-add-tfng-btn').style.display=val==='reading'?'':'none';
      if(!_draftSubs.length)_draftSubs=[{type:'choice',text:'',choices:['','','',''],correct:[0],score:1}];
      _renderSubsEditor();
    }
  }
  const matchGroup=document.getElementById('q-matching-group');
  if(matchGroup){
    matchGroup.style.display=isMatch?'':'none';
    if(isMatch){
      if(!_draftMatch.stems.length)_draftMatch.stems=['',''];
      if(!_draftMatch.options.length)_draftMatch.options=[{text:'',correct:0,score:1}];
      _renderMatchEditor();
    }
  }
  // 题目文字标签按题型变化
  const textLabel=document.getElementById('q-text-label');
  if(textLabel)textLabel.textContent=isCloze?'题目文字（必填：含 [答案] 方括号的整段文字）':isAFill?'听力笔记/原文（必填：含 [答案] 方括号）':val==='reading'?'阅读文章（必填：学生在左侧看到的文章全文）':'题目文字（可选，无图时显示）';
  // 自动评分题型（填空/英语题型）分值按空/小题求和，整题分值隐藏
  const autoScored=(isFill&&_draftGrading==='auto')||isAFill||isCloze||isSubsType||isMatch;
  if(scoreGroup)scoreGroup.style.display=autoScored?'none':'';
}
// 语言类科目（外语/语言与文学/英语）判断
function _isLangSubject(s){return /语言|文学|外语|英|language|literature|foreign|english/i.test(String(s||''));}
// 选择题：根据当前选项数渲染「正确答案」下拉
function _renderQChoiceAnswer(selectedIdx){
  const sel=document.getElementById('q-correct-answer');if(!sel)return;
  const letters=getLetters(_draftChoiceCount);
  const cur=Math.min(Math.max(parseInt(selectedIdx)||0,0),letters.length-1);
  sel.innerHTML=letters.map((l,i)=>`<option value="${i}" ${cur===i?'selected':''}>${l}</option>`).join('');
  const hint=document.getElementById('q-choice-count-hint');
  if(hint)hint.textContent=`本题选项：${letters.join('、')}`;
}
// 选项数量输入变化
function onQChoiceCountChange(val){
  _draftChoiceCount=Math.max(2,Math.min(8,parseInt(val)||4));
  const sel=document.getElementById('q-correct-answer');
  _renderQChoiceAnswer(sel?sel.value:0);
  if(_draftChoiceMulti){_draftChoiceCorrect=_draftChoiceCorrect.filter(i=>i<_draftChoiceCount);_renderChoiceMultiBoxes();}
}
// ── 多选选择题编辑 ──
let _draftChoiceMulti=false, _draftChoiceCorrect=[], _draftChoicePer=1;
function onChoiceMultiToggle(on){
  _draftChoiceMulti=!!on;
  const single=document.getElementById('q-choice-single-wrap'),multiWrap=document.getElementById('q-choice-multi-wrap');
  if(single)single.style.display=on?'none':'';
  if(multiWrap)multiWrap.style.display=on?'':'none';
  // 多选时分值由「每个正确选项分值 × 正确项数」自动算出，隐藏底部「本题分值」避免混淆
  const scoreGroup=document.getElementById('q-max-score-group');
  if(scoreGroup&&(_draftQt==='choice'))scoreGroup.style.display=on?'none':'';
  if(on){const per=document.getElementById('q-choice-multi-per');if(per)per.value=_draftChoicePer;_renderChoiceMultiBoxes();}
}
function onChoiceMultiPerChange(val){_draftChoicePer=Math.max(1,parseInt(val)||1);_renderChoiceMultiBoxes();}
function toggleChoiceMultiCorrect(i){
  if(_draftChoiceCorrect.includes(i))_draftChoiceCorrect=_draftChoiceCorrect.filter(x=>x!==i);
  else _draftChoiceCorrect.push(i);
  _draftChoiceCorrect.sort((a,b)=>a-b);_renderChoiceMultiBoxes();
}
function _renderChoiceMultiBoxes(){
  const box=document.getElementById('q-choice-multi-boxes');if(!box)return;
  const letters=getLetters(_draftChoiceCount);
  box.innerHTML=letters.map((l,i)=>{const on=_draftChoiceCorrect.includes(i);
    return`<button type="button" onclick="toggleChoiceMultiCorrect(${i})" style="min-width:44px;padding:8px 12px;border-radius:8px;border:1.5px solid ${on?'var(--green)':'var(--border-md)'};background:${on?'var(--green-light)':'var(--surface)'};color:${on?'var(--green)':'var(--text)'};font-weight:700;font-size:14px;cursor:pointer;">${on?'✓ ':''}${l}</button>`;}).join('');
  const hint=document.getElementById('q-choice-multi-hint');
  const n=_draftChoiceCorrect.length;
  if(hint)hint.textContent=n?`需选 ${n} 项 · 本题总分 ${n*_draftChoicePer} 分（每对一项 ${_draftChoicePer} 分）`:'请至少勾选一个正确选项';
}
// 题型选项按科目过滤：语言类科目显示全部题型，其他科目只显示选择/填空/问答
function _filterQTypeRadios(){
  const subject=(document.getElementById('modal-exam-subject')?.value||'').trim();
  const isLanguage=_isLangSubject(subject);
  document.querySelectorAll('#q-type-select-group .qt-eng').forEach(l=>{l.style.display=isLanguage?'flex':'none';});
  return isLanguage;
}
// ── 英语题型编辑器 ──
function _renderClozeInfo(){
  const el=document.getElementById('q-cloze-info');if(!el)return;
  const txt=document.getElementById('q-text-input')?.value||'';
  const n=clozeSegs(txt).filter(s=>s.t==='blank').length;
  el.innerHTML=n?`已识别 <strong style="color:var(--blue);">${n}</strong> 个空 · 本题总分 <strong style="color:var(--blue);">${n*_draftClozePer} 分</strong>`:'<span style="color:var(--amber);">尚未识别到方括号空格</span>';
}
function handleQAudioUpload(event){
  const f=event.target.files[0];if(!f)return;
  if(f.size>50*1024*1024){toast('音频文件不能超过 50MB');event.target.value='';return;}
  _draftAudio={url:URL.createObjectURL(f),file:f,filename:f.name};
  _renderAudioEditor();event.target.value='';
}
function removeQAudio(){_draftAudio=null;_renderAudioEditor();}
function _renderAudioEditor(){
  const el=document.getElementById('q-audio-current');if(!el)return;
  if(!_draftAudio){el.innerHTML='<span style="font-size:12px;color:var(--text3);">还未上传音频</span>';return;}
  el.innerHTML=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;">
    <span style="font-size:13px;">🎧 ${escapeHtml(_draftAudio.filename||'已上传音频')}${_draftAudio.file?'<span class="badge badge-amber" style="font-size:10px;margin-left:6px;">待上传</span>':''}</span>
    <audio controls preload="none" src="${_draftAudio.url}" style="height:32px;max-width:240px;"></audio>
    <button class="btn btn-sm btn-danger" onclick="removeQAudio()" style="padding:3px 8px;">✕ 移除</button>
  </div>`;
}
function addSubQ(type){
  _draftSubs.push(type==='tfng'?{type:'tfng',text:'',correct:0,score:1}:{type:'choice',text:'',choices:['','','',''],correct:[0],score:1});
  _renderSubsEditor();
}
function removeSubQ(i){_draftSubs.splice(i,1);_renderSubsEditor();}
function _subSetCorrect(i,val){
  const s=_draftSubs[i];
  const idxs=[...new Set([...String(val).toUpperCase()].map(ch=>ch.charCodeAt(0)-65).filter(n=>n>=0&&n<(s.choices||[]).length))].sort((a,b)=>a-b);
  s.correct=idxs.length?idxs:[0];
}
function _subAddChoice(i){if((_draftSubs[i].choices||[]).length>=6)return;_draftSubs[i].choices.push('');_renderSubsEditor();}
function _subRemoveChoice(i,ci){
  const s=_draftSubs[i];if(s.choices.length<=2)return;
  s.choices.splice(ci,1);
  s.correct=(s.correct||[]).filter(c=>c<s.choices.length);if(!s.correct.length)s.correct=[0];
  _renderSubsEditor();
}
// 小题满分：多选 = 正确项数 × 每项分值；单选/判断 = 分值
function _subMaxScore(s){
  const per=parseInt(s.score)||1;
  if(s.type!=='tfng'&&Array.isArray(s.correct)&&s.correct.length>1)return s.correct.length*per;
  return per;
}
function _renderSubsEditor(){
  const cont=document.getElementById('q-subs-list');if(!cont)return;
  const totalPts=_draftSubs.reduce((s,x)=>s+_subMaxScore(x),0);
  cont.innerHTML=`<div style="font-size:12px;color:var(--text3);margin-bottom:6px;">共 ${_draftSubs.length} 小题 · 本题总分 = <strong style="color:var(--blue);">${totalPts} 分</strong>（多选题 = 正确项数 × 每项分值，每选对一项得分）</div>`+
  _draftSubs.map((s,i)=>{
    const head=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="font-size:12px;font-weight:700;color:var(--text2);">小题 ${i+1}</span>
      <span class="badge ${s.type==='tfng'?'badge-amber':'badge-blue'}" style="font-size:9px;">${s.type==='tfng'?'判断 T/F/NG':'选择'}</span>
      <span style="flex:1;"></span>
      <span style="font-size:12px;color:var(--text3);">${s.type!=='tfng'&&Array.isArray(s.correct)&&s.correct.length>1?'每项分':'分值'}</span>
      <input class="form-input" type="number" min="1" max="100" value="${s.score??1}" style="width:56px;font-size:13px;text-align:center;" oninput="_draftSubs[${i}].score=parseInt(this.value)||1" onchange="_renderSubsEditor()" />
      <button class="btn btn-sm btn-danger" onclick="removeSubQ(${i})" style="padding:3px 8px;">✕</button>
    </div>`;
    const textArea=`<textarea class="form-input" rows="2" placeholder="小题题干…" style="font-size:13px;margin-bottom:6px;" oninput="_draftSubs[${i}].text=this.value">${escapeHtml(s.text||'')}</textarea>`;
    let body='';
    if(s.type==='tfng'){
      body=`<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--text3);">正确答案</span>
        <select class="form-input" style="width:160px;font-size:13px;" onchange="_draftSubs[${i}].correct=parseInt(this.value)">
          ${TFNG.map((t,ti)=>`<option value="${ti}" ${Number(s.correct)===ti?'selected':''}>${t}</option>`).join('')}
        </select></div>`;
    } else{
      const corLetters=(Array.isArray(s.correct)?s.correct:[s.correct||0]).map(c=>String.fromCharCode(65+c)).join('');
      body=(s.choices||[]).map((c,ci)=>`<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
          <span style="font-size:12px;font-weight:700;color:var(--text3);min-width:18px;">${String.fromCharCode(65+ci)}</span>
          <input class="form-input" value="${escapeHtml(c||'')}" placeholder="选项内容…" style="flex:1;font-size:13px;" oninput="_draftSubs[${i}].choices[${ci}]=this.value" />
          ${(s.choices||[]).length>2?`<button class="btn btn-sm" onclick="_subRemoveChoice(${i},${ci})" style="padding:3px 8px;color:var(--text3);">✕</button>`:''}
        </div>`).join('')+
        `<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
          ${(s.choices||[]).length<6?`<button class="btn btn-sm" onclick="_subAddChoice(${i})" style="font-size:12px;">＋ 选项</button>`:''}
          <span style="font-size:12px;color:var(--text3);">正确答案（多选填多个字母如 BD）</span>
          <input class="form-input" value="${corLetters}" placeholder="如 B 或 BD" style="width:90px;font-size:13px;text-transform:uppercase;" oninput="_subSetCorrect(${i},this.value)" onchange="_renderSubsEditor()" />
        </div>`;
    }
    return`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px;">${head}${textArea}${body}</div>`;
  }).join('');
}
function addMatchOption(){if(_draftMatch.options.length>=26)return;_draftMatch.options.push({text:'',correct:0,score:1});_renderMatchEditor();}
function removeMatchOption(i){
  if(_draftMatch.options.length<=1)return;
  _draftMatch.options.splice(i,1);
  _renderMatchEditor();
}
function addMatchStem(){if(_draftMatch.stems.length>=26)return;_draftMatch.stems.push('');_renderMatchEditor();}
function removeMatchStem(i){
  if(_draftMatch.stems.length<=2)return;
  _draftMatch.stems.splice(i,1);
  _draftMatch.options.forEach(o=>{if(o.correct>=_draftMatch.stems.length)o.correct=0;});
  _renderMatchEditor();
}
function _renderMatchEditor(){
  const sc=document.getElementById('q-match-stems'),oc=document.getElementById('q-match-options');
  if(!oc||!sc)return;
  // 描述条目：字母 A..n 的参考内容（可被多个选项对应、可比选项少）
  sc.innerHTML=_draftMatch.stems.map((st,i)=>`<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
    <span style="font-size:12px;font-weight:700;color:var(--text3);min-width:22px;">${String.fromCharCode(65+i)}</span>
    <input class="form-input" value="${escapeHtml(typeof st==='string'?st:(st.text||''))}" placeholder="描述内容，如：James Paul Gee" style="flex:1;font-size:13px;" oninput="_draftMatch.stems[${i}]=this.value" />
    ${_draftMatch.stems.length>2?`<button class="btn btn-sm" onclick="removeMatchStem(${i})" style="padding:3px 8px;color:var(--text3);">✕</button>`:''}
  </div>`).join('');
  const totalPts=_draftMatch.options.reduce((s,o)=>s+(parseInt(o.score)||1),0);
  oc.innerHTML=`<div style="font-size:12px;color:var(--text3);margin-bottom:6px;">本题总分 = <strong style="color:var(--blue);">${totalPts} 分</strong> · 每个条目从描述列表中选对应字母</div>`+
  _draftMatch.options.map((o,i)=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:6px;">
    <div style="display:flex;gap:6px;align-items:flex-start;">
      <span style="font-size:12px;font-weight:700;color:var(--text3);min-width:22px;padding-top:8px;">${i+1}.</span>
      <textarea class="form-input" rows="2" placeholder="题目条目内容…" style="flex:1;font-size:13px;" oninput="_draftMatch.options[${i}].text=this.value">${escapeHtml(o.text||'')}</textarea>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <select class="form-input" title="对应的描述字母" style="width:80px;font-size:13px;" onchange="_draftMatch.options[${i}].correct=parseInt(this.value)">
          ${_draftMatch.stems.map((_,si)=>`<option value="${si}" ${Number(o.correct)===si?'selected':''}>对应 ${String.fromCharCode(65+si)}</option>`).join('')}
        </select>
        <input class="form-input" type="number" min="1" max="100" value="${o.score??1}" title="分值" style="width:80px;font-size:12px;text-align:center;" oninput="_draftMatch.options[${i}].score=parseInt(this.value)||1" />
      </div>
      ${_draftMatch.options.length>1?`<button class="btn btn-sm btn-danger" onclick="removeMatchOption(${i})" style="padding:3px 8px;margin-top:6px;">✕</button>`:''}
    </div>
  </div>`).join('');
}
function onGradingChange(val){
  _draftGrading=val;_updateGradingHint();_renderBlanksEditor();
  const scoreGroup=document.getElementById('q-max-score-group');
  if(scoreGroup)scoreGroup.style.display=val==='auto'?'none':'';
}
function _updateGradingHint(){
  const hint=document.getElementById('q-grading-hint');if(!hint)return;
  if(_draftQt==='audio_fill'){hint.textContent='听力填空：学生听音频后填写，自动判分，不区分大小写（可含数字）。';return;}
  if(_draftGrading==='manual')hint.textContent='人工改：学生可输入任意文字（坐标、不等式、公式等），提交后由老师批改打分，此处答案作为参考答案展示给老师。';
  else hint.textContent=_draftQt==='fill_text'?'机器改：学生只能输入英文字母，不区分大小写，每个空与答案一致才算对。':'机器改：学生只能输入数字（支持小数、分数如 1/3、负数），每个空与答案相等才算对。';
}
function _renderBlanksEditor(){
  const cont=document.getElementById('q-blanks-list');if(!cont)return;
  const ansPhText=_draftGrading==='manual'?'参考答案，如：y < 6x - 27/4 - x²':(_draftQt==='fill_text'||_draftQt==='audio_fill')?'如：paris':'如：42、3.14 或 1/3';
  const autoScore=_draftGrading==='auto';
  const totalPts=autoScore?_draftBlanks.reduce((s,b)=>s+(parseInt(b.score)||1),0):null;
  cont.innerHTML=(autoScore&&totalPts!==null?`<div style="font-size:12px;color:var(--text3);margin-bottom:6px;">各空分值之和 = <strong style="color:var(--blue);">${totalPts} 分</strong></div>`:'')+
  _draftBlanks.map((b,i)=>`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:8px;">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <span style="font-size:12px;color:var(--text3);font-weight:600;min-width:32px;">空${i+1}</span>
        <input class="form-input" value="${escapeHtml(b.answer||'')}" placeholder="${ansPhText}" style="flex:1;font-size:13px;" oninput="_draftBlanks[${i}].answer=this.value" />
        ${autoScore?`<input class="form-input" type="number" min="0" max="100" value="${b.score??1}" title="此空分值" style="width:56px;font-size:13px;text-align:center;" oninput="_draftBlanks[${i}].score=parseInt(this.value)||1;_renderBlanksEditor();" /> <span style="font-size:12px;color:var(--text3);">分</span>`:''}
        ${_draftBlanks.length>1?`<button class="btn btn-sm btn-danger" onclick="removeBlankRow(${i})" style="padding:4px 8px;">✕</button>`:''}
      </div>
      <div style="display:flex;gap:6px;">
        <input class="form-input" value="${escapeHtml(b.label||'')}" placeholder="标签（可选），如：x坐标 / P =" style="flex:1;font-size:12px;" oninput="_draftBlanks[${i}].label=this.value" />
        <input class="form-input" value="${escapeHtml(b.placeholder||'')}" placeholder="提示文字（可选），显示在学生输入框内" style="flex:1;font-size:12px;" oninput="_draftBlanks[${i}].placeholder=this.value" />
      </div>
    </div>`).join('');
}
function addBlankRow(){_draftBlanks.push({label:'',answer:''});_renderBlanksEditor();}
function removeBlankRow(i){_draftBlanks.splice(i,1);_renderBlanksEditor();}

async function saveExam(){
  const name=document.getElementById('modal-exam-name').value.trim();
  const subject=document.getElementById('modal-exam-subject').value.trim();
  const description=document.getElementById('modal-exam-desc').value.trim();
  const choiceCount=Math.max(2,Math.min(8,parseInt(document.getElementById('modal-choice-count').value)||4));
  const examType=document.getElementById('modal-exam-type').value||'choice';
  const isFrq=examType==='frq',isFill=examType==='fill',isFillText=examType==='fill_text',isMixed=examType==='mixed',isJava=examType==='java';
  const isPrivate=!!document.getElementById('modal-is-private')?.checked;
  const timeLimitRaw=document.getElementById('modal-time-limit').value.trim();
  const timeLimit=timeLimitRaw?parseInt(timeLimitRaw):null;
  const namesRaw=document.getElementById('modal-student-names').value;
  const unitId=document.getElementById('modal-exam-unit')?.value||null;
  hideAlert('exam-modal-alert');
  if(!name){showAlert('exam-modal-alert','请输入考试名称');return;}
  if(!subject){showAlert('exam-modal-alert','请输入科目');return;}
  // 填空题校验（支持多空 + 机器/人工改）
  const _getBlanks=q=>{
    let bs=(q.blanks&&q.blanks.length)?q.blanks:((q.answer_key??'').toString().trim()!==''?[{label:'',answer:q.answer_key}]:[]);
    return bs.map(b=>({label:(b.label||'').trim(),answer:(b.answer??'').toString().trim(),placeholder:(b.placeholder||'').trim(),score:parseInt(b.score)||1}));
  };
  const _isNumLike=s=>{s=String(s).replace(/,/g,'').trim();if(s.includes('/')){const p=s.split('/');return p.length===2&&!isNaN(parseFloat(p[0]))&&!isNaN(parseFloat(p[1]));}return s!==''&&!isNaN(parseFloat(s));};
  for(let i=0;i<S.draftQuestions.length;i++){
    const q=S.draftQuestions[i];
    const qt=isMixed?(q.question_type||'choice'):(isFill?'fill':isFillText?'fill_text':null);
    if((qt==='audio_choice'||qt==='audio_fill')&&!q.audio){showAlert('exam-modal-alert',`第 ${i+1} 题（听力）：需要上传音频`);return;}
    if(qt==='cloze'||qt==='audio_fill'){
      if(!clozeSegs(q.text||'').some(s=>s.t==='blank'&&s.ans)){showAlert('exam-modal-alert',`第 ${i+1} 题（${qt==='cloze'?'补全单词':'听力填空'}）：题目文字中需要用 [答案] 标记空格`);return;}
      continue;
    }
    if(qt!=='fill'&&qt!=='fill_text')continue;
    const bs=_getBlanks(q);
    if(!bs.length||bs.some(b=>b.answer==='')){showAlert('exam-modal-alert',`第 ${i+1} 题：每个填空都需要填写正确答案`);return;}
    if(qt==='fill'&&(q.grading||'auto')==='auto'&&bs.some(b=>!_isNumLike(b.answer))){showAlert('exam-modal-alert',`第 ${i+1} 题（填空数字·机器改）的答案必须是数字；含公式请改为「人工改」`);return;}
  }
  const allNames=namesRaw.split('\n').map(n=>n.trim()).filter(Boolean);
  const btn=document.getElementById('save-exam-btn');btn.disabled=true;
  document.getElementById('save-exam-text').textContent='上传图片中…';
  try{
    for(let i=0;i<S.draftQuestions.length;i++){
      const q=S.draftQuestions[i];if(!q.imgs)q.imgs=[];
      for(let j=0;j<q.imgs.length;j++){
        if(q.imgs[j].file){
          document.getElementById('save-exam-text').textContent=`上传图片 Q${i+1} (${j+1}/${q.imgs.length})…`;
          const url=await uploadImageToStorage(q.imgs[j].file);
          S.draftQuestions[i].imgs[j]={url,file:null,filename:q.imgs[j].filename};
        }
      }
      if(q.audio&&q.audio.file){
        document.getElementById('save-exam-text').textContent=`上传音频 Q${i+1}…`;
        const url=await uploadImageToStorage(q.audio.file);
        S.draftQuestions[i].audio={url,file:null,filename:q.audio.filename};
      }
    }
    document.getElementById('save-exam-text').textContent='保存中…';
    let examId=S.editingExamId;
    if(examId){
      const isHw=document.getElementById('modal-is-homework')?.value==='1';
      await api('PUT',`/api/exams/${examId}`,{name,subject,description,choice_count:choiceCount,time_limit_minutes:timeLimit,exam_type:examType,is_homework:isHw?1:0,is_private:isPrivate?1:0,unit_id:unitId});
      if(allNames.length){
        const existingKeys=await api('GET',`/api/student-keys/${examId}`);
        const existingNames=new Set(existingKeys.map(s=>s.student_name));
        const newNames=allNames.filter(n=>!existingNames.has(n));
        if(newNames.length){
          const existingMap=await api('POST','/api/student-keys/lookup-names',{names:newNames});
          const needNewKey=newNames.filter(n=>!existingMap[n]);
          const newKeys=needNewKey.length?await genUniqueKeys(needNewKey.length):[];
          const keyMap={...existingMap};needNewKey.forEach((n,i)=>{keyMap[n]=newKeys[i];});
          await api('POST','/api/student-keys',{keys:newNames.map(n=>({exam_id:examId,student_name:n,student_key:keyMap[n]}))});
        }
      }
    } else{
      const isHw2=document.getElementById('modal-is-homework')?.value==='1';
      const result=await api('POST','/api/exams',{name,subject,description,choice_count:choiceCount,time_limit_minutes:timeLimit,teacher_id:S.teacher.id,exam_type:examType,is_homework:isHw2?1:0,is_private:isPrivate?1:0,unit_id:unitId});
      examId=result.id;
      if(allNames.length){
        const existingMap=await api('POST','/api/student-keys/lookup-names',{names:allNames});
        const needNewKey=allNames.filter(n=>!existingMap[n]);
        const newKeys=needNewKey.length?await genUniqueKeys(needNewKey.length):[];
        const keyMap={...existingMap};needNewKey.forEach((n,i)=>{keyMap[n]=newKeys[i];});
        await api('POST','/api/student-keys',{keys:allNames.map(n=>({exam_id:examId,student_name:n,student_key:keyMap[n]}))});
      }
    }
    await api('POST',`/api/questions/${examId}`,{questions:S.draftQuestions.map((q,i)=>{
      let qt,choices,correctAnswer,answerKey,blanksJson=null,grading='auto',subsJson=null;
      if(isMixed)qt=q.question_type||'choice';
      else qt=isFrq?'frq':isFill?'fill':isFillText?'fill_text':isJava?'java':'choice';
      if(qt==='fill'||qt==='fill_text'){
        choices=[];correctAnswer=0;grading=q.grading||'auto';
        const bs=_getBlanks(q).map(b=>({...b,answer:qt==='fill_text'&&grading==='auto'?b.answer.toLowerCase():b.answer}));
        blanksJson=JSON.stringify(bs);
        answerKey=bs[0]?.answer??'';
      } else if(qt==='cloze'||qt==='audio_fill'){
        choices=[];correctAnswer=0;answerKey=null;
        const segs=clozeSegs(q.text||'').filter(s=>s.t==='blank'&&s.ans);
        blanksJson=JSON.stringify(segs.map(s=>({label:'',answer:s.ans.toLowerCase(),placeholder:'',score:q.clozePer??1})));
      } else if(qt==='audio_choice'||qt==='reading'){
        choices=[];correctAnswer=0;answerKey=null;subsJson=JSON.stringify(q.subs||[]);
      } else if(qt==='matching'){
        choices=[];correctAnswer=0;answerKey=null;subsJson=JSON.stringify(q.match||{stems:[],options:[]});
      } else if(qt==='frq'){choices=[];correctAnswer=0;answerKey=null;}
      else{const _cc=Math.max(2,Math.min(8,q.choiceCount||choiceCount));choices=getLetters(_cc);answerKey=null;
        if(q.choiceMulti&&(q.choiceCorrect||[]).length){const cor=q.choiceCorrect.filter(i=>i<_cc);subsJson=JSON.stringify({multi:true,correct:cor,per:q.choicePer||1});correctAnswer=cor[0]??0;}
        else correctAnswer=Math.min(q.answer??0,_cc-1);}
      return{order_idx:i,imgs_json:JSON.stringify((q.imgs||[]).map(im=>im.url).filter(Boolean)),
        img_url:(q.imgs||[])[0]?.url||null,img_url2:(q.imgs||[])[1]?.url||null,
        question_text:q.text||null,choices,correct_answer:correctAnswer,answer_key:answerKey,
        blanks_json:blanksJson,grading,subs_json:subsJson,audio_url:q.audio?.url||null,
        explanation:q.explanation||null,question_type:qt,max_score:q.max_score??1,java_config_json:q.java_config_json||null};
    })});
    closeExamModal();renderExamList();toast('考试已保存 ✓');
  } catch(err){showAlert('exam-modal-alert','保存失败：'+err.message);}
  finally{btn.disabled=false;document.getElementById('save-exam-text').textContent='保存考试';}
}

async function renderRecords(){
  const statsCont=document.getElementById('records-stats'),listCont=document.getElementById('records-container');
  const filterSubject=document.getElementById('records-filter-subject')?.value||'';
  const filterExam=document.getElementById('records-filter-exam')?.value||'';
  if(!statsCont||!listCont)return;
  listCont.innerHTML='<div style="color:var(--text2);font-size:13px;padding:16px 0;">⏳ 加载中…</div>';
  const canViewProgram=S.teacher.role==='super_admin'||S.teacher.role==='program_admin';
  let exams=canViewProgram?await api('GET','/api/exams/all'):await api('GET','/api/exams');
  exams=exams.filter(e=>!e.is_readonly);
  const examFilter=document.getElementById('records-filter-exam');
  if(examFilter){const cur=examFilter.value;examFilter.innerHTML='<option value="">全部考试</option>'+exams.map(e=>`<option value="${e.id}" ${cur===e.id?'selected':''}>${e.name}</option>`).join('');}
  if(filterSubject)exams=exams.filter(e=>e.subject===filterSubject);
  if(filterExam)exams=exams.filter(e=>e.id===filterExam);
  if(!exams.length){statsCont.innerHTML='';listCont.innerHTML='<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">暂无成绩数据</div></div>';return;}
  let allRecs=[];
  await Promise.all(exams.map(async e=>{
    const recs=await api('GET','/api/records',{exam_id:e.id});
    recs.forEach(r=>{r._examName=e.name;r._examSubject=e.subject;r._isFrq=e.exam_type==='frq';});
    allRecs=allRecs.concat(recs);
  }));
  if(!allRecs.length){statsCont.innerHTML='';listCont.innerHTML='<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">暂无学生提交</div></div>';return;}
  allRecs.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  const avg=allRecs.reduce((s,r)=>s+r.score/r.total*100,0)/allRecs.length;
  const best=Math.max(...allRecs.map(r=>r.score/r.total*100));
  statsCont.innerHTML=`
    <div class="stat-card"><div class="stat-val">${allRecs.length}</div><div class="stat-label">提交总数</div></div>
    <div class="stat-card"><div class="stat-val">${Math.round(avg)}%</div><div class="stat-label">平均正确率</div></div>
    <div class="stat-card"><div class="stat-val">${Math.round(best)}%</div><div class="stat-label">最高分</div></div>
    <div class="stat-card"><div class="stat-val">${exams.length}</div><div class="stat-label">考试场次</div></div>`;
  listCont.innerHTML=`<div class="table-wrap"><table>
    <thead><tr><th>学生姓名</th><th>考试</th><th>科目</th><th>成绩</th><th>正确率</th><th>切屏</th><th>提交时间</th><th>用时</th></tr></thead>
    <tbody>${allRecs.map(r=>{
      const pct=Math.round(r.score/r.total*100);const{bg,fg}=scoreColor(pct);const sw=r.tab_switches||0;
      return`<tr>
        <td style="font-weight:500;">${r.student_name}</td>
        <td style="font-size:13px;color:var(--text2);">${r._examName}</td>
        <td><span class="badge badge-blue" style="font-size:10px;">${r._examSubject||'—'}</span></td>
        <td>${r._isFrq?'<span class="badge badge-amber">FRQ</span>':`<span class="score-ring" style="background:${bg};color:${fg};">${r.score}/${r.total}</span>`}</td>
        <td><div class="flex gap-2">${r._isFrq?'<span style="font-size:12px;color:var(--text3);">待批改</span>':`<div class="progress" style="width:60px;flex-shrink:0;"><div class="progress-bar" style="width:${pct}%;background:${pct>=80?'var(--green)':pct>=60?'var(--amber)':'var(--red)'};"></div></div><span style="font-size:13px;color:var(--text2);">${pct}%</span>`}</div></td>
        <td style="color:${sw>=3?'var(--red)':sw>0?'var(--amber)':'var(--text2)'};">${sw>0?'⚠ '+sw:'0'}</td>
        <td style="color:var(--text2);font-size:12px;">${r.created_at||'—'}</td>
        <td style="color:var(--text2);font-size:12px;">${fmtDur(r.duration_seconds)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// ── 草稿题目渲染 ──────────────────────────────────────────
function renderDraftQuestions(){
  const cont=document.getElementById('modal-question-list');
  const isFrq=S.examType==='frq',isFill=S.examType==='fill',isFillText=S.examType==='fill_text',isMixed=S.examType==='mixed';
  const letters=getLetters(S.choiceCount);
  document.getElementById('modal-q-count').textContent=`(${S.draftQuestions.length} 题)`;
  if(!S.draftQuestions.length){cont.innerHTML=`<div style="color:var(--text3);font-size:13px;padding:12px 0 4px;">还没有题目，点击「＋ 添加题目」逐题编辑，或「批量上传图片」批量添加</div>`;return;}
  cont.innerHTML=S.draftQuestions.map((q,i)=>{
    const imgs=q.imgs||[];const hasImg=imgs.length>0,hasText=q.text&&q.text.trim();
    const preview=hasText?`<span style="font-size:11px;color:var(--text2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.text.slice(0,40)}${q.text.length>40?'…':''}</span>`:'';
    const qt=isMixed?(q.question_type||'choice'):(isFrq?'frq':isFill?'fill':isFillText?'fill_text':'choice');
    const _fillDesc=()=>{const n=(q.blanks||[]).length;const base=n>1?`${n}空`:(q.answer_key||'?');const g=(q.grading||'auto')==='manual'?' ✍️人工':'';return base+g;};
    const _engDesc=()=>{
      if(qt==='cloze'||qt==='audio_fill'){const n=clozeSegs(q.text||'').filter(s=>s.t==='blank').length;return`${n}空·${q.max_score??1}分`;}
      if(qt==='matching')return`${(q.match?.options||[]).length}项·${q.max_score??1}分`;
      return`${(q.subs||[]).length}小题·${q.max_score??1}分`;
    };
    const _qcc=Math.max(2,Math.min(8,q.choiceCount||S.choiceCount||4));const _qLet=getLetters(_qcc);
    const _choiceBadge=q.choiceMulti&&(q.choiceCorrect||[]).length?`${_qcc}选·多选 ${q.choiceCorrect.map(c=>_qLet[c]).join('')}·${q.max_score??1}分`:`${_qcc}选·答案 ${_qLet[q.answer]??'?'}`;
    const answerBadge=qt==='fill'?`<span class="badge badge-blue" style="font-size:10px;">填空数字·${_fillDesc()}</span>`:qt==='fill_text'?`<span class="badge badge-blue" style="font-size:10px;">填空文字·${_fillDesc()}</span>`:qt==='frq'?`<span class="badge badge-amber" style="font-size:10px;">FRQ·${q.max_score??1}分</span>`:ENG_QTS.includes(qt)?`<span class="badge badge-blue" style="font-size:10px;">${_qtLabel(qt)}·${_engDesc()}</span>`:`<span class="badge badge-gray" style="font-size:10px;">${_choiceBadge}</span>`;
    const mixedTypeBadge=isMixed?`<span class="badge ${qt==='frq'?'badge-amber':(qt==='fill'||qt==='fill_text'||ENG_QTS.includes(qt))?'badge-blue':'badge-gray'}" style="font-size:9px;">${qt==='frq'?'FRQ':qt==='fill'?'填空（数）':qt==='fill_text'?'填空（文）':ENG_QTS.includes(qt)?_qtLabel(qt):'MCQ'}</span>`:'';
    return`<div class="q-row"><div class="q-row-left">
      <span style="font-weight:600;color:var(--text2);font-size:12px;min-width:28px;">Q${i+1}</span>
      ${hasImg?`<img src="${imgs[0].url}" loading="lazy" onclick="event.stopPropagation();showQImg(${i},0)" title="点击看大图" style="width:42px;height:32px;object-fit:cover;border-radius:5px;border:1px solid var(--border);cursor:zoom-in;flex-shrink:0;background:#faf9f7;" />${imgs.length>1?`<span class="badge badge-blue" style="font-size:10px;">共${imgs.length}张</span>`:''}`:'<span class="badge badge-gray" style="font-size:10px;">文字</span>'}
      ${imgs.some(im=>im.file)?'<span class="badge badge-amber" style="font-size:10px;">待上传</span>':''}
      ${mixedTypeBadge}${answerBadge}
      ${preview}${q.explanation?`<span style="font-size:11px;color:var(--text3);">解析✓</span>`:''}
    </div><div class="flex gap-1">
      <button class="btn btn-sm btn-ghost" onclick="openEditQuestion(${i})">编辑</button>
      <button class="btn btn-sm btn-danger" onclick="deleteDraftQuestion(${i})">删除</button>
    </div></div>`;
  }).join('');
}
function deleteDraftQuestion(i){S.draftQuestions.splice(i,1);renderDraftQuestions();}

function handleBulkUpload(event){
  const files=Array.from(event.target.files);if(!files.length)return;
  if(files.length>10){toast('⚠ 一次最多上传 10 张图片，请分批上传');event.target.value='';return;}
  files.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  const defaultQt=S.examType==='mixed'?'choice':S.examType;
  files.forEach(file=>S.draftQuestions.push({imgs:[{url:URL.createObjectURL(file),file,filename:file.name}],text:'',answer:0,answer_key:'',explanation:'',max_score:1,choiceCount:S.choiceCount,question_type:defaultQt}));
  renderDraftQuestions();toast(`已添加 ${files.length} 道题，保存时自动上传图片 ✓`);event.target.value='';
}
function addTextQuestion(){
  const defaultQt=S.examType==='mixed'?'choice':S.examType;
  S.draftQuestions.push({imgs:[],text:'',answer:0,answer_key:'',explanation:'',max_score:1,choiceCount:S.choiceCount,question_type:defaultQt});
  renderDraftQuestions();openEditQuestion(S.draftQuestions.length-1);
}

function openEditQuestion(idx){
  const q=S.draftQuestions[idx];S.editingQIdx=idx;
  S.draftQImgs=(q.imgs||[]).map(im=>({...im}));
  const isFrq=S.examType==='frq',isFill=S.examType==='fill',isFillText=S.examType==='fill_text',isMixed=S.examType==='mixed';
  const qt=isMixed?(q.question_type||'choice'):(isFrq?'frq':isFill?'fill':isFillText?'fill_text':'choice');
  document.getElementById('q-modal-title').textContent=`编辑 Q${idx+1}${isMixed?` (${_qtLabel(qt)})`:isFrq?' (FRQ)':isFill?' (填空（数字）)':isFillText?' (填空（文字）)':''}`;
  document.getElementById('q-explanation-input').value=q.explanation||'';
  document.getElementById('q-text-input').value=q.text||'';
  // 混合题型选择器
  const typeSelectGroup=document.getElementById('q-type-select-group');
  if(typeSelectGroup){
    typeSelectGroup.style.display=isMixed?'':'none';
    if(isMixed){
      _filterQTypeRadios();
      document.querySelectorAll('input[name="q-type-radio"]').forEach(r=>{r.checked=r.value===qt;});
    }
  }
  // 选择题答案（每题可单独设选项数 + 多选）
  _draftChoiceCount=Math.max(2,Math.min(8,q.choiceCount||S.choiceCount||4));
  _draftChoiceMulti=!!q.choiceMulti;
  _draftChoiceCorrect=Array.isArray(q.choiceCorrect)?q.choiceCorrect.slice():[];
  _draftChoicePer=q.choicePer||1;
  const choiceGroup=document.getElementById('q-choice-answer-group');
  const ccInput=document.getElementById('q-choice-count');
  if(ccInput)ccInput.value=String(_draftChoiceCount);
  const multiChk=document.getElementById('q-choice-multi');if(multiChk)multiChk.checked=_draftChoiceMulti;
  if(choiceGroup)choiceGroup.style.display=(qt==='frq'||qt==='fill'||qt==='fill_text')?'none':'';
  _renderQChoiceAnswer(q.answer??0);
  onChoiceMultiToggle(_draftChoiceMulti);
  // 填空答案（多空）
  _draftBlanks=(q.blanks&&q.blanks.length)?q.blanks.map(b=>({label:b.label||'',answer:b.answer||'',placeholder:b.placeholder||'',score:b.score??1})):((q.answer_key??'')!==''?[{label:'',answer:q.answer_key,placeholder:'',score:1}]:[{label:'',answer:'',placeholder:'',score:1}]);
  _draftGrading=q.grading||'auto';
  // 英语题型草稿
  _draftSubs=q.subs?JSON.parse(JSON.stringify(q.subs)):[];
  _draftMatch=(q.match&&q.match.options)?JSON.parse(JSON.stringify(q.match)):{stems:[],options:[]};
  _draftAudio=q.audio?{...q.audio}:null;
  _draftClozePer=q.clozePer??((qt==='cloze'||qt==='audio_fill')?(q.blanks?.[0]?.score??1):1);
  onQTypeChange(qt);
  // FRQ/人工改 分值
  const scoreGroup=document.getElementById('q-max-score-group');
  if(scoreGroup){const si=document.getElementById('q-max-score-input');if(si)si.value=q.max_score??1;}
  _renderQImgPreviews();
  document.getElementById('modal-question').classList.add('open');
}
function closeQModal(){document.getElementById('modal-question').classList.remove('open');}
function handleQImagesUpload(event){
  const files=Array.from(event.target.files);if(!files.length)return;
  const remaining=10-S.draftQImgs.length;if(remaining<=0){toast('最多10张图片');return;}
  const toAdd=files.slice(0,remaining);if(files.length>remaining)toast(`最多10张，已自动截取前 ${remaining} 张`);
  toAdd.forEach(file=>{S.draftQImgs.push({url:URL.createObjectURL(file),file,filename:file.name});});
  _renderQImgPreviews();event.target.value='';
}
function removeQImg(idx){S.draftQImgs.splice(idx,1);_renderQImgPreviews();}
function _renderQImgPreviews(){
  const cont=document.getElementById('q-imgs-preview');if(!cont)return;
  if(!S.draftQImgs.length){cont.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;"><div style="font-size:24px;margin-bottom:6px;">📷</div>点击上方按钮添加图片</div>';return;}
  cont.innerHTML=S.draftQImgs.map((im,i)=>`
    <div style="position:relative;display:inline-block;margin:4px;">
      <img src="${im.url}" style="width:100px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);display:block;" />
      ${im.file?'<div style="position:absolute;top:2px;left:2px;background:var(--amber);color:white;font-size:9px;padding:1px 4px;border-radius:3px;">待传</div>':''}
      <button onclick="removeQImg(${i})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;">×</button>
      <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:2px;">${i+1}/${S.draftQImgs.length}</div>
    </div>`).join('')+
    (S.draftQImgs.length<10?`<label style="display:inline-flex;align-items:center;justify-content:center;width:100px;height:80px;border:1.5px dashed var(--border-md);border-radius:6px;cursor:pointer;color:var(--text3);font-size:22px;margin:4px;vertical-align:top;">+<input type="file" accept="image/*" multiple style="display:none;" onchange="handleQImagesUpload(event)" /></label>`:'');
}
function handleImageUpload(event){handleQImagesUpload(event);}
function handleImageUpload2(){}
function removeImage2(){}

function saveQuestion(){
  if(S.editingQIdx===null)return;
  const isMixed=S.examType==='mixed';
  let qt=S.draftQuestions[S.editingQIdx].question_type||'choice';
  if(isMixed){const sel=document.querySelector('input[name="q-type-radio"]:checked');if(sel)qt=sel.value;}
  const text=document.getElementById('q-text-input').value.trim();
  const blanks=_draftBlanks.map(b=>({label:(b.label||'').trim(),answer:(b.answer||'').trim(),placeholder:(b.placeholder||'').trim(),score:parseInt(b.score)||1})).filter(b=>b.label!==''||b.answer!=='');
  const isAutoFill=(qt==='fill'||qt==='fill_text')&&_draftGrading==='auto';
  let computedMaxScore;
  if(qt==='cloze'||qt==='audio_fill'){
    const n=clozeSegs(text).filter(s=>s.t==='blank').length;
    if(!n){toast(`${qt==='cloze'?'补全单词':'听力填空'}题需要在题目文字中用 [答案] 标记至少一个空`);return;}
    computedMaxScore=n*_draftClozePer;
  } else if(qt==='audio_choice'||qt==='reading'){
    if(!_draftSubs.length){toast('请至少添加一个小题');return;}
    if(_draftSubs.some(s=>!(s.text||'').trim())){toast('每个小题都需要填写题干');return;}
    if(_draftSubs.some(s=>s.type!=='tfng'&&(s.choices||[]).some(c=>!(c||'').trim()))){toast('每个选项都需要填写内容');return;}
    if(qt==='reading'&&!text){toast('阅读理解需要在题目文字中填写文章');return;}
    computedMaxScore=_draftSubs.reduce((s,x)=>s+_subMaxScore(x),0);
  } else if(qt==='matching'){
    if(_draftMatch.stems.filter(st=>String(typeof st==='string'?st:(st.text||'')).trim()).length<2){toast('对应题至少需要 2 个描述条目');return;}
    if(!_draftMatch.options.length||_draftMatch.options.some(o=>!(o.text||'').trim())){toast('每个选项都需要填写内容');return;}
    computedMaxScore=_draftMatch.options.reduce((s,o)=>s+(parseInt(o.score)||1),0);
  } else if(isAutoFill){
    computedMaxScore=blanks.reduce((s,b)=>s+(b.score||1),0);
  } else if(qt==='choice'&&_draftChoiceMulti){
    _draftChoiceCorrect=_draftChoiceCorrect.filter(i=>i<_draftChoiceCount).sort((a,b)=>a-b);
    if(!_draftChoiceCorrect.length){toast('多选题请至少勾选一个正确选项');return;}
    computedMaxScore=_draftChoiceCorrect.length*_draftChoicePer;
  } else{
    computedMaxScore=parseInt(document.getElementById('q-max-score-input')?.value)||1;
  }
  if((qt==='audio_choice'||qt==='audio_fill')&&!_draftAudio){toast('听力题需要上传音频');return;}
  S.draftQuestions[S.editingQIdx]={
    ...S.draftQuestions[S.editingQIdx],
    imgs:S.draftQImgs,
    text,
    answer:parseInt(document.getElementById('q-correct-answer').value)||0,
    answer_key:blanks[0]?.answer??'',
    blanks,
    grading:qt==='audio_fill'?'auto':_draftGrading,
    subs:(qt==='audio_choice'||qt==='reading')?JSON.parse(JSON.stringify(_draftSubs)):null,
    match:qt==='matching'?JSON.parse(JSON.stringify(_draftMatch)):null,
    audio:(qt==='audio_choice'||qt==='audio_fill')?_draftAudio:null,
    clozePer:_draftClozePer,
    choiceCount:_draftChoiceCount,
    choiceMulti:qt==='choice'?_draftChoiceMulti:false,
    choiceCorrect:qt==='choice'&&_draftChoiceMulti?_draftChoiceCorrect.slice():[],
    choicePer:_draftChoicePer,
    explanation:document.getElementById('q-explanation-input').value.trim(),
    max_score:computedMaxScore,
    question_type:qt,
  };
  closeQModal();renderDraftQuestions();
}

// 批量导入解析
function openBulkExplanationModal(){document.getElementById('bulk-explanation-input').value='';document.getElementById('bulk-explanation-preview').style.display='none';document.getElementById('modal-bulk-explanation').classList.add('open');}
function closeBulkExplanationModal(){document.getElementById('modal-bulk-explanation').classList.remove('open');}
function _parseBulkExplanation(text){
  const pattern=/(?:【?第\s*(\d+)\s*题[】：:．.]?|\b(\d+)[\.、．]\s)/g;
  const matches=[];let match;
  while((match=pattern.exec(text))!==null){const num=parseInt(match[1]||match[2]);matches.push({num,start:match.index,end:match.index+match[0].length});}
  const parts=[];
  for(let i=0;i<matches.length;i++){const cur=matches[i];const nextStart=i+1<matches.length?matches[i+1].start:text.length;const content=text.slice(cur.end,nextStart).trim();if(content)parts.push({num:cur.num,content});}
  return parts;
}
function applyBulkExplanation(){
  const raw=document.getElementById('bulk-explanation-input').value.trim();if(!raw){toast('请先粘贴解析内容');return;}
  const parts=_parseBulkExplanation(raw);if(!parts.length){toast('未识别到题号，请检查格式');return;}
  const total=S.draftQuestions.length;let applied=0;
  parts.forEach(({num,content})=>{const idx=num-1;if(idx>=0&&idx<total){S.draftQuestions[idx].explanation=content;applied++;}});
  if(!applied){toast('没有匹配到题目，请检查题号范围');return;}
  const preview=document.getElementById('bulk-explanation-preview');preview.style.display='block';
  preview.innerHTML=parts.map(({num,content})=>{const idx=num-1;const inRange=idx>=0&&idx<total;return`<div style="margin-bottom:6px;${inRange?'':'color:var(--red);'}"><strong>第${num}题</strong>${inRange?'':' (超出范围)'}：${content.slice(0,60)}${content.length>60?'…':''}</div>`;}).join('');
  renderDraftQuestions();closeBulkExplanationModal();toast(`已导入 ${applied} 道题的解析 ✓`);
}

// 批量导入答案
function openBulkAnswerModal(){document.getElementById('bulk-answer-input').value='';var p=document.getElementById('bulk-answer-preview');if(p){p.style.display='none';p.innerHTML='';}document.getElementById('modal-bulk-answer').classList.add('open');}
function closeBulkAnswerModal(){document.getElementById('modal-bulk-answer').classList.remove('open');}
function _bulkQt(q){return S.examType==='mixed'?(q.question_type||'choice'):S.examType;}
function applyBulkAnswer(){
  const text=document.getElementById('bulk-answer-input').value.trim();
  if(!text){toast('请先输入答案');return;}
  const total=S.draftQuestions.length;
  if(!total){toast('还没有题目，请先添加题目或批量上传图片');return;}
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const numbered=lines.filter(l=>/^\d+\s*[.、．)]?\s*[A-Ha-h]/.test(l));
  const showSkips=(skipped,head)=>{const p=document.getElementById('bulk-answer-preview');if(!p||!skipped.length)return;p.style.display='block';p.innerHTML=head+'<br>'+skipped.map(h=>`<span style="display:inline-block;margin:3px 8px 0 0;color:var(--red);">第${h.num}题 ${h.L}（${h.skip}）</span>`).join('');};
  const _expMsg=n=>n?`，其中 ${n} 题因答案超过原选项数已自动扩充选项`:'';
  if(numbered.length){
    let filled=0,expanded=0;const hits=[];
    lines.forEach(line=>{
      const m=line.match(/^(\d+)\s*[.、．)]?\s*([A-Ha-h])/);if(!m)return;
      const idx=parseInt(m[1])-1,L=m[2].toUpperCase(),ans='ABCDEFGH'.indexOf(L);
      if(idx<0||idx>=total){hits.push({num:idx+1,L,ok:false,skip:'超出题数'});return;}
      const q=S.draftQuestions[idx],qt=_bulkQt(q);
      if(qt!=='choice'||q.choiceMulti){hits.push({num:idx+1,L,ok:false,skip:'非单选题'});return;}
      const cc=Math.max(2,Math.min(8,q.choiceCount||S.choiceCount||4));
      if(ans>=cc){q.choiceCount=Math.min(8,ans+1);expanded++;}
      q.answer=ans;filled++;hits.push({num:idx+1,L,ok:true});
    });
    if(!filled){toast('没有填成功，请检查题号/格式');return;}
    renderDraftQuestions();
    const skipped=hits.filter(h=>!h.ok);
    if(skipped.length){showSkips(skipped,`已填 ${filled} 题，以下未填：`);toast(`已填 ${filled} 道题${_expMsg(expanded)}，${skipped.length} 个未填（见下方）`);}
    else{closeBulkAnswerModal();toast(`已填 ${filled} 道题的答案${_expMsg(expanded)} ✓`);}
    return;
  }
  const letters=(text.toUpperCase().match(/[A-H]/g)||[]);
  if(!letters.length){toast('没识别到答案字母（A–H）');return;}
  const targets=[];
  S.draftQuestions.forEach((q,i)=>{if(_bulkQt(q)==='choice'&&!q.choiceMulti)targets.push(i);});
  if(!targets.length){toast('当前没有可填答案的单选题');return;}
  let filled=0,expanded=0;const hits=[];
  letters.forEach((L,k)=>{
    if(k>=targets.length)return;
    const qi=targets[k],q=S.draftQuestions[qi],cc=Math.max(2,Math.min(8,q.choiceCount||S.choiceCount||4)),ans='ABCDEFGH'.indexOf(L);
    if(ans>=cc){q.choiceCount=Math.min(8,ans+1);expanded++;}
    q.answer=ans;filled++;hits.push({num:qi+1,L,ok:true});
  });
  if(!filled){toast('没有填成功');return;}
  renderDraftQuestions();
  const extra=letters.length-targets.length;
  let msg=`已填 ${filled} 道题的答案`+_expMsg(expanded);
  if(extra>0)msg+=`，多余 ${extra} 个已忽略`;
  else if(letters.length<targets.length)msg+=`，还有 ${targets.length-letters.length} 道未填`;
  closeBulkAnswerModal();
  toast(msg+' ✓');
}

// ── 从 PDF 导入题目 ──────────────────────────────────────
let _pdf=null;let _pdfjsLoading=null;let _pdfTarget=null;
function _ensurePdfjs(){
  if(window.pdfjsLib)return Promise.resolve();
  if(_pdfjsLoading)return _pdfjsLoading;
  _pdfjsLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');s.src='vendor/pdfjs/pdf.min.js';
    s.onload=()=>{try{pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';res();}catch(e){rej(e);}};
    s.onerror=()=>rej(new Error('加载失败'));
    document.head.appendChild(s);
  });
  return _pdfjsLoading;
}
function openPdfImport(target=null){
  if(_pdf&&_pdf.gen){_pdf.gen.forEach(g=>g.images&&g.images.forEach(im=>{try{URL.revokeObjectURL(im.url);}catch(e){}}));}
  _pdf=null;_pdfTarget=target;
  const _mt=document.getElementById('pdf-modal-title'),_mi=document.getElementById('pdf-modal-intro');
  if(_mt)_mt.textContent=(target&&target.modalTitle)||(target&&target.materialLabel?`📄 从 PDF 框选${target.materialLabel}和题目`:'📄 从 PDF 导入题目');
  if(_mi)_mi.innerHTML=(target&&target.modalIntro)||(target&&target.materialLabel?`上传 PDF 后依次拖框：<b>第 1 个框是${target.materialLabel}</b>，<b>第 2 个框开始每框是一道完整题目</b>。<br>题干和选项都保留在截图中，之后只需设置选项数量和正确答案。`:'选一个 PDF，平台会把它渲染出来，两种用法：<br>· <b>每页一题</b>：勾选要的页，每页整页变成一道题的图片。<br>· <b>手动框选</b>：拖框框住每道题，每个框变成一道题。');
  document.getElementById('pdf-file-name').textContent='';
  document.getElementById('pdf-mode-bar').style.display='none';
  const pp=document.getElementById('pdf-pages');pp.style.display='none';pp.innerHTML='';
  document.getElementById('pdf-import-btn').style.display='none';
  document.getElementById('pdf-back-btn').style.display='none';
  document.getElementById('pdf-confirm-btn').style.display='none';
  const _ab=document.getElementById('pdf-auto-btn');if(_ab)_ab.style.display='none';
  const pv=document.getElementById('pdf-preview');if(pv){pv.style.display='none';pv.innerHTML='';}
  document.getElementById('modal-pdf-import').classList.add('open');
}
function closePdfImport(){document.getElementById('modal-pdf-import').classList.remove('open');}
async function handlePdfFile(ev){
  const f=ev.target.files&&ev.target.files[0];ev.target.value='';if(!f)return;
  const nameEl=document.getElementById('pdf-file-name');
  nameEl.textContent=f.name+'（加载组件…）';
  try{await _ensurePdfjs();}catch(e){toast('PDF 组件加载失败，请检查网络');nameEl.textContent='';return;}
  nameEl.textContent=f.name+'（读取中…）';
  try{
    const buf=await f.arrayBuffer();
    const doc=await pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
    _pdf={doc,name:f.name,mode:'page',boxes:{},sel:new Set(),targetW:640};
    document.getElementById('pdf-mode-bar').style.display='flex';
    document.getElementById('pdf-import-btn').style.display='';
    const _ab=document.getElementById('pdf-auto-btn');if(_ab){_ab.style.display='';_ab.textContent='✂️ 按题号自动切';}
    document.getElementById('pdf-back-btn').style.display='none';
    document.getElementById('pdf-confirm-btn').style.display='none';
    const _pv=document.getElementById('pdf-preview');if(_pv){_pv.style.display='none';_pv.innerHTML='';}
    document.getElementById('pdf-pages').style.display='';
    await _renderPdfThumbs();
    setPdfMode(_pdfTarget&&_pdfTarget.initialMode==='crop'?'crop':'page');
  }catch(e){toast('打不开这个 PDF：'+((e&&e.message)||e));nameEl.textContent='';}
}
async function _renderPdfThumbs(){
  const cont=document.getElementById('pdf-pages');cont.innerHTML='';
  const N=_pdf.doc.numPages,nameEl=document.getElementById('pdf-file-name');
  _pdf.rendered={};_pdf.pageMeta={};
  const io=('IntersectionObserver'in window)?new IntersectionObserver(ents=>{
    ents.forEach(en=>{if(en.isIntersecting){io.unobserve(en.target);_renderOnePage(+en.target.dataset.idx);}});
  },{root:cont,rootMargin:'500px'}):null;
  for(let i=1;i<=N;i++){
    const page=await _pdf.doc.getPage(i);
    const vp1=page.getViewport({scale:1});
    const scale=_pdf.targetW/vp1.width;
    const vp=page.getViewport({scale});
    _pdf.pageMeta[i-1]={page,scale,w:Math.round(vp.width),h:Math.round(vp.height)};
    const wrap=document.createElement('div');wrap.className='pdf-page-wrap';wrap.dataset.idx=i-1;
    wrap.style.cssText='position:relative;margin:0 auto 14px;width:'+Math.round(vp.width)+'px;max-width:100%;background:#fff;border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,.08);';
    const ph=document.createElement('div');ph.className='pdf-ph';
    ph.style.cssText='width:100%;padding-top:'+(vp.height/vp.width*100)+'%;';
    ph.innerHTML='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px;">第 '+i+' 页…</div>';
    ph.style.position='relative';
    const chk=document.createElement('label');chk.className='pdf-chk';
    chk.style.cssText='position:absolute;top:6px;left:6px;background:rgba(0,0,0,.62);color:#fff;font-size:12px;padding:3px 9px;border-radius:20px;cursor:pointer;display:flex;gap:6px;align-items:center;z-index:5;';
    chk.innerHTML='<input type="checkbox" checked style="margin:0;cursor:pointer;"> 第'+i+'页';
    chk.querySelector('input').onchange=e=>{const id=i-1;if(e.target.checked)_pdf.sel.add(id);else _pdf.sel.delete(id);_updatePdfCount();};
    _pdf.sel.add(i-1);
    const ov=document.createElement('div');ov.className='pdf-crop-overlay';
    ov.style.cssText='position:absolute;inset:0;cursor:crosshair;display:none;z-index:3;';
    _attachCropDraw(ov,wrap,i-1);
    wrap.appendChild(ph);wrap.appendChild(ov);wrap.appendChild(chk);
    cont.appendChild(wrap);
    if(io)io.observe(wrap);else _renderOnePage(i-1);
  }
  nameEl.textContent=_pdf.name+' · 共 '+N+' 页';
}
async function _renderOnePage(idx){
  if(!_pdf||!_pdf.pageMeta[idx]||_pdf.rendered[idx])return;
  _pdf.rendered[idx]=true;
  const meta=_pdf.pageMeta[idx];
  const vp=meta.page.getViewport({scale:meta.scale});
  const canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;
  canvas.style.cssText='display:block;width:100%;height:auto;';
  try{await meta.page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;}
  catch(e){_pdf.rendered[idx]=false;return;}
  const wrap=document.querySelector('#pdf-pages .pdf-page-wrap[data-idx="'+idx+'"]');
  if(!wrap)return;
  const ph=wrap.querySelector('.pdf-ph');if(ph)ph.remove();
  wrap.insertBefore(canvas,wrap.firstChild);
}
function _attachCropDraw(ov,wrap,idx){
  let start=null,tmp=null;
  const pos=e=>{const r=ov.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  const draw=(a,b)=>{const bx=Math.min(a.x,b.x),by=Math.min(a.y,b.y),bw=Math.abs(a.x-b.x),bh=Math.abs(a.y-b.y);tmp.style.left=(bx*100)+'%';tmp.style.top=(by*100)+'%';tmp.style.width=(bw*100)+'%';tmp.style.height=(bh*100)+'%';return{x:bx,y:by,w:bw,h:bh};};
  ov.addEventListener('mousedown',e=>{start=pos(e);tmp=document.createElement('div');tmp.style.cssText='position:absolute;border:2px solid #4f8ef7;background:rgba(79,142,247,.15);z-index:6;pointer-events:none;';wrap.appendChild(tmp);e.preventDefault();
    const mm=ev=>{if(start&&tmp)draw(start,pos(ev));};
    const mu=ev=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);if(!start||!tmp)return;const b=draw(start,pos(ev));tmp.remove();tmp=null;start=null;if(b.w<0.02||b.h<0.008)return;(_pdf.boxes[idx]=_pdf.boxes[idx]||[]).push(b);_renderBoxes();};
    document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
  });
}
function _renderBoxes(){
  document.querySelectorAll('#pdf-pages .pdf-box').forEach(el=>el.remove());
  const showBox=(!_pdf||_pdf.mode!=='page');
  document.querySelectorAll('#pdf-pages .pdf-page-wrap').forEach(wrap=>{
    const idx=+wrap.dataset.idx,boxes=_pdf.boxes[idx]||[];
    boxes.forEach((b,bi)=>{
      const isCont=!!b.cont,col=isCont?'#2b6cb0':'#22a06b';
      const d=document.createElement('div');d.className='pdf-box';
      d.style.cssText='position:absolute;left:'+(b.x*100)+'%;top:'+(b.y*100)+'%;width:'+(b.w*100)+'%;height:'+(b.h*100)+'%;border:2px solid '+col+';background:'+(isCont?'rgba(43,108,176,.10)':'rgba(34,160,107,.10)')+';z-index:4;box-sizing:border-box;cursor:move;display:'+(showBox?'block':'none')+';';
      d.onmousedown=ev=>{if(ev.target!==d)return;_startBoxMove(idx,bi,wrap,ev);};
      const del=document.createElement('div');del.textContent='✕';del.title='删除这个框';
      del.style.cssText='position:absolute;top:2px;left:50%;transform:translateX(-50%);background:#e5484d;color:#fff;font-size:12px;width:22px;height:20px;line-height:20px;text-align:center;border-radius:10px;cursor:pointer;z-index:9;box-shadow:0 1px 3px rgba(0,0,0,.35);';
      del.onmousedown=ev=>ev.stopPropagation();
      del.onclick=ev=>{ev.stopPropagation();_pdf.boxes[idx].splice(bi,1);_renderBoxes();};
      d.appendChild(del);
      const tog=document.createElement('div');tog.textContent=isCont?'▲已接上题':'接上一题';tog.title='一题跨页时：把这个框并进上一道题';
      tog.style.cssText='position:absolute;top:2px;left:4px;font-size:11px;padding:1px 7px;border-radius:10px;cursor:pointer;z-index:9;white-space:nowrap;'+(isCont?'background:#2b6cb0;color:#fff;':'background:rgba(255,255,255,.92);color:#2b6cb0;border:1px solid #2b6cb0;');
      tog.onmousedown=ev=>ev.stopPropagation();
      tog.onclick=ev=>{ev.stopPropagation();b.cont=!b.cont;_renderBoxes();};
      d.appendChild(tog);
      [['nw','top:-6px;left:-6px;','nwse-resize'],['ne','top:-6px;right:-6px;','nesw-resize'],['sw','bottom:-6px;left:-6px;','nesw-resize'],['se','bottom:-6px;right:-6px;','nwse-resize']].forEach(hc=>{
        const h=document.createElement('div');h.className='pdf-h';
        h.style.cssText='position:absolute;width:12px;height:12px;background:#fff;border:2px solid '+col+';border-radius:50%;z-index:8;'+hc[1]+'cursor:'+hc[2]+';';
        h.onmousedown=ev=>{ev.stopPropagation();_startBoxResize(idx,bi,hc[0],wrap,ev);};
        d.appendChild(h);
      });
      wrap.appendChild(d);
    });
  });
  _updatePdfCount();
}
function setPdfMode(m){
  if(!_pdf)return;_pdf.mode=m;
  document.getElementById('pdf-mode-page').classList.toggle('btn-primary',m==='page');
  document.getElementById('pdf-mode-crop').classList.toggle('btn-primary',m==='crop');
  document.querySelectorAll('#pdf-pages .pdf-crop-overlay').forEach(o=>o.style.display=m==='crop'?'block':'none');
  document.querySelectorAll('#pdf-pages .pdf-chk').forEach(o=>o.style.display=m==='page'?'flex':'none');
  document.querySelectorAll('#pdf-pages .pdf-box').forEach(o=>o.style.display=m==='crop'?'block':'none');
  document.getElementById('pdf-selall').style.display=m==='page'?'':'none';
  document.getElementById('pdf-selnone').style.display=m==='page'?'':'none';
  const defaultHint=m==='page'?'勾选要导入的页，每页一道题':'拖框框住每题；可拖角缩放/拖动微调，✕删除；一题跨页时在续页那个框上点「接上一题」合并';
  document.getElementById('pdf-mode-hint').textContent=(m==='crop'&&_pdfTarget&&_pdfTarget.cropHint)||defaultHint;
  _updatePdfCount();
}
function pdfSelectAll(v){
  document.querySelectorAll('#pdf-pages .pdf-chk input').forEach(c=>{c.checked=v;});
  _pdf.sel=new Set();if(v)for(let i=0;i<_pdf.doc.numPages;i++)_pdf.sel.add(i);
  _updatePdfCount();
}
async function pdfAutoSplit(){
  if(!_pdf||!_pdf.doc){toast('请先选择 PDF');return;}
  const btn=document.getElementById('pdf-auto-btn');if(btn)btn.disabled=true;
  const N=_pdf.doc.numPages,boxes={};let total=0,started=false,contN=0;
  try{
    for(let i=0;i<N;i++){
      if(btn)btn.textContent='识别题号… '+(i+1)+'/'+N;
      const page=await _pdf.doc.getPage(i+1);
      const vp=page.getViewport({scale:1});
      const tc=await page.getTextContent();
      const W=vp.width,H=vp.height,marks=[],ys=[];
      tc.items.forEach(it=>{
        const s=(it.str||'').trim();if(!s)return;
        const tp=vp.convertToViewportPoint(it.transform[4],it.transform[5]);
        const x=tp[0]/W,yTop=(tp[1]-(it.height||12))/H;
        if(yTop>=0.05&&yTop<=0.95)ys.push(yTop);
        let num=null,sep=false;
        const m=s.match(/^(\d{1,3})\s*[.．、)]/);
        if(m){num=parseInt(m[1]);sep=true;}
        else if(/^\d{1,3}$/.test(s))num=parseInt(s);
        if(num===null||num<1)return;
        if(sep){if(x>0.20)return;}else{if(x>0.12)return;}
        marks.push({num,y:Math.max(0,yTop)});
      });
      marks.sort((a,b)=>a.y-b.y);
      const seq=[];
      marks.forEach(mk=>{
        if(!seq.length){seq.push(mk);return;}
        const last=seq[seq.length-1];
        if(Math.abs(mk.y-last.y)<0.012)return;
        if(mk.num>last.num&&mk.num<=last.num+5)seq.push(mk);
      });
      const pageBoxes=[];
      if(seq.length){
        const firstY=seq[0].y;
        if(started&&firstY>0.14){
          const topTexts=ys.filter(y=>y>=0.05&&y<=firstY-0.012);
          if(topTexts.length>=3){
            const gapTop=Math.max(0.045,Math.min.apply(null,topTexts)-0.006),hh=(firstY-0.006)-gapTop;
            if(hh>0.03){pageBoxes.push({x:0.03,y:gapTop,w:0.94,h:hh,cont:true});contN++;}
          }
        }
        for(let k=0;k<seq.length;k++){
          const yt=Math.max(0,seq[k].y-0.004);
          const yb=(k+1<seq.length)?Math.max(yt+0.01,seq[k+1].y-0.004):0.996;
          const h=yb-yt;if(h<0.01)continue;
          pageBoxes.push({x:0.03,y:yt,w:0.94,h,cont:false});total++;
        }
        started=true;
      } else if(started&&ys.length>=12){
        pageBoxes.push({x:0.03,y:0.05,w:0.94,h:0.90,cont:true});contN++;
      }
      if(pageBoxes.length)boxes[i]=pageBoxes;
    }
    if(!total){toast('没识别到规整的题号，这份可能不适合自动切，请改用手动框选');if(btn){btn.disabled=false;btn.textContent='✂️ 按题号自动切';}return;}
    _pdf.boxes=boxes;
    setPdfMode('crop');
    _renderBoxes();
    const firstPage=Math.min.apply(null,Object.keys(boxes).map(Number));
    const fw=document.querySelector('#pdf-pages .pdf-page-wrap[data-idx="'+firstPage+'"]');if(fw)fw.scrollIntoView({block:'start'});
    toast('已自动切出 '+total+' 道题'+(contN?'，含 '+contN+' 处跨页续接（蓝框，已合并进上一题）':'')+'，请扫一眼、微调后点「预览」✓');
  }catch(e){toast('自动切分失败：'+((e&&e.message)||e));}
  if(btn){btn.disabled=false;btn.textContent='✂️ 按题号自动切';}
}
function _updatePdfCount(){
  if(!_pdf)return;const btn=document.getElementById('pdf-import-btn');
  if(_pdf.mode==='page'){btn.textContent='预览选中的 '+_pdf.sel.size+' 页';return;}
  let boxesN=0,cont=0;Object.values(_pdf.boxes).forEach(a=>a.forEach(b=>{boxesN++;if(b.cont)cont++;}));
  const q=Math.max(boxesN-cont,boxesN?1:0);
  btn.textContent='预览 '+q+' 道题'+(cont?'（含'+cont+'张续页）':'');
}
function _trimPdfWhitespace(canvas,pad=24){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,data=ctx.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y+=2){for(let x=0;x<w;x+=2){const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];if(a>10&&(r<245||g<245||b<245)){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}}
  if(maxX<minX||maxY<minY)return canvas;
  minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(w-1,maxX+pad);maxY=Math.min(h-1,maxY+pad);
  const tw=maxX-minX+1,th=maxY-minY+1;if(tw<40||th<40)return canvas;
  const out=document.createElement('canvas');out.width=tw;out.height=th;out.getContext('2d').drawImage(canvas,minX,minY,tw,th,0,0,tw,th);return out;
}
async function pdfBuildPreview(){
  if(!_pdf||!_pdf.doc){toast('请先选择 PDF');return;}
  const HIRES=2.0;
  const btn=document.getElementById('pdf-import-btn');btn.disabled=true;
  const renderHi=async idx=>{const page=await _pdf.doc.getPage(idx+1);const vp=page.getViewport({scale:HIRES});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c;};
  const gen=[];
  try{
    if(_pdf.mode==='page'){
      const idxs=[..._pdf.sel].sort((a,b)=>a-b);
      if(!idxs.length){toast('请至少勾选一页');btn.disabled=false;_updatePdfCount();return;}
      for(let k=0;k<idxs.length;k++){
        btn.textContent='生成预览… '+(k+1)+'/'+idxs.length;
        const c=await renderHi(idxs[k]);
        const blob=await new Promise(r=>c.toBlob(r,'image/png'));
        gen.push({images:[{blob,url:URL.createObjectURL(blob),name:'pdf_p'+(idxs[k]+1)+'.png'}]});
      }
    }else{
      const list=[];Object.keys(_pdf.boxes).forEach(k=>{const idx=+k;(_pdf.boxes[idx]||[]).forEach(b=>list.push({idx,b}));});
      list.sort((a,b)=>a.idx-b.idx||a.b.y-b.b.y);
      if(!list.length){toast('请先在页面上框选题目');btn.disabled=false;_updatePdfCount();return;}
      const cache={};
      for(let k=0;k<list.length;k++){
        btn.textContent='生成预览… '+(k+1)+'/'+list.length;
        const it=list[k],idx=it.idx,b=it.b;
        if(!cache[idx])cache[idx]=await renderHi(idx);
        const src=cache[idx];
        const sx=Math.round(b.x*src.width),sy=Math.round(b.y*src.height),sw=Math.max(1,Math.round(b.w*src.width)),sh=Math.max(1,Math.round(b.h*src.height));
        const crop=document.createElement('canvas');crop.width=sw;crop.height=sh;
        crop.getContext('2d').drawImage(src,sx,sy,sw,sh,0,0,sw,sh);
        const output=(_pdfTarget&&_pdfTarget.trimWhitespace)?_trimPdfWhitespace(crop):crop;
        const blob=await new Promise(r=>output.toBlob(r,'image/png'));
        const img={blob,url:URL.createObjectURL(blob),name:'pdf_p'+(idx+1)+'_'+(k+1)+'.png'};
        if(b.cont&&gen.length&&gen[gen.length-1].images.length<10)gen[gen.length-1].images.push(img);
        else gen.push({images:[img]});
      }
    }
    _pdf.gen=gen;_showPdfPreview();
  }catch(e){toast('生成预览失败：'+((e&&e.message)||e));}
  btn.disabled=false;_updatePdfCount();
}
function _pdfPreviewUrls(){const u=[];if(_pdf&&_pdf.gen)_pdf.gen.forEach(g=>g.images.forEach(im=>u.push(im.url)));return u;}
function _showPdfPreview(){
  const grid=document.getElementById('pdf-preview');
  const readingLayout=!!(_pdfTarget&&_pdfTarget.readingLayout);
  const materialLabel=(_pdfTarget&&_pdfTarget.materialLabel)||'阅读材料';
  const expectedCount=Math.max(0,Number(_pdfTarget&&_pdfTarget.expectedCount)||0),countMismatch=expectedCount>0&&_pdf.gen.length!==expectedCount;
  let gi=0,totalImgs=0;_pdf.gen.forEach(g=>totalImgs+=g.images.length);
  const cards=_pdf.gen.map((g,k)=>{
    const imgs=g.images.map(im=>{const j=gi++;return '<img src="'+im.url+'" onclick="_lightbox(_pdfPreviewUrls(),'+j+')" style="height:118px;max-width:100%;object-fit:contain;background:#faf9f7;cursor:zoom-in;display:block;border-radius:4px;"/>';}).join('');
    const multi=g.images.length>1?'<span style="position:absolute;top:5px;right:5px;background:#2b6cb0;color:#fff;font-size:10px;padding:1px 7px;border-radius:20px;z-index:1;">跨页·'+g.images.length+'图</span>':'';
    const label=readingLayout?(k===0?materialLabel:'第 '+k+' 题'):'第 '+(k+1)+' 题';
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:8px;position:relative;padding:24px 6px 6px;"><span style="position:absolute;top:5px;left:5px;background:#22a06b;color:#fff;font-size:11px;padding:1px 8px;border-radius:20px;z-index:1;">'+label+'</span>'+multi+'<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;">'+imgs+'</div></div>';
  }).join('');
  const intro=readingLayout?'第 1 个截图将作为<b>'+materialLabel+'</b>，后面 <b>'+Math.max(0,_pdf.gen.length-1)+'</b> 个截图将作为题目。':'将导入 <b>'+_pdf.gen.length+'</b> 道题。';
  const countNote=expectedCount?`<br><b style="color:${countMismatch?'var(--red)':'var(--green)'}">需要 ${expectedCount} 道，当前 ${_pdf.gen.length} 道${countMismatch?'，数量不一致，请返回调整':'，数量正确'}</b>`:'';
  grid.innerHTML='<div style="font-size:13px;color:var(--text2);margin-bottom:10px;line-height:1.6;">'+intro+'（共 '+totalImgs+' 张图；蓝标「跨页」表示多页已合并，点图放大核对）。'+countNote+'<br>没问题点「确认导入」，要改点「返回调整」。</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">'+cards+'</div>';
  grid.style.display='';
  document.getElementById('pdf-pages').style.display='none';
  document.getElementById('pdf-mode-bar').style.display='none';
  document.getElementById('pdf-import-btn').style.display='none';
  document.getElementById('pdf-back-btn').style.display='';
  const cf=document.getElementById('pdf-confirm-btn');cf.style.display='';cf.disabled=countMismatch;cf.textContent=countMismatch?`需要 ${expectedCount} 道，当前 ${_pdf.gen.length} 道`:(readingLayout?'确认导入文章和 '+Math.max(0,_pdf.gen.length-1)+' 道题':'确认导入 '+_pdf.gen.length+' 道题');
}
function pdfBackFromPreview(){
  if(_pdf&&_pdf.gen){_pdf.gen.forEach(g=>g.images.forEach(im=>{try{URL.revokeObjectURL(im.url);}catch(e){}}));_pdf.gen=null;}
  const grid=document.getElementById('pdf-preview');grid.style.display='none';grid.innerHTML='';
  document.getElementById('pdf-pages').style.display='';
  document.getElementById('pdf-mode-bar').style.display='flex';
  document.getElementById('pdf-import-btn').style.display='';
  document.getElementById('pdf-back-btn').style.display='none';
  document.getElementById('pdf-confirm-btn').style.display='none';
}
async function pdfConfirmImport(){
  if(!_pdf||!_pdf.gen||!_pdf.gen.length){toast('没有可导入的图');return;}
  if(_pdfTarget&&typeof _pdfTarget.onConfirm==='function'){
    const btn=document.getElementById('pdf-confirm-btn');btn.disabled=true;btn.textContent='正在上传截图…';
    try{
      const gen=_pdf.gen;
      await _pdfTarget.onConfirm(gen);
      gen.forEach(g=>g.images.forEach(im=>{try{URL.revokeObjectURL(im.url);}catch(e){}}));
      _pdf.gen=null;_pdfTarget=null;closePdfImport();
    }catch(e){toast('导入失败：'+((e&&e.message)||e));}
    finally{btn.disabled=false;}
    return;
  }
  const defaultQt=S.examType==='mixed'?'choice':S.examType;
  const n=_pdf.gen.length;let imgN=0;
  _pdf.gen.forEach(g=>{
    const imgs=g.images.map(im=>({url:im.url,file:new File([im.blob],im.name,{type:'image/png'}),filename:im.name}));
    imgN+=imgs.length;
    S.draftQuestions.push({imgs,text:'',answer:0,answer_key:'',explanation:'',max_score:1,choiceCount:S.choiceCount,question_type:defaultQt});
  });
  _pdf.gen=null;_pdfTarget=null;
  renderDraftQuestions();closePdfImport();
  toast('已从 PDF 导入 '+n+' 道题（'+imgN+' 张图）✓（保存时自动上传）');
}
function _positionBox(idx,bi){
  const wrap=document.querySelector('#pdf-pages .pdf-page-wrap[data-idx="'+idx+'"]');if(!wrap)return;
  const d=wrap.querySelectorAll('.pdf-box')[bi];if(!d||!_pdf.boxes[idx]||!_pdf.boxes[idx][bi])return;
  const b=_pdf.boxes[idx][bi];
  d.style.left=(b.x*100)+'%';d.style.top=(b.y*100)+'%';d.style.width=(b.w*100)+'%';d.style.height=(b.h*100)+'%';
}
function _startBoxMove(idx,bi,wrap,e){
  e.preventDefault();const b=_pdf.boxes[idx][bi];const rect=wrap.getBoundingClientRect();
  const ox=e.clientX,oy=e.clientY,sx=b.x,sy=b.y;
  const mm=ev=>{let nx=sx+(ev.clientX-ox)/rect.width,ny=sy+(ev.clientY-oy)/rect.height;nx=Math.max(0,Math.min(1-b.w,nx));ny=Math.max(0,Math.min(1-b.h,ny));b.x=nx;b.y=ny;_positionBox(idx,bi);};
  const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
}
function _startBoxResize(idx,bi,corner,wrap,e){
  e.preventDefault();const b=_pdf.boxes[idx][bi];const rect=wrap.getBoundingClientRect();
  const left0=b.x,right0=b.x+b.w,top0=b.y,bottom0=b.y+b.h,ox=e.clientX,oy=e.clientY,MINW=0.02,MINH=0.01;
  const mm=ev=>{const dx=(ev.clientX-ox)/rect.width,dy=(ev.clientY-oy)/rect.height;
    let left=left0,right=right0,top=top0,bottom=bottom0;
    if(corner.indexOf('w')>=0)left=Math.max(0,Math.min(right0-MINW,left0+dx));
    if(corner.indexOf('e')>=0)right=Math.min(1,Math.max(left0+MINW,right0+dx));
    if(corner.indexOf('n')>=0)top=Math.max(0,Math.min(bottom0-MINH,top0+dy));
    if(corner.indexOf('s')>=0)bottom=Math.min(1,Math.max(top0+MINH,bottom0+dy));
    b.x=left;b.y=top;b.w=right-left;b.h=bottom-top;_positionBox(idx,bi);};
  const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
}
function showQImg(qi,ji){const q=S.draftQuestions[qi];if(!q||!q.imgs||!q.imgs.length)return;_lightbox(q.imgs.map(im=>im.url),ji||0);}
function _examImgZoom(qIdx,i){const q=S.activeExam&&S.activeExam.questionsList&&S.activeExam.questionsList[qIdx];if(!q)return;let imgs=[];if(q.imgs_json){try{imgs=JSON.parse(q.imgs_json).filter(Boolean);}catch(e){}}if(!imgs.length){if(q.img_url)imgs.push(q.img_url);if(q.img_url2)imgs.push(q.img_url2);}if(imgs.length)_lightbox(imgs,i||0);}
function _lightbox(urls,idx){
  if(!urls||!urls.length)return;let i=idx||0,zoomed=false;
  const old=document.getElementById('_img-lightbox');if(old)old.remove();
  if(window._lbKey){document.removeEventListener('keydown',window._lbKey);window._lbKey=null;}
  const ov=document.createElement('div');ov.id='_img-lightbox';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;overflow:auto;-webkit-overflow-scrolling:touch;';
  const wrap=document.createElement('div');wrap.style.cssText='min-width:100%;min-height:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:12px;';
  const img=document.createElement('img');img.style.cssText='max-width:96vw;max-height:88vh;object-fit:contain;border-radius:6px;box-shadow:0 12px 44px rgba(0,0,0,.55);background:#fff;cursor:zoom-in;';
  const cap=document.createElement('div');cap.style.cssText='position:fixed;bottom:14px;left:0;right:0;text-align:center;color:#fff;font-size:13px;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.6);';
  const applyZoom=()=>{
    if(zoomed){img.style.maxWidth='none';img.style.maxHeight='none';const nw=img.naturalWidth||1200;img.style.width=Math.min(nw,Math.round((window.innerWidth||1000)*2.2))+'px';img.style.height='auto';img.style.cursor='zoom-out';wrap.style.alignItems='flex-start';}
    else{img.style.maxWidth='96vw';img.style.maxHeight='88vh';img.style.width='auto';img.style.height='auto';img.style.cursor='zoom-in';wrap.style.alignItems='center';ov.scrollTop=0;ov.scrollLeft=0;}
  };
  const upd=()=>{zoomed=false;img.src=urls[i];applyZoom();cap.textContent=(urls.length>1?(i+1)+' / '+urls.length+' · ':'')+'点图放大/缩小 · 点空白或 Esc 关闭'+(urls.length>1?' · ← → 切换':'');};
  const close=()=>{ov.remove();document.removeEventListener('keydown',key);window._lbKey=null;};
  const go=d=>{if(urls.length>1){i=(i+d+urls.length)%urls.length;upd();}};
  const key=e=>{if(e.key==='Escape')close();else if(e.key==='ArrowRight')go(1);else if(e.key==='ArrowLeft')go(-1);};
  img.onclick=e=>{e.stopPropagation();zoomed=!zoomed;applyZoom();};
  wrap.onclick=e=>{if(e.target===wrap)close();};
  ov.onclick=e=>{if(e.target===ov)close();};
  wrap.appendChild(img);ov.appendChild(wrap);
  if(urls.length>1){
    const prev=document.createElement('div');prev.textContent='\u2039';prev.style.cssText='position:fixed;left:12px;top:50%;transform:translateY(-50%);color:#fff;font-size:52px;cursor:pointer;user-select:none;padding:0 12px;z-index:1;text-shadow:0 1px 4px rgba(0,0,0,.6);';prev.onclick=ev=>{ev.stopPropagation();go(-1);};
    const next=document.createElement('div');next.textContent='\u203a';next.style.cssText='position:fixed;right:12px;top:50%;transform:translateY(-50%);color:#fff;font-size:52px;cursor:pointer;user-select:none;padding:0 12px;z-index:1;text-shadow:0 1px 4px rgba(0,0,0,.6);';next.onclick=ev=>{ev.stopPropagation();go(1);};
    ov.appendChild(prev);ov.appendChild(next);
  }
  const cbtn=document.createElement('div');cbtn.textContent='\u2715';cbtn.style.cssText='position:fixed;top:10px;right:16px;color:#fff;font-size:28px;cursor:pointer;z-index:1;text-shadow:0 1px 4px rgba(0,0,0,.6);';cbtn.onclick=close;
  ov.appendChild(cap);ov.appendChild(cbtn);
  document.body.appendChild(ov);document.addEventListener('keydown',key);window._lbKey=key;upd();
}

// ── 学生登录/考试列表 ────────────────────────────────────
async function studentLogin(){
  const key=document.getElementById('stu-key').value.trim().toUpperCase();
  hideAlert('stu-alert');
  if(!key){showAlert('stu-alert','请输入你的专属密钥');return;}
  const btn=document.querySelector('#login-student-panel .btn-primary');
  if(btn&&btn.disabled)return;
  if(btn){btn.disabled=true;btn.textContent='验证中…';}
  const sk=await api('GET','/api/student/login',{key});
  if(sk.error){showAlert('stu-alert',sk.error);if(btn){btn.disabled=false;btn.textContent='进入考试';}return;}
  S.student={name:sk.student_name,studentKeyId:sk.id,examId:sk.exam_id,studentKey:sk.student_key};
  S.role='student';
  sessionStorage.setItem('student',JSON.stringify(S.student));
  document.getElementById('student-name-nav').textContent=sk.student_name;
  document.getElementById('student-avatar-nav').textContent=sk.student_name.trim()[0]||'S';
  try{const tsData=await api('GET','/api/records/tab-switches',{student_key_id:sk.id});if(tsData.tab_switches>0)S.tabSwitches=tsData.tab_switches;}catch(e){}
  showScreen('student');await renderStudentDashboard(sk.student_name);
}

function openStudentKeyModal(){
  if(!S.student)return;
  const current=document.getElementById('student-current-key');
  current.value=S.student.studentKey||'';
  document.getElementById('student-new-key').value='';
  document.getElementById('student-new-key-confirm').value='';
  hideAlert('student-key-alert');
  document.getElementById('modal-student-key').classList.add('open');
  setTimeout(()=>document.getElementById(S.student.studentKey?'student-new-key':'student-current-key').focus(),0);
}
function closeStudentKeyModal(){document.getElementById('modal-student-key').classList.remove('open');}
async function changeStudentKey(){
  const currentKey=document.getElementById('student-current-key').value.trim().toUpperCase();
  const newKey=document.getElementById('student-new-key').value.trim().toUpperCase();
  const confirmKey=document.getElementById('student-new-key-confirm').value.trim().toUpperCase();
  hideAlert('student-key-alert');
  if(!currentKey||!newKey||!confirmKey){showAlert('student-key-alert','请填写完整');return;}
  if(!/^[A-Z0-9]{6,20}$/.test(newKey)){showAlert('student-key-alert','新密钥需为 6–20 位英文字母或数字');return;}
  if(newKey!==confirmKey){showAlert('student-key-alert','两次输入的新密钥不一致');return;}
  const btn=document.getElementById('student-key-submit');if(btn.disabled)return;
  btn.disabled=true;btn.textContent='修改中…';
  try{
    const result=await api('POST','/api/student/change-key',{current_key:currentKey,new_key:newKey});
    if(result.error){showAlert('student-key-alert',result.error);return;}
    S.student.studentKey=result.student_key;
    sessionStorage.setItem('student',JSON.stringify(S.student));
    _studentExamItems.forEach(item=>{if(item.studentKey)item.studentKey.student_key=result.student_key;});
    closeStudentKeyModal();toast(`密钥修改成功，${result.changed_count} 场考试已同步更新 ✓`,4000);
  }catch(e){showAlert('student-key-alert','修改失败，请检查网络后重试');}
  finally{btn.disabled=false;btn.textContent='确认修改';}
}

let _studentExamItems=[];
async function renderStudentDashboard(studentName){
  const cont=document.getElementById('student-exam-list');
  cont.innerHTML='<div style="color:var(--text2);font-size:13px;padding:40px 0;text-align:center;"><div class="spinner" style="margin:0 auto 12px;"></div>加载中…</div>';
  S._lastResult=null;
  const items=await api('GET','/api/student/exams',{student_name:studentName});
  _studentExamItems=items;
  try{const saved=localStorage.getItem('fav_'+studentName);S._favorites=new Set(saved?JSON.parse(saved):[]);}catch(e){S._favorites=new Set();}
  S._navSubject='';S._navType='all';S._navPage=1;S._navExpanded={};S._courseNames={};S._unitNames={};
  const hwItems=items.filter(i=>(i.exam.is_homework===1||i.exam.is_homework===true)&&!i.record);
  if(hwItems.length){
    await Promise.all(hwItems.map(async i=>{
      try{const prog=await api('GET','/api/homework-progress',{student_key_id:i.studentKey.id,exam_id:i.exam.id}).catch(()=>null);i.exam._hasProgress=!!(prog&&(Object.keys(prog.frq_answers||{}).length||Object.keys(prog.answers_data||{}).length));}catch(e){}
    }));
  }
  _renderStudentLayout(studentName,items);
}

function _stuCollectionOnUnlock(){const b=document.getElementById('stu-collection-btn');if(b)b.style.display='';}
async function updateStudentCollectionNav(name){
  try{const d=await api('GET','/api/collection/mine',{student_name:name});const b=document.getElementById('stu-collection-btn');if(b)b.style.display=(d&&d.hasAny)?'':'none';}catch(e){}
}
async function openStudentCollection(){
  const name=S.student&&S.student.name;if(!name)return;
  let d;try{d=await api('GET','/api/collection/mine',{student_name:name});}catch(e){toast('图鉴加载失败');return;}
  _renderCollectionModal(d);
}
function _renderCollectionModal(d){
  const cards=d.cards||[];S._collectionCards=cards;
  const math=cards.filter(c=>c.rarity!=='h'&&c.rarity!=='L'), teach=cards.filter(c=>c.rarity==='h'), legend=cards.filter(c=>c.rarity==='L');
  const cell=c=>window.NEBSReward?NEBSReward.cardHTML(c,c.owned,c.shiny||0):'';
  const mathGrid=math.map(cell).join(''), teachGrid=teach.map(cell).join(''), legendGrid=legend.map(cell).join('');
  const mCount=math.filter(c=>c.owned).length, tCount=teach.filter(c=>c.owned).length, lCount=legend.filter(c=>c.owned).length;
  const teachUnlocked=teach.some(c=>c.owned);
  const legendUnlocked=legend.some(c=>c.owned);
  const AH='style="display:flex;justify-content:space-between;align-items:baseline;margin:18px 0 10px;font-size:15px;font-weight:700;"';
  const CNT='style="font-size:12px;color:var(--text2);font-weight:600;"';
  const teachBody=teachUnlocked
    ? `<div class="collection-grid">${teachGrid}</div>`
    : `<div style="padding:24px 18px;border:1px dashed var(--border,#3a3f52);border-radius:12px;text-align:center;color:var(--text2);font-size:13px;line-height:1.7;">🔒 满分开到第一张<b>「师生卡」</b>即可解锁师生图鉴<br>老师和同学都有可能出现，等你收集齐 ✨</div>`;
  const legendBody=legendUnlocked
    ? `<div class="collection-grid">${legendGrid}</div>`
    : `<div style="padding:24px 18px;border:1px dashed var(--border,#3a3f52);border-radius:12px;text-align:center;color:var(--text2);font-size:13px;line-height:1.7;">🔒 极稀有<b>「传说角色」</b>——满分极小概率降临<br>抽到第一张即解锁传说图鉴 🐉</div>`;
  let ov=document.getElementById('collection-modal');
  if(!ov){ov=document.createElement('div');ov.id='collection-modal';document.body.appendChild(ov);}
  ov.className='collection-modal-ov';
  ov.innerHTML=`<div class="collection-sheet">
    <div class="collection-head">
      <div><div class="collection-title">🃏 我的图鉴</div><div class="collection-sub">点亮的卡可点击重看过场动画</div></div>
      <button class="btn btn-ghost btn-sm" onclick="closeCollectionModal()">关闭</button>
    </div>
    <div ${AH}><span>📐 数学家图鉴</span><span ${CNT}>${mCount} / ${math.length}</span></div>
    <div class="collection-grid">${mathGrid}</div>
    <div ${AH}><span>🎓 师生图鉴</span><span ${CNT}>${teachUnlocked?tCount+' / '+teach.length:'🔒 未解锁'}</span></div>
    ${teachBody}
    <div ${AH}><span>🐉 传说角色图鉴</span><span ${CNT}>${legendUnlocked?lCount+' / '+legend.length:'🔒 未解锁'}</span></div>
    ${legendBody}
  </div>`;
  ov.style.display='flex';
  ov.querySelectorAll('.rwd-mini.owned').forEach(el=>{el.addEventListener('click',()=>{try{const c=JSON.parse(decodeURIComponent(el.dataset.card));NEBSReward.preview(c,{});}catch(e){}});});
}
function closeCollectionModal(){const ov=document.getElementById('collection-modal');if(ov)ov.style.display='none';}
function _previewReward(which){
  const cards=S._collectionCards||[];if(!cards.length||!window.NEBSReward)return;
  if(which==='first'){const c=cards.find(x=>x.rarity==='r')||cards[0];if(c)NEBSReward.preview(c,{first:true});return;}
  const c=cards.find(x=>x.style===which)||cards.find(x=>x.rarity===which)||cards[0];if(c)NEBSReward.preview(c,{});
}
async function openTeacherCollection(){
  const cont=document.getElementById('teacher-tab-collection');if(!cont)return;
  cont.innerHTML='<div style="padding:20px;color:var(--text2);">加载中…</div>';
  let d;try{d=await api('GET','/api/collection/cards',{});}catch(e){cont.innerHTML='<div style="padding:20px;">加载失败</div>';return;}
  const cards=d.cards||[];S._collectionCards=cards;
  const math=cards.filter(c=>c.rarity!=='h'&&c.rarity!=='L'), teach=cards.filter(c=>c.rarity==='h'), legend=cards.filter(c=>c.rarity==='L');
  const mathGrid=math.map(c=>NEBSReward.cardHTML(c,true,0)).join('');
  const teachGrid=teach.map(c=>NEBSReward.cardHTML(c,true,0)).join('');
  const legendGrid=legend.map(c=>NEBSReward.cardHTML(c,true,0)).join('');
  const AH='style="margin:16px 0 10px;font-size:15px;font-weight:700;"';
  cont.innerHTML=`<div class="section-header"><div class="section-title">🃏 图鉴 · 数学 / CS 满分收集</div></div>
    <div class="collection-preview-bar">数学家过场：
      <button class="btn btn-sm" onclick="_previewReward('n')">普通 N</button>
      <button class="btn btn-sm" onclick="_previewReward('r')">稀有 R</button>
      <button class="btn btn-sm" onclick="_previewReward('s')">传说 SSR</button>
      <button class="btn btn-sm" onclick="_previewReward('first')">首次解锁仪式</button>
    </div>
    <div class="collection-preview-bar">师生过场：
      <button class="btn btn-sm" onclick="_previewReward('ink')">水墨·宗师</button>
      <button class="btn btn-sm" onclick="_previewReward('blueprint')">几何·蓝图</button>
      <button class="btn btn-sm" onclick="_previewReward('cosmic')">星空·星座</button>
      <button class="btn btn-sm" onclick="_previewReward('magic')">魔法少女</button>
      <button class="btn btn-sm" onclick="_previewReward('dessert')">梦幻甜点</button>
      <button class="btn btn-sm" onclick="_previewReward('sticker')">星愿手账</button>
      <button class="btn btn-sm" onclick="_previewReward('hesitant')">柴龙恩·迟疑</button>
      <button class="btn btn-sm" onclick="_previewReward('xujiahao_ssr')">许嘉豪·SSR</button>
    </div>
    <div class="collection-preview-bar">传说角色过场：
      <button class="btn btn-sm" onclick="_previewReward('water')">洛琪希·水</button>
      <button class="btn btn-sm" onclick="_previewReward('wind')">希露菲·风</button>
      <button class="btn btn-sm" onclick="_previewReward('sword')">艾莉丝·剑</button>
      <button class="btn btn-sm" onclick="_previewReward('king')">鲁迪·无咏唱</button>
    </div>
    <div ${AH}>📐 数学家图鉴</div><div class="collection-grid">${mathGrid}</div>
    <div ${AH}>🎓 师生图鉴 <span style="font-weight:400;font-size:12px;color:var(--text3);">老师与同学特别卡 · 师生档 30%，单张约 3.0%</span></div><div class="collection-grid">${teachGrid}</div>
    <div ${AH}>🐉 传说角色图鉴 <span style="font-weight:400;font-size:12px;color:var(--text3);">无职转生 + 满月 + 英雄联盟 · 传说档 30%,单张 ~3.0%</span></div><div class="collection-grid">${legendGrid}</div>
    <div style="margin-top:14px;font-size:12px;color:var(--text3);">学生在<b>任意科目</b>考试中得分达 90% 及以上即随机解锁一张卡；概率 数学家 40% / 师生 30% / 传说 30%。师生卡集到第一张解锁「师生图鉴」，传说角色集到第一张解锁「传说角色图鉴」。</div>`;
  cont.querySelectorAll('.rwd-mini.owned').forEach(el=>{el.addEventListener('click',()=>{try{const c=JSON.parse(decodeURIComponent(el.dataset.card));NEBSReward.preview(c,{});}catch(e){}});});
}
function _renderStudentLayout(studentName,items){
  const cont=document.getElementById('student-exam-list');
  try{updateStudentCollectionNav(studentName);}catch(e){}
  const subjectMap={};
  items.forEach(({exam,record:rec})=>{
    const s=exam.subject||'其他';
    if(!subjectMap[s])subjectMap[s]={choice:0,frq:0,fill:0,fill_text:0,mixed:0,toefl:0,ielts:0,java:0,pending:0,done:0};
    const et=exam.exam_type||'choice';
    subjectMap[s][et]=(subjectMap[s][et]||0)+1;
    if(rec)subjectMap[s].done++;else if(exam.is_active)subjectMap[s].pending++;
  });
  const subjects=Object.keys(subjectMap).sort();
  const totalDone=items.filter(i=>i.record).length;
  const totalPending=items.filter(i=>!i.record&&i.exam.is_active).length;
  let sidebarItems='';
  const allActive=S._navSubject==='';
  sidebarItems+=`<button onclick="navSelect('','all')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${allActive?'var(--blue-light)':'transparent'};color:${allActive?'var(--blue)':'var(--text2)'};font-size:13px;font-weight:${allActive?'600':'400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
    <span>全部</span><span style="font-size:11px;background:${allActive?'var(--blue)':'var(--surface2)'};color:${allActive?'white':'var(--text3)'};padding:1px 6px;border-radius:999px;">${items.length}</span>
  </button>`;
  if(totalPending>0){
    const pendActive=S._navSubject==='__pending__';
    sidebarItems+=`<button onclick="navSelect('__pending__','all')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${pendActive?'var(--amber-light)':'transparent'};color:${pendActive?'var(--amber)':'var(--text2)'};font-size:13px;font-weight:${pendActive?'600':'400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
      <span style="display:flex;align-items:center;gap:5px;"><span style="width:6px;height:6px;border-radius:50%;background:var(--amber);display:inline-block;"></span>待完成</span>
      <span style="font-size:11px;background:var(--amber-light);color:var(--amber);padding:1px 6px;border-radius:999px;">${totalPending}</span>
    </button>`;
  }
  const favCount=items.filter(i=>S._favorites.has(i.exam.id)).length;
  if(favCount>0){
    const favActive=S._navSubject==='__favorites__';
    sidebarItems+=`<button onclick="navSelect('__favorites__','all')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${favActive?'var(--blue-light)':'transparent'};color:${favActive?'var(--blue)':'var(--text2)'};font-size:13px;font-weight:${favActive?'600':'400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
      <span style="display:flex;align-items:center;gap:5px;">⭐ 已收藏</span>
      <span style="font-size:11px;background:${favActive?'var(--blue)':'var(--surface2)'};color:${favActive?'white':'var(--text3)'};padding:1px 6px;border-radius:999px;">${favCount}</span>
    </button>`;
  }
  // ── 课程 / 单元 分组 ──
  const courseMap={};
  items.forEach(({exam})=>{
    if(!exam.unit_id||!exam.course_id)return;
    if(!courseMap[exam.course_id])courseMap[exam.course_id]={name:exam.course_name||'课程',units:{},total:0};
    const cm=courseMap[exam.course_id];
    (exam.course_units||[]).forEach(u=>{if(!cm.units[u.id])cm.units[u.id]={name:u.name||'单元',count:0};});
    if(!cm.units[exam.unit_id])cm.units[exam.unit_id]={name:exam.unit_name||'单元',count:0};
    cm.units[exam.unit_id].count++;cm.total++;
  });
  const courseIds=Object.keys(courseMap);
  S._courseNames={};S._unitNames={};
  courseIds.forEach(cid=>{S._courseNames[cid]=courseMap[cid].name;Object.keys(courseMap[cid].units).forEach(uid=>{S._unitNames[uid]={name:courseMap[cid].units[uid].name,course:courseMap[cid].name};});});
  if(courseIds.length){
    sidebarItems+=`<div style="height:1px;background:var(--border);margin:6px 10px 4px;"></div><div style="padding:2px 12px 4px;font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;">课程</div>`;
    courseIds.forEach(cid=>{
      const cEnc='__course__'+cid,info=courseMap[cid];
      const isSel=S._navSubject===cEnc;
      const isExpanded=!!S._navExpanded[cEnc];
      const tri=`font-size:9px;display:inline-block;color:${isSel?'var(--blue)':'var(--text3)'};`;
      const shortName=info.name.length>16?info.name.slice(0,15)+'…':info.name;
      sidebarItems+=`<div>
        <button onclick="navToggleCourse('${cid}')" aria-expanded="${isExpanded}" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${isSel&&S._navType==='all'?'var(--blue-light)':'transparent'};color:${isSel?'var(--blue)':'var(--text2)'};font-size:13px;font-weight:${isSel?'600':'400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
          <span style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;"><span style="${tri}">${isExpanded?'▼':'▶'}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${info.name}">📘 ${shortName}</span></span>
          <span style="font-size:11px;background:${isSel?'var(--blue)':'var(--surface2)'};color:${isSel?'white':'var(--text3)'};padding:1px 6px;border-radius:999px;flex-shrink:0;margin-left:3px;">${info.total}</span>
        </button>
        ${isExpanded?`<div style="margin:0 6px 2px 22px;">${Object.keys(info.units).map(uid=>{
          const uEnc='__unit__'+uid,uSel=S._navSubject===uEnc,u=info.units[uid];
          return`<button onclick="navSelect('${uEnc}','all')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${uSel?'var(--blue-light)':'transparent'};color:${uSel?'var(--blue)':'var(--text3)'};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${uSel?'600':'400'};">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ${u.name}</span><span style="font-size:11px;">${u.count}</span>
          </button>`;
        }).join('')}</div>`:''}
      </div>`;
    });
  }

  sidebarItems+=`<div style="height:1px;background:var(--border);margin:6px 10px 4px;"></div><div style="padding:2px 12px 4px;font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;">科目</div>`;
  subjects.forEach(s=>{
    const enc=encodeURIComponent(s),info=subjectMap[s];
    const isSelected=S._navSubject===enc;
    const totalForSub=(info.choice||0)+(info.frq||0)+(info.fill||0)+(info.fill_text||0)+(info.mixed||0)+(info.toefl||0)+(info.ielts||0)+(info.java||0);
    const shortName=s.length>20?s.slice(0,18)+'…':s;
    const subBg=isSelected?'var(--blue-light)':'transparent';
    const subColor=isSelected?'var(--blue)':'var(--text2)';
    sidebarItems+=`<button onclick="navSelect('${enc}','all')" style="width:calc(100% - 12px);display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:none;background:${subBg};color:${subColor};font-size:13px;font-weight:${isSelected?'600':'400'};cursor:pointer;text-align:left;border-radius:6px;margin:0 6px 2px;font-family:'DM Sans',sans-serif;">
        <span style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s}">${shortName}</span></span>
        <span style="font-size:11px;background:${isSelected?'var(--blue)':'var(--surface2)'};color:${isSelected?'white':'var(--text3)'};padding:1px 6px;border-radius:999px;flex-shrink:0;margin-left:3px;">${totalForSub}</span>
      </button>`;
  });

  const filtered=_getFilteredItems(items);
  const totalPages=Math.ceil(filtered.length/ITEMS_PER_PAGE);
  const pageItems=filtered.slice((S._navPage-1)*ITEMS_PER_PAGE,S._navPage*ITEMS_PER_PAGE);
  let contentTitle='全部考试';
  const _typeLabel={choice:'MCQ',mcq:'MCQ',frq:'FRQ',fill:'填空（数字）',fill_text:'填空（文字）',mixed:'🔀 混合',toefl:'🎧 TOEFL iBT',ielts:'🇬🇧 IELTS',java:'☕ Java 代码题'};
  const _typeSuffix=S._navType!=='all'?` · ${_typeLabel[S._navType]||''}`:'' ;
  if(S._navSubject==='__pending__')contentTitle='待完成'+_typeSuffix;
  else if(S._navSubject==='__favorites__')contentTitle='⭐ 已收藏';
  else if(S._navSubject==='__homework__')contentTitle='📚 作业'+_typeSuffix;
  else if(S._navSubject==='__exam__')contentTitle='📝 考试'+_typeSuffix;
  else if(S._navSubject&&S._navSubject.startsWith('__course__')){contentTitle='📘 '+((S._courseNames||{})[S._navSubject.slice(10)]||'课程');}
  else if(S._navSubject&&S._navSubject.startsWith('__unit__')){const u=(S._unitNames||{})[S._navSubject.slice(8)];contentTitle=u?`📄 ${u.course} · ${u.name}`:'单元';}
  else if(S._navSubject){const decoded=decodeURIComponent(S._navSubject);contentTitle=decoded+_typeSuffix;}
  const cardsHtml=pageItems.length===0?`<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">暂无考试</div></div>`:`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">${pageItems.map(({studentKey:sk,exam,record:rec})=>_renderExamCard(sk,exam,rec)).join('')}</div>`;
  const paginationHtml=compactPagination(S._navPage,totalPages,'navPage');
  cont.innerHTML=`
    <div style="display:flex;gap:0;min-height:calc(100vh - 54px);">
      <div style="width:210px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;background:var(--surface);position:sticky;top:54px;height:calc(100vh - 54px);">
        <div style="padding:16px 14px 12px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:var(--blue-light);color:var(--blue);font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${studentName.trim()[0]?.toUpperCase()}</div>
            <div style="min-width:0;"><div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${studentName}</div><div style="font-size:11px;color:var(--text3);">${totalDone}/${items.length} 完成</div></div>
          </div>
        </div>
        <div style="padding:8px 0 12px;">${sidebarItems}</div>
      </div>
      <div style="flex:1;padding:20px 28px;overflow-y:auto;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:600;">${contentTitle}</div>
          <div style="font-size:12px;color:var(--text3);">${filtered.length} 场${totalPages>1?` · 第${S._navPage}/${totalPages}页`:''}</div>
        </div>
        <div id="exam-cards-content">${cardsHtml}</div>
        ${paginationHtml}
      </div>
    </div>`;
}

function _filterByNavType(arr,navType){
  if(navType==='all')return arr;
  const typeMap={choice:'choice',mcq:'choice',frq:'frq',fill:'fill',fill_text:'fill_text',mixed:'mixed',toefl:'toefl',ielts:'ielts',java:'java'};
  const t=typeMap[navType];
  if(!t)return arr;
  return arr.filter(i=>(i.exam.exam_type||'choice')===t);
}
function _getFilteredItems(items){
  let filtered=[...items];
  if(S._navSubject==='__pending__'){
    filtered=filtered.filter(i=>!i.record&&i.exam.is_active);
    filtered=_filterByNavType(filtered,S._navType);
  } else if(S._navSubject==='__favorites__'){
    filtered=filtered.filter(i=>S._favorites.has(i.exam.id));
  } else if(S._navSubject==='__homework__'){
    filtered=filtered.filter(i=>i.exam.is_homework===1||i.exam.is_homework===true);
    filtered=_filterByNavType(filtered,S._navType);
  } else if(S._navSubject==='__exam__'){
    filtered=filtered.filter(i=>!i.exam.is_homework);
    filtered=_filterByNavType(filtered,S._navType);
  } else if(S._navSubject&&S._navSubject.startsWith('__course__')){
    const cid=S._navSubject.slice(10);
    filtered=filtered.filter(i=>i.exam.course_id===cid);
  } else if(S._navSubject&&S._navSubject.startsWith('__unit__')){
    const uid=S._navSubject.slice(8);
    filtered=filtered.filter(i=>i.exam.unit_id===uid);
  } else if(S._navSubject){
    const decoded=decodeURIComponent(S._navSubject);
    filtered=filtered.filter(i=>i.exam.subject===decoded);
    filtered=_filterByNavType(filtered,S._navType);
  }
  // Unfinished homework is the student's first priority. Inside each group,
  // keep the newest activity first so a just-finished exam stays near the top.
  const activityTime=i=>String(i.record?.created_at||i.exam?.created_at||i.exam?.id||'');
  const pendingHomework=i=>!i.record&&i.exam?.is_active&&(i.exam?.is_homework===1||i.exam?.is_homework===true);
  filtered.sort((a,b)=>Number(pendingHomework(b))-Number(pendingHomework(a))||activityTime(b).localeCompare(activityTime(a)));
  return filtered;
}

function _renderExamCard(sk,exam,rec){
  const isPending=!rec&&exam.is_active;
  const isHomework=exam.is_homework===1||exam.is_homework===true;
  const isPriv=exam.is_private===1||exam.is_private===true;
  const isMixed=exam.exam_type==='mixed';
  const examTypeLabel=exam.exam_type==='frq'?'FRQ':exam.exam_type==='fill'?'填空（数字）':exam.exam_type==='fill_text'?'填空（文字）':exam.exam_type==='toefl'?'🎧 TOEFL iBT':exam.exam_type==='ielts'?'🇬🇧 IELTS 分层模考':exam.exam_type==='java'?'☕ Java 代码题':isMixed?'🔀 混合':'MCQ';
  const isFav=S._favorites.has(exam.id);
  const unitBadge=exam.unit_name?`<span class="badge badge-green" style="font-size:10px;">📁 ${exam.unit_name}</span>`:'';
  const favBtn=`<button onclick="toggleFavorite('${exam.id}',event)" title="${isFav?'取消收藏':'收藏'}" style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:16px;padding:2px 4px;line-height:1;opacity:${isFav?1:0.35};transition:opacity 0.15s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity='${isFav?1:0.35}'">${isFav?'⭐':'☆'}</button>`;
  if(rec){
    const isFrq=exam.exam_type==='frq';const isToefl=exam.exam_type==='toefl'||exam.exam_type==='ielts';const hasManual=!isFrq&&!!(rec.has_manual);
    const needsGrading=isFrq||hasManual;
    const isGraded=needsGrading?(rec.frq_score!==null&&rec.frq_score!==undefined):true;
    // 纯 FRQ：score 恒为 0，实际得分是 frq_score；混合含人工题：合计 = 自动分 + 人工分
    const totalScore=needsGrading&&isGraded?(rec.score+(rec.frq_score||0)):rec.score;
    // 混合卷的 rec.total 已包含自动题 + 人工题；frq_max_score 只代表人工部分，不能当整卷满分。
    const maxScore=isFrq?(rec.frq_max_score??rec.total):rec.total;
    const objectiveMax=isToefl?(rec.objective_total??Math.max(0,rec.total-(rec.frq_max_score||0))):rec.total;
    const pct=isToefl&&!isGraded?(objectiveMax?Math.round(rec.score/objectiveMax*100):0):needsGrading?(isGraded?Math.round(totalScore/maxScore*100):0):Math.round(rec.score/rec.total*100);
    const{fg}=scoreColor(pct);
    return`<div class="card mb-2" style="border-left:3px solid ${!isGraded?'var(--amber)':'var(--green)'};">
      <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div class="flex gap-2 mb-1" style="flex-wrap:wrap;align-items:center;">
            <span style="font-weight:600;">${exam.name}</span>
            <span class="badge badge-blue">${exam.subject}</span>
            <span class="badge badge-gray" style="font-size:10px;">${examTypeLabel}</span>
            ${isHomework?'<span class="badge badge-gray" style="font-size:10px;">📚 作业</span>':''}
            ${unitBadge}
            ${isPriv?'<span class="badge badge-gray" style="font-size:10px;">🔒 隐私</span>':''}
            ${!isGraded?`<span class="badge badge-amber">⏳ 等待批改</span>`:`<span class="badge badge-green">✓ 已完成</span>`}
            ${favBtn}
          </div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px;">
            ${needsGrading?isGraded?`<span style="font-size:26px;font-weight:700;letter-spacing:-1px;color:var(--blue);">${totalScore}</span><span style="font-size:15px;color:var(--text2);margin-left:4px;">/ ${maxScore} 分</span>`:isToefl?`<span style="font-size:26px;font-weight:700;letter-spacing:-1px;color:${fg};">${rec.score}</span><span style="font-size:13px;color:var(--text2);">/ ${objectiveMax} 客观题分 · 主观题待批改</span>`:`<span style="font-size:14px;color:var(--amber);">老师批改后显示成绩</span>`:`<span style="font-size:26px;font-weight:700;letter-spacing:-1px;color:${fg};">${pct}%</span><span style="font-size:13px;color:var(--text2);">${rec.score} / ${rec.total} 分</span>`}
          </div>
          ${rec.created_at?`<div style="font-size:11px;color:var(--text3);margin-top:4px;">📅 提交于 ${rec.created_at}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          ${isPriv?`<span style="font-size:11px;color:var(--text3);padding:4px 8px;background:var(--surface2);border-radius:var(--radius-sm);">🔒 隐私模式 · 仅显示成绩</span>`:`<button class="btn btn-sm" onclick="viewMyResult('${sk.id}','${exam.id}')">查看答卷</button><button class="btn btn-sm" onclick="startPracticeMode('${sk.id}','${exam.id}')" style="font-size:11px;color:var(--text3);">再练一遍</button>`}
        </div>
      </div>
    </div>`;
  } else if(isPending){
    const hasProgress=exam._hasProgress;
    const btnLabel=isHomework&&hasProgress?'继续作答 →':isHomework?'开始作业 →':'开始考试 →';
    const btnColor=isHomework?'var(--blue)':'var(--amber)';
    const borderColor=isHomework?'var(--blue)':'var(--amber)';
    return`<div class="card card-hover mb-2" style="border-left:3px solid ${borderColor};">
      <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div class="flex gap-2 mb-1" style="flex-wrap:wrap;align-items:center;">
            <span style="font-weight:600;">${exam.name}</span>
            <span class="badge badge-blue">${exam.subject}</span>
            <span class="badge badge-gray" style="font-size:10px;">${examTypeLabel}</span>
            ${isHomework?'<span class="badge badge-blue" style="font-size:10px;">📚 作业</span>':'<span class="badge badge-amber" style="font-weight:600;">⚡ 考试</span>'}
            ${unitBadge}
            ${isPriv?'<span class="badge badge-gray" style="font-size:10px;">🔒 隐私</span>':''}
            ${isHomework&&hasProgress?'<span class="badge badge-green" style="font-size:10px;">进行中</span>':''}
            ${exam.time_limit_minutes?`<span class="badge badge-gray">⏱ ${exam.time_limit_minutes} 分钟</span>`:''}
            ${favBtn}
          </div>
          ${exam.description?`<p style="font-size:13px;color:var(--text2);margin-top:4px;">${exam.description}</p>`:''}
        </div>
        <button class="btn btn-primary" style="background:${btnColor};border-color:${btnColor};" onclick="startExamWithKey('${sk.id}','${exam.id}')">${btnLabel}</button>
      </div>
    </div>`;
  } else{
    return`<div class="card mb-2" style="opacity:0.5;"><div class="flex gap-2" style="flex-wrap:wrap;"><span style="font-weight:600;">${exam.name}</span><span class="badge badge-blue">${exam.subject}</span><span class="badge badge-gray" style="font-size:10px;">${examTypeLabel}</span><span class="badge badge-gray">未开放</span></div></div>`;
  }
}

function toggleFavorite(examId,event){
  if(event)event.stopPropagation();
  if(S._favorites.has(examId))S._favorites.delete(examId);else S._favorites.add(examId);
  try{localStorage.setItem('fav_'+S.student.name,JSON.stringify([...S._favorites]));}catch(e){}
  _renderStudentLayout(S.student.name,_studentExamItems);
}
function navSelect(subjectEncoded,type){S._navSubject=subjectEncoded;S._navType=type;S._navPage=1;if(subjectEncoded)S._navExpanded[subjectEncoded]=true;_renderStudentLayout(S.student.name,_studentExamItems);}
function navToggleCourse(courseId){const enc='__course__'+courseId;S._navExpanded[enc]=!S._navExpanded[enc];S._navSubject=enc;S._navType='all';S._navPage=1;_renderStudentLayout(S.student.name,_studentExamItems);}
function navSelectPending(){S._navSubject='__pending__';S._navType='all';S._navPage=1;_renderStudentLayout(S.student.name,_studentExamItems);}

// helper: 生成某节点下的类型子项 HTML
function _makeTypeSubItems(enc,typeCounts,activeEnc,activeType,accentVar){
  const allTypes=[['choice','选择题 MCQ'],['frq','问答题 FRQ'],['fill','填空（数字）'],['fill_text','填空（文字）'],['mixed','🔀 混合'],['toefl','🎧 TOEFL iBT'],['ielts','🇬🇧 IELTS 分层模考'],['java','☕ Java 代码题']];
  return allTypes.filter(([t])=>(typeCounts[t]||0)>0).map(([t,label])=>{
    const isA=activeEnc===enc&&activeType===t;
    const bg=isA?`var(${accentVar}-light)`:'transparent';
    const color=isA?`var(${accentVar})`:'var(--text3)';
    const fw=isA?'600':'400';
    return`<button onclick="navSelect('${enc}','${t}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border:none;background:${bg};color:${color};font-size:12px;cursor:pointer;border-radius:5px;font-family:'DM Sans',sans-serif;font-weight:${fw};">
      <span>${label}</span><span style="font-size:11px;">${typeCounts[t]||0}</span>
    </button>`;
  }).join('');
}
function navToggleSubject(subjectEncoded){
  if(S._navSubject===subjectEncoded){S._navExpanded[subjectEncoded]=!S._navExpanded[subjectEncoded];_renderStudentLayout(S.student.name,_studentExamItems);}
  else{S._navExpanded[subjectEncoded]=true;if(subjectEncoded==='__pending__'){navSelectPending();}else{navSelect(subjectEncoded,'all');}}
}
function navPage(p){const items=_getFilteredItems(_studentExamItems);const totalPages=Math.ceil(items.length/ITEMS_PER_PAGE);if(p<1||p>totalPages)return;S._navPage=p;_renderStudentLayout(S.student.name,_studentExamItems);}

// ── 查看答卷 / 开始考试 ──────────────────────────────────
async function viewMyResult(studentKeyId,examId){
  const examItem=_studentExamItems.find(i=>i.exam.id===examId);
  if(examItem?.exam?.is_private){toast('🔒 隐私模式考试不显示答卷');return;}
  const btn=document.querySelector(`button[onclick*="${studentKeyId}"][onclick*="viewMyResult"]`);
  if(btn){if(btn.disabled)return;btn.disabled=true;btn.textContent='加载中…';}
  try{
    const[rec,questions]=await Promise.all([
      api('GET','/api/records',{student_key_id:studentKeyId}),
      api('GET',`/api/questions/${examId}`,{role:'student_result',student_key_id:studentKeyId})
    ]);
    if(!rec||!examItem){toast('加载失败，请重试');return;}
    const correctAnswers=rec.correct_answers||{};
    questions.forEach((q,i)=>{q.correct_answer=correctAnswers[i]??null;});
    S.activeExam={...examItem.exam,questionsList:questions};
    S.answers=rec.answers_data||{};
    const _pf=v=>{if(!v)return{};if(typeof v==='object')return v;try{return JSON.parse(v);}catch(e){return{};}};
    S._frqFeedback=_pf(rec.frq_feedback);S._frqQScores=_pf(rec.frq_q_scores);
    S.frqAnswers=_pf(rec.frq_answers);S._frqMaxScore=rec.frq_max_score??rec.total;
    S.examType=examItem.exam.exam_type||'choice';S._wrongOnlyMode=false;
    const _hasManualRec=!!(rec.has_manual);
    const _manualGraded=_hasManualRec&&rec.frq_score!==null&&rec.frq_score!==undefined;
    const displayScore=S.examType==='frq'?(rec.frq_score??null):(_manualGraded?(rec.score+(rec.frq_score||0)):rec.score);
    showResults(displayScore,rec.total,questions);
  } catch(e){toast('加载失败，请重试');if(btn){btn.disabled=false;btn.textContent='查看答卷';}}
}

function fmtDur(sec){
  if(sec==null||sec===''||isNaN(sec))return '—';
  sec=Math.max(0,Math.round(Number(sec)));
  if(sec<60)return sec+'秒';
  const m=Math.floor(sec/60),s=sec%60;
  return s?`${m}分${s}秒`:`${m}分`;
}
function _calcDuration(){
  try{
    const ex=S.activeExam;if(!ex)return null;
    const lim=ex.time_limit_minutes?ex.time_limit_minutes*60:0;
    if(lim>0){const used=lim-(S._timerSecondsLeft||0);return Math.max(0,Math.min(lim,Math.round(used)));}
    const sk='nebsStart_'+ex.id+'_'+(S.student&&S.student.studentKeyId);
    const st=parseInt(localStorage.getItem(sk)||'0');
    if(!st||isNaN(st))return null;
    return Math.max(0,Math.round((Date.now()-st)/1000));
  }catch(e){return null;}
}
async function startExamWithKey(studentKeyId,examId){
  const startRequestId=(S._examStartRequestId||0)+1;S._examStartRequestId=startRequestId;
  const isLatestStart=()=>S._examStartRequestId===startRequestId;
  const resetStartBtn=btn=>{if(btn){btn.disabled=false;btn.textContent='开始考试 →';}};
  const btn=document.querySelector(`button[onclick*="${studentKeyId}"][onclick*="startExamWithKey"]`);
  if(btn){btn.disabled=true;btn.textContent='加载中…';}
  const existing=await api('GET','/api/records',{student_key_id:studentKeyId});
  if(!isLatestStart()){resetStartBtn(btn);return;}
  if(existing){toast('你已完成此考试，不能重复作答');if(btn){btn.disabled=false;btn.textContent='开始考试 →';}return;}
  const items=await api('GET','/api/student/exams',{student_name:S.student.name});
  if(!isLatestStart()){resetStartBtn(btn);return;}
  const item=items.find(i=>i.exam.id===examId);
  const questions=await api('GET',`/api/questions/${examId}`,{role:'student_result'});
  if(!isLatestStart()){resetStartBtn(btn);return;}
  if(!item?.exam||!questions?.length){toast('考试题目为空，请联系老师');resetStartBtn(btn);return;}
  const isHomework=item.exam.is_homework===1||item.exam.is_homework===true;
  if(S._frqAutosaveTimer){clearTimeout(S._frqAutosaveTimer);S._frqAutosaveTimer=null;}
  sessionStorage.removeItem('examState');sessionStorage.removeItem('examState_frq');
  S.student={...S.student,studentKeyId,examId};
  sessionStorage.setItem('student',JSON.stringify(S.student));
  S.activeExam={...item.exam,questionsList:questions};
  S.examType=item.exam.exam_type||'choice';
  S.currentQIdx=0;S.answers={};S.frqAnswers={};S.eliminatedChoices={};S.flaggedQuestions=new Set();S._lastAntiCheatTime=0;
  S._audioPlayed={};S._audioProg={};
  S._isHomeworkMode=isHomework;
  let _restoredProgress=false;
  try{
    const prog=await api('GET','/api/homework-progress',{student_key_id:studentKeyId,exam_id:examId});
    if(prog){
      const fa=typeof prog.frq_answers==='string'?JSON.parse(prog.frq_answers||'{}'):(prog.frq_answers||{});
      const ad=typeof prog.answers_data==='string'?JSON.parse(prog.answers_data||'{}'):(prog.answers_data||{});
      const hasProg=Object.keys(fa).length||Object.keys(ad).length;
      _restoredProgress=!!hasProg;
      S.frqAnswers=fa;S.answers=ad;if(prog.current_q)S.currentQIdx=prog.current_q;
      if(hasProg&&!isHomework)setTimeout(()=>toast('已恢复你上次未完成的作答，可继续 ✓'),500);
    }
  }catch(e){}
  try{const tsData=await api('GET','/api/records/tab-switches',{student_key_id:studentKeyId});S.tabSwitches=tsData.tab_switches||0;}catch(e){S.tabSwitches=0;}
  try{const _stk='nebsStart_'+examId+'_'+studentKeyId;if(!localStorage.getItem(_stk))localStorage.setItem(_stk,String(Date.now()));}catch(e){}
  saveExamState();showScreen('exam');renderQuestion(S.currentQIdx,true);
  const exitBtn=document.getElementById('exit-exam-btn');if(exitBtn)exitBtn.style.display=isHomework?'':'none';
  if(isHomework){stopAntiCheat();}else{startAntiCheat();}
  startHeartbeat();
  if(item.exam.time_limit_minutes){
    const _lim=item.exam.time_limit_minutes*60;
    if(isHomework){
      // 作业：暂停式计时，存"剩余秒数"，离开/关闭都不扣时间，下次接着走
      const _hk='nebsHwTime_'+examId+'_'+studentKeyId;
      let _rem=parseInt(localStorage.getItem(_hk));
      if(isNaN(_rem)||!_restoredProgress)_rem=_lim;
      startTimer(Math.max(0,Math.min(_lim,_rem)));
    } else {
      // 考试：墙钟截止时间戳，离开/关闭时间照扣（防作弊）
      const _dk='nebsDL_'+examId+'_'+studentKeyId;
      let _dl=parseInt(localStorage.getItem(_dk)||'0');
      if(!_dl||isNaN(_dl)||!_restoredProgress){_dl=Date.now()+_lim*1000;try{localStorage.setItem(_dk,String(_dl));}catch(e){}}
      const _rem=Math.round((_dl-Date.now())/1000);
      startTimer(_rem>0?_rem:0);
    }
  }
  else{stopTimer();document.getElementById('exam-timer').style.display='none';}
}

async function startPracticeMode(studentKeyId,examId){
  const items=_studentExamItems,item=items.find(i=>i.exam.id===examId);
  if(item?.exam?.is_private){toast('🔒 隐私模式考试不支持练习');return;}
  const questions=await api('GET',`/api/questions/${examId}`,{role:'practice',student_key_id:studentKeyId});
  if(!item?.exam||!questions?.length||questions.error){toast('加载失败');return;}
  S.activeExam={...item.exam,questionsList:questions};
  S.examType=item.exam.exam_type||'choice';
  S.currentQIdx=0;S.answers={};S.frqAnswers={};S.eliminatedChoices={};S.flaggedQuestions=new Set();
  S._audioPlayed={};S._audioProg={}; // 练习模式重置听力播放限制
  S._isPracticeMode=true;S._isHomeworkMode=false;
  clearExamState();showScreen('exam');renderQuestion(0,true);stopAntiCheat();
  const _exitBtn=document.getElementById('exit-exam-btn');if(_exitBtn)_exitBtn.style.display='none';
  stopTimer();document.getElementById('exam-timer').style.display='none';
  const navInfo=document.getElementById('exam-nav-info');
  if(navInfo)navInfo.innerHTML=`${item.exam.name} · 练习模式 <span style="background:var(--blue-light);color:var(--blue);font-size:11px;padding:2px 8px;border-radius:999px;margin-left:6px;font-weight:500;">不计成绩</span>`;
}

// ── 心跳/计时 ────────────────────────────────────────────
function startHeartbeat(){
  stopHeartbeat();if(!S.student?.studentKeyId||!S.activeExam)return;
  const send=()=>api('POST','/api/heartbeat',{student_key_id:S.student.studentKeyId,student_name:S.student.name,exam_id:S.activeExam.id,exam_name:S.activeExam.name,tab_switches:S.tabSwitches||0,current_q:S.currentQIdx+1,total_q:S.activeExam.questionsList?.length||0,timer_left:S._timerSecondsLeft||0}).catch(()=>{});
  send();S._heartbeatInterval=setInterval(send,30000);
}
function stopHeartbeat(keyId){
  if(S._heartbeatInterval){clearInterval(S._heartbeatInterval);S._heartbeatInterval=null;}
  const id=keyId||S.student?.studentKeyId;if(id)api('DELETE','/api/heartbeat',{student_key_id:id}).catch(()=>{});
}
function startTimer(totalSeconds){
  stopTimer();S._timerSecondsLeft=totalSeconds;updateTimerDisplay();
  document.getElementById('exam-timer').style.display='flex';
  S._timerInterval=setInterval(()=>{S._timerSecondsLeft--;saveExamState();updateTimerDisplay();if(S._timerSecondsLeft<=0){stopTimer();toast('⏰ 时间到！正在自动提交…');setTimeout(()=>autoSubmitExam(),800);}},1000);
}
function stopTimer(){if(S._timerInterval){clearInterval(S._timerInterval);S._timerInterval=null;}}
function updateTimerDisplay(){
  const el=document.getElementById('exam-timer-text');if(!el)return;
  const m=Math.floor(S._timerSecondsLeft/60),s=S._timerSecondsLeft%60;
  el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const timerEl=document.getElementById('exam-timer');
  if(timerEl)timerEl.style.color=S._timerSecondsLeft<=60?'var(--red)':S._timerSecondsLeft<=300?'var(--amber)':'var(--text)';
}
async function autoSubmitExam(){
  if(S._submitting)return;S._submitting=true; // 防止与手动提交撞车（重复 POST 报「已提交过」）
  const answersSnapshot={...S.answers};
  stopTimer();stopAntiCheat();stopHeartbeat();clearExamState();
  const exam=S.activeExam,qs=exam.questionsList;
  S.answers=answersSnapshot;
  const result=await api('POST','/api/records',{exam_id:exam.id,student_key_id:S.student.studentKeyId,student_name:S.student.name,answers_data:answersSnapshot,frq_answers:S.frqAnswers||{},tab_switches:S.tabSwitches||0,duration_seconds:_calcDuration()});
  S._submitting=false;
  if(result.error){toast('提交失败：'+result.error);return;}
  const questionsForDisplay=qs.map((q,i)=>({...q,correct_answer:result.correct_answers?result.correct_answers[i]:undefined}));
  if(result.correct_answers){questionsForDisplay.forEach((q,i)=>{S.activeExam.questionsList[i].correct_answer=result.correct_answers[i];});}
  _updateLocalRecord(exam.id,S.student.studentKeyId,result);
  try{ if(result.collection&&result.collection.unlocked&&window.NEBSReward){ const _cs=result.collection.cards||[result.collection]; for(const _it of _cs){ await NEBSReward.play(_it); } _stuCollectionOnUnlock(); } }catch(e){}
  showResults(result.score,result.total,questionsForDisplay);
}

// ── 防切屏 ────────────────────────────────────────────────
function _antiCheatEventId(){
  try{if(crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}
  return 'ac_'+Date.now()+'_'+Math.random().toString(36).slice(2);
}
function _logAntiCheatEvent(source,meta={}){
  if(!S.student?.studentKeyId||!S.activeExam?.id)return Promise.resolve(null);
  return api('POST','/api/records/tab-switches',{
    student_key_id:S.student.studentKeyId,exam_id:S.activeExam.id,event_id:_antiCheatEventId(),source,
    duration_ms:meta.duration_ms||0,details:{hidden:document.hidden,has_focus:document.hasFocus?document.hasFocus():null,fullscreen:!!(document.fullscreenElement||document.webkitFullscreenElement),...meta}
  }).catch(()=>null);
}
function triggerAntiCheat(source,meta={}){
  if(!document.getElementById('screen-exam')?.classList.contains('active'))return;
  const now=Date.now();if(S._lastAntiCheatTime&&now-S._lastAntiCheatTime<1500)return;
  S._lastAntiCheatTime=now;S.tabSwitches=(S.tabSwitches||0)+1;saveExamState();
  if(S.student?.studentKeyId){
    _logAntiCheatEvent(source,meta).then(r=>{if(r&&Number.isFinite(Number(r.tab_switches)))S.tabSwitches=Math.max(S.tabSwitches,Number(r.tab_switches));});
    api('POST','/api/heartbeat',{student_key_id:S.student.studentKeyId,student_name:S.student.name,exam_id:S.activeExam?.id,exam_name:S.activeExam?.name,tab_switches:S.tabSwitches}).catch(()=>{});
  }
  _showAntiCheatOverlay();
}
function _showAntiCheatOverlay(){
  const overlay=document.getElementById('anticheat-overlay');
  const msgEl=document.getElementById('anticheat-msg'),countEl=document.getElementById('anticheat-count'),btnEl=document.getElementById('anticheat-btn');
  if(!overlay)return;
  countEl.textContent=S.tabSwitches;
  if(S.tabSwitches>=3){msgEl.textContent='你已离开考试页面 3 次，系统正在自动提交你的答卷…';btnEl.style.display='none';overlay._shouldShow=true;overlay.style.display='flex';setTimeout(()=>autoSubmitExam(),2000);return;}
  msgEl.textContent=`检测到你离开了考试页面（第 ${S.tabSwitches} 次），再离开 ${3-S.tabSwitches} 次将自动提交答卷。`;
  btnEl.style.display='';btnEl.textContent='我知道了，继续答题';
  btnEl.onclick=()=>{overlay._shouldShow=false;overlay.style.display='none';};
  overlay._shouldShow=true;overlay.style.display='flex';
}
function ensureOverlay(){
  if(!document.getElementById('screen-exam')?.classList.contains('active'))return;
  const overlay=document.getElementById('anticheat-overlay');
  if(overlay&&overlay._shouldShow&&window.getComputedStyle(overlay).display==='none')overlay.style.display='flex';
}
// Safari 的 webkitRequestFullscreen/webkitExitFullscreen 不返回 Promise，必须 try+判空，否则 .catch 抛 TypeError
function requestExamFullscreen(){const el=document.documentElement;const req=el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen;if(req){try{const p=req.call(el);if(p&&p.catch)p.catch(()=>{});}catch(e){}}}
function exitExamFullscreen(){const exit=document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen;if(exit&&(document.fullscreenElement||document.webkitFullscreenElement)){try{const p=exit.call(document);if(p&&p.catch)p.catch(()=>{});}catch(e){}}}
function startAntiCheat(){
  stopAntiCheat();
  // 触屏设备（iPad / 手机）：软键盘、原生下拉选择框会触发 blur，iOS 又不支持网页全屏，
  // 这些都会造成「假切屏」。触屏设备只保留 visibilitychange，并加入停留时长判定。
  const coarse=(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches)||navigator.maxTouchPoints>1;
  S._acTouch=coarse;S._acHiddenAt=0;S._acBlurAt=0;
  // visibilitychange 是浏览器能提供的最可靠切屏证据。持续 ≥3 秒才计数，
  // 过滤系统通知、地址栏交互以及页面瞬时抖动。
  S._acVisibility=()=>{
    if(document.hidden){S._acHiddenAt=Date.now();}
    else if(S._acHiddenAt){const away=Date.now()-S._acHiddenAt;S._acHiddenAt=0;if(away>=3000)triggerAntiCheat('visibility',{duration_ms:away});else _logAntiCheatEvent('visibility_short',{duration_ms:away});}
  };
  document.addEventListener('visibilitychange',S._acVisibility);
  if(!coarse){
    // blur 和退出全屏可能由系统通知、浏览器控件或电脑唤醒引起，只记录、不计切屏。
    S._acBlur=()=>{S._acBlurAt=Date.now();};
    S._acFocus=()=>{if(S._acBlurAt){const away=Date.now()-S._acBlurAt;S._acBlurAt=0;_logAntiCheatEvent('blur',{duration_ms:away});}};
    window.addEventListener('blur',S._acBlur);window.addEventListener('focus',S._acFocus);
    S._acFullscreen=()=>{const isFS=!!(document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement);if(!isFS&&document.getElementById('screen-exam')?.classList.contains('active')){_logAntiCheatEvent('fullscreen_exit');setTimeout(()=>requestExamFullscreen(),2500);}};
    document.addEventListener('fullscreenchange',S._acFullscreen);document.addEventListener('webkitfullscreenchange',S._acFullscreen);
    requestExamFullscreen();
  }
  S._overlayGuard=setInterval(ensureOverlay,500);
}
function stopAntiCheat(){
  if(S._acVisibility){document.removeEventListener('visibilitychange',S._acVisibility);S._acVisibility=null;}
  if(S._acBlur){window.removeEventListener('blur',S._acBlur);S._acBlur=null;}
  if(S._acFocus){window.removeEventListener('focus',S._acFocus);S._acFocus=null;}
  S._acBlurAt=0;S._acHiddenAt=0;
  if(S._overlayGuard){clearInterval(S._overlayGuard);S._overlayGuard=null;}
  if(S._acFullscreen){document.removeEventListener('fullscreenchange',S._acFullscreen);document.removeEventListener('webkitfullscreenchange',S._acFullscreen);S._acFullscreen=null;}
  // 收起防切屏警告遮罩，避免提交后盖住成绩页
  const _acOverlay=document.getElementById('anticheat-overlay');
  if(_acOverlay){_acOverlay._shouldShow=false;_acOverlay.style.display='none';}
  exitExamFullscreen();
}

function toggleFlag(idx){
  if(S.flaggedQuestions.has(idx))S.flaggedQuestions.delete(idx);else S.flaggedQuestions.add(idx);
  saveExamState();
  const flagBtn=document.getElementById('flag-btn');
  if(flagBtn){
    const flagged=S.flaggedQuestions.has(idx);
    flagBtn.innerHTML=flagged?`<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 已标记，点击取消`:`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 标记此题`;
    flagBtn.style.background=flagged?'var(--amber-light)':'';flagBtn.style.color=flagged?'var(--amber)':'';flagBtn.style.borderColor=flagged?'var(--amber)':'';
  }
  _updateNavGrid(idx);
}

const NAV_PAGE_SIZE=40;
if(S._navGridPage===undefined)S._navGridPage=0;
function _makeNavGrid(qs,currentIdx){
  const total=qs.length,totalPages=Math.ceil(total/NAV_PAGE_SIZE),page=S._navGridPage;
  const start=page*NAV_PAGE_SIZE,end=Math.min(start+NAV_PAGE_SIZE,total);
  const btns=qs.slice(start,end).map((_,ii)=>{
    const i=start+ii;
    const isCurrent=i===currentIdx,isAnswered=S.answers[i]!==undefined,isFlagged=S.flaggedQuestions.has(i);
    let bg,color,border,extra='';
    if(isCurrent){bg='var(--blue)';color='white';border='var(--blue)';}
    else if(isFlagged){bg='var(--amber-light)';color='var(--amber)';border='var(--amber)';extra='<span style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;background:var(--amber);border-radius:50%;"></span>';}
    else if(isAnswered){bg='var(--green-light)';color='var(--green)';border='var(--green)';}
    else{bg='var(--surface)';color='var(--text3)';border='var(--border-md)';}
    return`<button onclick="renderQuestion(${i})" style="position:relative;width:36px;height:36px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid ${border};background:${bg};color:${color};display:inline-flex;align-items:center;justify-content:center;transition:all 0.1s;">${i+1}${extra}</button>`;
  }).join('');
  const pageNav=totalPages>1?`<div style="width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <button onclick="navGridPage(${page-1})" ${page===0?'disabled':''} style="padding:2px 8px;font-size:11px;border:1px solid var(--border-md);background:var(--surface);border-radius:4px;cursor:pointer;color:var(--text2);">← 上页</button>
      <span style="font-size:11px;color:var(--text3);">${page+1} / ${totalPages}</span>
      <button onclick="navGridPage(${page+1})" ${page>=totalPages-1?'disabled':''} style="padding:2px 8px;font-size:11px;border:1px solid var(--border-md);background:var(--surface);border-radius:4px;cursor:pointer;color:var(--text2);">下页 →</button>
    </div>`:'';
  return pageNav+btns;
}
function navGridPage(p){const total=S.activeExam?.questionsList?.length||0;const totalPages=Math.ceil(total/NAV_PAGE_SIZE);if(p<0||p>=totalPages)return;S._navGridPage=p;_updateNavGrid(S.currentQIdx);}
function _updateNavGrid(currentIdx){const navGrid=document.getElementById('exam-nav-grid');if(navGrid&&S.activeExam)navGrid.innerHTML=_makeNavGrid(S.activeExam.questionsList,currentIdx??S.currentQIdx);}

// ── 答题界面 ──────────────────────────────────────────────
function renderQuestion(idx,skipPreviousSave=false){
  // 同一张试卷内换题时保存上一题；首次打开另一张试卷时，绝不能读取 DOM 中残留的旧答题框。
  if(S.activeExam&&!skipPreviousSave){
    const prevQ=S.activeExam.questionsList?.[S.currentQIdx];
    const prevQt=getQType(prevQ||{},S.activeExam);
    const _prevTa=document.getElementById('frq-answer-input');
    if(_prevTa&&prevQt==='frq')S.frqAnswers[S.currentQIdx]=_prevTa.value;
    if(prevQt==='fill'||prevQt==='fill_text')_syncFillInputs(S.currentQIdx);
    // 换题时主动停掉旧音频（带标记，避免「禁止暂停」逻辑把它续播）
    const _oldAudio=document.getElementById('exam-audio');
    if(_oldAudio){_oldAudio._stopped=true;try{_oldAudio.pause();}catch(e){}}
  }
  S._navGridPage=Math.floor(idx/NAV_PAGE_SIZE);S.currentQIdx=idx;saveExamState();
  const exam=S.activeExam,qs=exam.questionsList,q=qs[idx];
  const total=qs.length,letters=qLetters(q,exam); // 每题按自己的选项数
  const answered=Object.keys(S.answers).length,flagged=S.flaggedQuestions.has(idx);
  const qt=getQType(q,exam);
  const isFrqLayout=qt==='frq',isFillLayout=qt==='fill'||qt==='fill_text',isFillNumeric=qt==='fill';
  const isEngLeft=qt==='cloze'||qt==='audio_fill'||qt==='audio_choice'||qt==='matching'; // 在左侧主区域作答
  const isReading=qt==='reading';
  const isMixedExam=exam.exam_type==='mixed';
  document.getElementById('exam-nav-info').textContent=`第 ${idx+1} 题 / 共 ${total} 题`;
  document.getElementById('exam-progress-bar').style.width=`${(idx+1)/total*100}%`;
  let qImgs=[];
  if(q.imgs_json){try{qImgs=JSON.parse(q.imgs_json).filter(Boolean);}catch(e){}}
  if(!qImgs.length){if(q.img_url)qImgs.push(q.img_url);if(q.img_url2)qImgs.push(q.img_url2);}
  const imgSrc=qImgs[0]||null,qText=q.question_text||null;
  const navGrid=_makeNavGrid(qs,idx);
  const _cMulti=choiceMulti(q);
  const choiceHtml=_cMulti?_buildMultiChoice(idx,letters,_cMulti):letters.map((l,i)=>buildChoiceBtn(l,i,idx,S.answers[idx]===i,S.eliminatedChoices[idx]?.has(i)||false)).join('');
  const fillVal=Array.isArray(S.answers[idx])?'':(S.answers[idx]??'');
  // 多空填空渲染
  const qBlanks=isFillLayout?getQBlanks(q):null;
  const qManual=isFillLayout?isManualQ(q,qt):false;
  let fillAreaHtml='';
  if(isFillLayout){
    const isLangExam=_isLangSubject(exam.subject);
    const hintTxt=qManual?(isLangExam?'此题由老师人工批改，可输入任意文字':'此题由老师人工批改，可输入坐标、不等式、公式等任意文字'):isFillNumeric?'支持整数、小数（3.14）、分数（1/3）和负数':'只输入英文字母，自动转为小写';
    const headTxt=qManual?'填写答案（老师人工批改）':`填写答案（${isFillNumeric?'数字':'文字'}）`;
    // 语言类科目不显示数学符号工具栏
    const mathBar=isLangExam?'':_mathToolbarHtml();
    if(qBlanks){
      const vals=Array.isArray(S.answers[idx])?S.answers[idx]:[S.answers[idx]??''];
      fillAreaHtml=`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:10px;">${headTxt}</div>${mathBar}`+
        qBlanks.map((b,bi)=>{
          const bPh=b.placeholder||(qManual?(isLangExam?'输入答案…':'可输入坐标、公式等'):isFillNumeric?'如：3.14 或 1/3':'输入英文…');
          const bScore=b.score!=null&&b.score!==1?`<span style="font-size:11px;color:var(--text3);margin-left:6px;">${b.score}分</span>`:'';
          return`<div style="margin-bottom:14px;">
          <div style="font-size:13px;color:var(--text2);margin-bottom:5px;font-weight:500;">${b.label?escapeHtml(b.label):qBlanks.length>1?`空 ${bi+1}`:''}${bScore}</div>
          <input class="fill-blank-input" data-bi="${bi}" type="text" ${(!qManual&&isFillNumeric)?'inputmode="decimal"':''} value="${escapeHtml(String(vals[bi]??''))}"
            oninput="saveBlankAnswer(${idx},${bi},this.value)" onfocus="_lastFillEl=this" placeholder="${escapeHtml(bPh)}"
            autocorrect="off" autocapitalize="none" autocomplete="off" spellcheck="false"
            style="width:100%;padding:12px 14px;border:1.5px solid var(--border-md);border-radius:var(--radius-sm);font-size:16px;font-family:${(!qManual&&isFillNumeric)?"'DM Mono',monospace":"'DM Sans',sans-serif"};background:var(--surface);color:var(--text);" />
        </div>`;}).join('')+
        `<div style="font-size:11px;color:var(--text3);margin-top:4px;">${hintTxt}</div>`;
    } else{
      fillAreaHtml=`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:10px;">${headTxt}</div>${mathBar}
               <input id="fill-answer-input" type="text" ${isFillNumeric?'inputmode="decimal"':''} value="${escapeHtml(String(fillVal))}"
                 oninput="${isFillNumeric?'saveFillAnswer':'saveFillTextAnswer'}(${idx},this.value)" onfocus="_lastFillEl=this" placeholder="${isFillNumeric?'如：3.14 或 1/3':'输入答案文字…'}"
                 style="width:100%;padding:16px;border:1.5px solid var(--border-md);border-radius:var(--radius-sm);font-size:${isFillNumeric?'24':'18'}px;font-family:${isFillNumeric?"'DM Mono',monospace":"'DM Sans',sans-serif"};background:var(--surface);color:var(--text);text-align:center;" />
               <div style="font-size:11px;color:var(--text3);margin-top:10px;text-align:center;">${hintTxt}</div>`;
    }
  }
  const mixedBadge=isMixedExam?`<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:${isFrqLayout?'var(--amber-light)':(isFillLayout||isEngLeft||isReading)?'var(--blue-light)':'var(--surface2)'};color:${isFrqLayout?'var(--amber)':(isFillLayout||isEngLeft||isReading)?'var(--blue)':'var(--text2)'};margin-left:6px;font-weight:500;">${_qtLabel(qt)}</span>`:'';
  const ptsBadge=q.max_score&&q.max_score>1?`<span style="font-size:12px;background:var(--surface2);color:var(--text2);padding:2px 8px;border-radius:999px;font-weight:500;margin-left:6px;">${q.max_score}分</span>`:'';
  // ── 英语题型渲染 ──
  const audioPlayerHtml=q.audio_url?_examAudioHtml(idx):'';
  const _imgsBlock=qImgs.length?qImgs.map((u,ii)=>`<img src="${u}" onclick="_examImgZoom(${idx},${ii})" style="max-width:100%;display:block;margin-bottom:12px;border-radius:6px;cursor:zoom-in;" />`).join(''):'';
  let engLeftHtml=null,engRightHtml=null;
  if(qt==='cloze'||qt==='audio_fill'){
    const segs=clozeSegs(q.question_text||'');
    const vals=Array.isArray(S.answers[idx])?S.answers[idx]:[];
    let bi=0;
    const body=segs.map(s=>{
      if(s.t==='txt')return escapeHtml(s.v);
      const j=bi++;
      const w=Math.max(s.len,2)*13+20;
      return`<input class="cloze-input" data-bi="${j}" maxlength="${Math.max(s.len+5,6)}" value="${escapeHtml(String(vals[j]??''))}" oninput="saveClozeAnswer(${idx},${j},this.value)" placeholder="${'_'.repeat(Math.min(s.len,8))}" autocorrect="off" autocapitalize="none" autocomplete="off" spellcheck="false" style="width:${w}px;padding:2px 4px;border:none;border-bottom:2px solid var(--blue);background:var(--blue-light);border-radius:4px 4px 0 0;font-size:16px;font-family:'DM Mono',monospace;text-align:center;color:var(--text);margin:0 2px;vertical-align:baseline;" />`;
    }).join('');
    engLeftHtml=`<div style="padding:26px 30px;font-size:17px;line-height:2.5;color:var(--text);white-space:pre-wrap;overflow-y:auto;width:100%;height:100%;">${qt==='audio_fill'?audioPlayerHtml:''}${_imgsBlock}${body}</div>`;
    const perScore=getQBlanks(q)?.[0]?.score??1;
    engRightHtml=`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:10px;">${qt==='audio_fill'?'听力填空':'补全单词'}</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.9;">${qt==='audio_fill'?'音频自动播放（不可暂停、仅一次），边听边在左侧空格中填写。':'在左侧文章的空格中填写缺失的字母（下划线数 = 缺失字母数）。'}<br/>每空 ${perScore} 分，共 ${segs.filter(s=>s.t==='blank').length} 空。</div>`;
  } else if(qt==='audio_choice'||qt==='reading'){
    const subs=parseSubs(q)||[];
    const subHtml=subs.map((sub,si)=>{
      const pick=sub.type==='tfng'?1:(sub.pick||(Array.isArray(sub.correct)?sub.correct.length:1));
      const multi=sub.type!=='tfng'&&pick>1;
      const score=sub.score??1;
      return`<div style="margin-bottom:16px;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);">
        <div style="font-size:14px;font-weight:600;margin-bottom:10px;line-height:1.7;white-space:pre-wrap;color:var(--text);">${si+1}. ${escapeHtml(sub.text||'')}${multi?` <span style="color:var(--amber);font-size:12px;font-weight:500;">（选 ${pick} 项）</span>`:''}${score>1?` <span style="color:var(--text3);font-size:12px;font-weight:400;">${score}分</span>`:''}</div>
        <div id="sub-opts-${si}">${_buildSubOpts(idx,si)}</div>
      </div>`;
    }).join('');
    if(qt==='reading'){
      engLeftHtml=`<div style="padding:26px 30px;font-size:15px;line-height:1.95;color:var(--text);white-space:pre-wrap;overflow-y:auto;width:100%;height:100%;">${_imgsBlock}${escapeHtml(q.question_text||'')}</div>`;
      engRightHtml=`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:12px;">根据左侧文章作答</div>${subHtml}`;
    } else{
      engLeftHtml=`<div style="padding:18px 24px;overflow-y:auto;width:100%;height:100%;">${audioPlayerHtml}${q.question_text?`<div style="font-size:14px;line-height:1.8;white-space:pre-wrap;margin-bottom:14px;color:var(--text2);">${escapeHtml(q.question_text)}</div>`:''}${_imgsBlock}${subHtml}</div>`;
      engRightHtml=`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:10px;">听力选择</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.9;">点击左侧音频播放，边听边在左侧逐题作答。共 ${subs.length} 小题。</div>`;
    }
  } else if(qt==='matching'){
    const m=matchCanon(parseSubs(q));
    const myArr=Array.isArray(S.answers[idx])?S.answers[idx]:[];
    const refBox=`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:8px;letter-spacing:0.3px;text-transform:uppercase;">描述条目（从中选择对应字母）</div>
      ${m.stems.map((st,si)=>`<div style="font-size:14px;line-height:1.9;color:var(--text);"><strong style="color:var(--blue);">${String.fromCharCode(65+si)}</strong>　${escapeHtml(st)}</div>`).join('')}
    </div>`;
    const itemHtml=m.options.map((o,oi)=>{
      const cur=myArr[oi];
      const has=cur!==undefined&&cur!==null&&cur!=='';
      return`<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);">
        <span style="font-size:13px;font-weight:700;color:var(--text3);min-width:22px;padding-top:6px;">${oi+1}.</span>
        <div style="flex:1;font-size:14px;line-height:1.7;padding-top:4px;white-space:pre-wrap;color:var(--text);">${escapeHtml(o.text||'')}${(o.score??1)>1?` <span style="color:var(--text3);font-size:12px;">${o.score}分</span>`:''}</div>
        <select onchange="selectMatchAnswer(${idx},${oi},this.value)" style="padding:7px 10px;border:1.5px solid ${has?'var(--blue)':'var(--border-md)'};border-radius:8px;font-size:15px;font-weight:700;background:${has?'var(--blue-light)':'var(--surface)'};color:${has?'var(--blue)':'var(--text)'};cursor:pointer;">
          <option value="">—</option>
          ${m.stems.map((_,si)=>`<option value="${si}" ${has&&Number(cur)===si?'selected':''}>${String.fromCharCode(65+si)}</option>`).join('')}
        </select>
      </div>`;
    }).join('');
    engLeftHtml=`<div style="padding:18px 24px;overflow-y:auto;width:100%;height:100%;">${q.question_text?`<div style="font-size:14px;line-height:1.8;white-space:pre-wrap;margin-bottom:14px;color:var(--text2);">${escapeHtml(q.question_text)}</div>`:''}${_imgsBlock}${refBox}${itemHtml}</div>`;
    engRightHtml=`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:10px;">对应题</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.9;">为左侧每个条目（1、2、3…）选择对应的描述字母（A、B、C…）。共 ${m.options.length} 条。</div>`;
  }
  const qLeftContent=engLeftHtml?engLeftHtml:(qImgs.length&&qText)?
    `<div style="overflow-y:auto;width:100%;height:100%;padding:14px 20px;">${qImgs.map((u,i)=>`${i>0?'<div style="height:1px;background:var(--border);margin:8px 0;"></div>':''}<img src="${u}" onclick="_examImgZoom(${idx},${i})" style="max-width:100%;object-fit:contain;display:block;cursor:zoom-in;" />`).join('')}<div style="font-size:17px;line-height:2;color:var(--text);white-space:pre-wrap;padding-top:14px;border-top:1px solid var(--border);margin-top:12px;">${qText}</div></div>`:
    qImgs.length>1?`<div style="display:flex;flex-direction:column;width:100%;height:100%;overflow-y:auto;padding:8px;">${qImgs.map((u,i)=>`${i>0?'<div style="height:1px;background:var(--border);margin:8px 0;flex-shrink:0;"></div>':''}<img src="${u}" onclick="_examImgZoom(${idx},${i})" style="max-width:100%;object-fit:contain;display:block;cursor:zoom-in;" />`).join('')}</div>`:
    imgSrc?`<img src="${imgSrc}" onclick="_examImgZoom(${idx},0)" style="max-width:100%;max-height:100%;object-fit:contain;display:block;cursor:zoom-in;" />`:
    qText?`<div style="padding:36px 40px;font-size:18px;line-height:2;color:var(--text);white-space:pre-wrap;overflow-y:auto;width:100%;height:100%;">${qText}</div>`:
    `<p style="color:var(--text3);font-size:15px;">(无题目内容)</p>`;

  document.getElementById('exam-question-area').innerHTML=`
    <div id="exam-split-container" style="display:flex;height:calc(100vh - 96px);overflow:hidden;">
      <div id="exam-left-pane" style="flex:${isFrqLayout?'1 1 50%':'1'};display:flex;flex-direction:column;overflow:hidden;padding:20px 20px 0 24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-shrink:0;">
          <div style="font-size:15px;font-weight:600;color:var(--text);">${exam.subject} · 第 ${idx+1} 题${mixedBadge}${ptsBadge}</div>
          <button id="flag-btn" onclick="toggleFlag(${idx})" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid ${flagged?'var(--amber)':'var(--border-md)'};background:${flagged?'var(--amber-light)':'var(--surface)'};color:${flagged?'var(--amber)':'var(--text2)'};transition:all 0.15s;">
            ${flagged?`<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 已标记，点击取消`:`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 1v14M2 1h10l-2.5 5 2.5 5H2z"/></svg> 标记此题`}
          </button>
        </div>
        <div style="flex:1;overflow:auto;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;">
          ${qLeftContent}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;flex-shrink:0;">
          <button class="btn btn-lg" onclick="renderQuestion(${idx-1})" ${idx===0?'disabled':''} style="min-width:100px;">← 上一题</button>
          <span style="font-size:13px;color:var(--text2);">${answered} / ${total} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}</span>
          ${idx<total-1?`<button class="btn btn-primary btn-lg" onclick="renderQuestion(${idx+1})" style="min-width:100px;">下一题 →</button>`:`<button class="btn btn-primary btn-lg" onclick="submitExam()" style="min-width:120px;">提交答案 ✓</button>`}
        </div>
      </div>
      ${isFrqLayout?`<div id="exam-divider" onmousedown="startDividerDrag(event)" style="width:6px;flex-shrink:0;cursor:col-resize;background:transparent;border-left:1px solid var(--border);border-right:1px solid var(--border);position:relative;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'"><div style="width:3px;height:32px;background:var(--border-md);border-radius:99px;"></div></div>`:''}
      <div id="exam-right-pane" style="${isFrqLayout?'flex:1 1 50%;':isReading?'width:440px;flex-shrink:0;':'width:300px;flex-shrink:0;'}display:flex;flex-direction:column;border-left:${isFrqLayout?'0':'1px solid var(--border)'};overflow:hidden;">
        <div style="flex:1;overflow-y:auto;padding:20px 18px 10px;">
          ${isFrqLayout?`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:10px;">作答区</div>
               <textarea id="frq-answer-input" placeholder="在此输入你的答案…" oninput="saveFrqAnswer(${idx},this.value)" onkeydown="frqKeyDown(event,${idx})"
                 autocorrect="off" autocapitalize="none" autocomplete="off" spellcheck="false"
                 style="width:100%;height:calc(100% - 40px);min-height:160px;padding:12px 14px;border:1.5px solid var(--border-md);border-radius:var(--radius-sm);font-size:14px;font-family:'DM Sans',sans-serif;resize:none;background:var(--surface);color:var(--text);line-height:1.8;">${S.frqAnswers[idx]||''}</textarea>
               <div id="frq-autosave-hint" style="font-size:11px;color:var(--text3);margin-top:6px;">自动保存 · 请详细作答</div>`:isFillLayout?fillAreaHtml:engRightHtml?engRightHtml:`<div style="font-size:12px;color:var(--text3);font-weight:500;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:12px;">选择答案${_cMulti?` <span style="color:var(--amber);text-transform:none;">· 多选，请选 ${choiceMultiPick(_cMulti)} 项</span>`:''}</div>
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
  if((qt==='audio_choice'||qt==='audio_fill')&&q.audio_url)_initExamAudio(idx);
}

function startDividerDrag(e){
  e.preventDefault();
  const container=document.getElementById('exam-split-container'),leftPane=document.getElementById('exam-left-pane'),rightPane=document.getElementById('exam-right-pane');
  if(!container||!leftPane||!rightPane)return;
  const startX=e.clientX,totalW=container.offsetWidth,startLeftW=leftPane.offsetWidth;
  function onMove(ev){const dx=ev.clientX-startX;const newLeftW=Math.max(300,Math.min(totalW-300,startLeftW+dx));const pct=(newLeftW/totalW*100).toFixed(1);leftPane.style.flex=`0 0 ${pct}%`;rightPane.style.flex=`0 0 ${(100-pct-0.5).toFixed(1)}%`;}
  function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);}
  document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);
}
function toggleEliminate(qIdx,choiceIdx,event){
  event.stopPropagation();
  if(!S.eliminatedChoices[qIdx])S.eliminatedChoices[qIdx]=new Set();
  const set=S.eliminatedChoices[qIdx];if(set.has(choiceIdx))set.delete(choiceIdx);else set.add(choiceIdx);
  const choices=document.getElementById('choices-area');
  if(choices){const letters=qLetters(S.activeExam.questionsList[qIdx],S.activeExam);choices.innerHTML=letters.map((l,i)=>buildChoiceBtn(l,i,qIdx,S.answers[qIdx]===i,S.eliminatedChoices[qIdx]?.has(i))).join('');}
}
// 多选选择题：渲染可多选的选项按钮
function _buildMultiChoice(qIdx,letters,cfg){
  const pick=choiceMultiPick(cfg);
  const cur=Array.isArray(S.answers[qIdx])?S.answers[qIdx].map(Number):[];
  return letters.map((l,i)=>{const on=cur.includes(i);
    return`<button onclick="toggleMultiChoice(${qIdx},${i},${pick})" style="width:100%;padding:13px 16px;font-size:16px;margin-bottom:9px;display:flex;align-items:center;gap:14px;border-radius:9px;border:1.5px solid ${on?'var(--blue)':'var(--border-md)'};background:${on?'var(--blue-light)':'var(--surface)'};cursor:pointer;">
      <span style="width:30px;height:30px;border-radius:7px;background:${on?'var(--blue)':'var(--surface2)'};color:${on?'white':'var(--text2)'};font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${on?'✓':l}</span>
      <span style="font-size:15px;font-weight:${on?'600':'400'};flex:1;">${l}</span>
    </button>`;}).join('');
}
// 多选选择题：切换某个选项（最多选 pick 项，超出则移除最早选的）
function toggleMultiChoice(qIdx,i,pick){
  let cur=Array.isArray(S.answers[qIdx])?[...S.answers[qIdx]].map(Number):[];
  if(cur.includes(i))cur=cur.filter(x=>x!==i);
  else{cur.push(i);if(pick>0&&cur.length>pick)cur.shift();}
  cur.sort((a,b)=>a-b);
  if(cur.length)S.answers[qIdx]=cur;else delete S.answers[qIdx];
  saveExamState();
  const q=S.activeExam.questionsList[qIdx];const letters=qLetters(q,S.activeExam);
  const area=document.getElementById('choices-area');
  if(area)area.innerHTML=_buildMultiChoice(qIdx,letters,choiceMulti(q));
  _updateNavGrid(qIdx);
  const answered=Object.keys(S.answers).length;
  const countEl=document.querySelector('#exam-question-area span[style*="已作答"]');
  if(countEl)countEl.textContent=`${answered} / ${S.activeExam.questionsList.length} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}`;
  if(S._frqAutosaveTimer)clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer=setTimeout(()=>_autoSaveFrqToServer(),5000);
}
function buildChoiceBtn(l,i,qIdx,sel,elim){
  const elimStyle=elim?'opacity:0.35;text-decoration:line-through;':'';
  const selStyle=sel&&!elim?'border-color:var(--blue);background:var(--blue-light);':'';
  return`<button class="choice-option ${sel&&!elim?'selected':''}" onclick="selectAnswer(${qIdx},${i})"
    style="width:100%;padding:13px 16px;font-size:16px;margin-bottom:9px;display:flex;align-items:center;gap:14px;border-radius:9px;${selStyle}${elimStyle}position:relative;">
    <span style="width:30px;height:30px;border-radius:50%;background:${sel&&!elim?'var(--blue)':'var(--surface2)'};color:${sel&&!elim?'white':'var(--text2)'};font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${l}</span>
    <span style="font-size:15px;font-weight:${sel&&!elim?'600':'400'};flex:1;">${l}</span>
    <span onclick="toggleEliminate(${qIdx},${i},event)" style="font-size:12px;color:${elim?'var(--red)':'var(--text3)'};padding:3px 6px;border-radius:4px;cursor:pointer;flex-shrink:0;opacity:0.7;" title="划掉此选项">${elim?'↩':'✕'}</span>
  </button>`;
}
function selectAnswer(qIdx,choiceIdx){
  if(S.eliminatedChoices[qIdx]?.has(choiceIdx))return;
  S.answers[qIdx]=choiceIdx;saveExamState();
  const exam=S.activeExam,qs=exam.questionsList,letters=qLetters(qs[qIdx],exam);
  const choicesArea=document.getElementById('choices-area');
  if(choicesArea)choicesArea.innerHTML=letters.map((l,i)=>buildChoiceBtn(l,i,qIdx,S.answers[qIdx]===i,S.eliminatedChoices[qIdx]?.has(i)||false)).join('');
  _updateNavGrid(qIdx);
  const answered=Object.keys(S.answers).length;
  const countEl=document.querySelector('#exam-question-area span[style*="已作答"]');
  if(countEl)countEl.textContent=`${answered} / ${qs.length} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}`;
  if(S._frqAutosaveTimer)clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer=setTimeout(()=>_autoSaveFrqToServer(),2000);
}
function saveFillAnswer(qIdx,val){
  const el=document.getElementById('fill-answer-input');
  const sanitized=String(val).replace(/[^0-9.\-\/]/g,'');
  if(el&&el.value!==sanitized){const pos=el.selectionStart;el.value=sanitized;try{el.setSelectionRange(pos,pos);}catch(e){}}
  if(sanitized.trim()!=='')S.answers[qIdx]=sanitized.trim();else delete S.answers[qIdx];
  saveExamState();_updateNavGrid(qIdx);
  const answered=Object.keys(S.answers).length;
  const countEl=document.querySelector('#exam-question-area span[style*="已作答"]');
  if(countEl)countEl.textContent=`${answered} / ${S.activeExam.questionsList.length} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}`;
  if(S._frqAutosaveTimer)clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer=setTimeout(()=>_autoSaveFrqToServer(),5000);
}
function saveFillTextAnswer(qIdx,val){
  const el=document.getElementById('fill-answer-input');
  const sanitized=String(val).replace(/[^a-zA-Z\s\-']/g,'').toLowerCase();
  if(el&&el.value!==sanitized){const pos=el.selectionStart;el.value=sanitized;try{el.setSelectionRange(pos,pos);}catch(e){}}
  const trimmed=sanitized.trim();
  if(trimmed!=='')S.answers[qIdx]=sanitized;else delete S.answers[qIdx];
  saveExamState();_updateNavGrid(qIdx);
  const answered=Object.keys(S.answers).length;
  const countEl=document.querySelector('#exam-question-area span[style*="已作答"]');
  if(countEl)countEl.textContent=`${answered} / ${S.activeExam.questionsList.length} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}`;
  if(S._frqAutosaveTimer)clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer=setTimeout(()=>_autoSaveFrqToServer(),5000);
}
// 多空填空：保存某个空的输入
function saveBlankAnswer(qIdx,bi,val){
  const q=S.activeExam?.questionsList?.[qIdx];if(!q)return;
  const qt=getQType(q,S.activeExam);
  const manual=isManualQ(q,qt);
  let sanitized=String(val);
  if(!manual)sanitized=qt==='fill'?sanitized.replace(/[^0-9.\-\/]/g,''):qt==='audio_fill'?sanitized.replace(/[^a-zA-Z0-9\s\-']/g,'').toLowerCase():sanitized.replace(/[^a-zA-Z\s\-']/g,'').toLowerCase();
  const el=document.querySelector(`.fill-blank-input[data-bi="${bi}"]`);
  if(el&&el.value!==sanitized){const pos=el.selectionStart;el.value=sanitized;try{el.setSelectionRange(pos,pos);}catch(e){}}
  const arr=Array.isArray(S.answers[qIdx])?[...S.answers[qIdx]]:[];
  arr[bi]=sanitized.trim();
  if(arr.some(v=>v))S.answers[qIdx]=arr;else delete S.answers[qIdx];
  saveExamState();_updateNavGrid(qIdx);
  const answered=Object.keys(S.answers).length;
  const countEl=document.querySelector('#exam-question-area span[style*="已作答"]');
  if(countEl)countEl.textContent=`${answered} / ${S.activeExam.questionsList.length} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}`;
  if(S._frqAutosaveTimer)clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer=setTimeout(()=>_autoSaveFrqToServer(),5000);
}
// ── 听力音频：进入页面自动播放、不可暂停、仅播放一次 ──
function _audioKey(idx){return (S.activeExam?.id||'')+'_'+idx;}
function _examAudioHtml(idx){
  const q=S.activeExam.questionsList[idx];if(!q.audio_url)return'';
  return`<div id="exam-audio-box" style="display:flex;align-items:center;gap:10px;background:var(--blue-light);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;">
    <span style="font-size:20px;">🎧</span>
    <div style="flex:1;">
      <div id="exam-audio-status" style="font-size:13px;font-weight:600;color:var(--blue);">准备播放…</div>
      <div style="height:4px;background:var(--surface);border-radius:99px;margin-top:6px;overflow:hidden;"><div id="exam-audio-bar" style="height:100%;width:0%;background:var(--blue);transition:width 0.3s linear;"></div></div>
    </div>
  </div>
  <audio id="exam-audio" preload="auto" src="${q.audio_url}" style="display:none;"></audio>`;
}
function _initExamAudio(idx){
  const el=document.getElementById('exam-audio');if(!el)return;
  if(!S._audioPlayed)S._audioPlayed={};if(!S._audioProg)S._audioProg={};
  const key=_audioKey(idx);
  const status=document.getElementById('exam-audio-status'),bar=document.getElementById('exam-audio-bar');
  const fmt=t=>{t=Math.max(0,Math.floor(t||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
  if(S._audioPlayed[key]){if(status)status.textContent='✓ 音频已播放完毕（仅可播放一次）';if(bar)bar.style.width='100%';return;}
  const resume=S._audioProg[key]||0;
  el.addEventListener('loadedmetadata',()=>{if(resume>0&&resume<el.duration-0.5){try{el.currentTime=resume;}catch(e){}}});
  el.addEventListener('timeupdate',()=>{
    if(el.currentTime>0)S._audioProg[key]=el.currentTime;
    if(status)status.textContent=`🔊 正在播放… ${fmt(el.currentTime)} / ${fmt(el.duration)}　不可暂停 · 仅播放一次`;
    if(bar&&el.duration)bar.style.width=(el.currentTime/el.duration*100)+'%';
  });
  // 不允许暂停：被暂停就立即续播（换题时 _stopped 标记除外）
  el.addEventListener('pause',()=>{if(el._stopped||el.ended||S._audioPlayed[key])return;const p=el.play();if(p&&p.catch)p.catch(()=>{});});
  el.addEventListener('ended',()=>{S._audioPlayed[key]=true;saveExamState();if(status)status.textContent='✓ 音频已播放完毕（仅可播放一次）';if(bar)bar.style.width='100%';});
  const p=el.play();
  if(p&&p.catch)p.catch(()=>{
    // 浏览器拦截自动播放时退化为点击开始
    if(status)status.textContent='▶ 点击这里开始播放（仅一次，不可暂停）';
    const box=document.getElementById('exam-audio-box');
    if(box){box.style.cursor='pointer';box.onclick=()=>{const p2=el.play();if(p2&&p2.catch)p2.catch(()=>{});box.onclick=null;box.style.cursor='';};}
  });
}
// ── 英语题型：学生作答 ──
function _engUpdateCount(qIdx){
  saveExamState();_updateNavGrid(qIdx);
  const answered=Object.keys(S.answers).length;
  const countEl=document.querySelector('#exam-question-area span[style*="已作答"]');
  if(countEl)countEl.textContent=`${answered} / ${S.activeExam.questionsList.length} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}`;
  if(S._frqAutosaveTimer)clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer=setTimeout(()=>_autoSaveFrqToServer(),5000);
}
// cloze 补全单词 / 听力填空：保存某个空（听力填空允许数字）
function saveClozeAnswer(qIdx,bi,val){
  const _q=S.activeExam?.questionsList?.[qIdx];
  const _qt=_q?getQType(_q,S.activeExam):'cloze';
  const sanitized=_qt==='audio_fill'?String(val).replace(/[^a-zA-Z0-9\s\-']/g,'').toLowerCase():String(val).replace(/[^a-zA-Z\-']/g,'').toLowerCase();
  const el=document.querySelector(`.cloze-input[data-bi="${bi}"]`);
  if(el&&el.value!==sanitized){const pos=el.selectionStart;el.value=sanitized;try{el.setSelectionRange(pos,pos);}catch(e){}}
  const arr=Array.isArray(S.answers[qIdx])?[...S.answers[qIdx]]:[];
  arr[bi]=sanitized.trim();
  if(arr.some(v=>v))S.answers[qIdx]=arr;else delete S.answers[qIdx];
  _engUpdateCount(qIdx);
}
// 听力选择/阅读小题：构建选项按钮（局部刷新，避免音频重新加载）
function _buildSubOpts(qIdx,si){
  const q=S.activeExam?.questionsList?.[qIdx];if(!q)return'';
  const subs=parseSubs(q)||[];const sub=subs[si];if(!sub)return'';
  const opts=sub.type==='tfng'?TFNG:(sub.choices||[]);
  const pick=sub.type==='tfng'?1:(sub.pick||(Array.isArray(sub.correct)?sub.correct.length:1));
  const multi=sub.type!=='tfng'&&pick>1;
  const myArr=Array.isArray(S.answers[qIdx])?S.answers[qIdx]:[];
  const sel=myArr[si];
  const selSet=new Set(Array.isArray(sel)?sel.map(Number):(sel===undefined||sel===null||sel==='')?[]:[Number(sel)]);
  return opts.map((opt,ci)=>{
    const on=selSet.has(ci);
    const tag=sub.type==='tfng'?(ci===0?'T':ci===1?'F':'NG'):String.fromCharCode(65+ci);
    return`<button onclick="selectSubAnswer(${qIdx},${si},${ci},${multi?pick:0})" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 12px;margin-bottom:6px;border-radius:8px;border:1.5px solid ${on?'var(--blue)':'var(--border-md)'};background:${on?'var(--blue-light)':'var(--surface)'};cursor:pointer;font-size:14px;color:var(--text);">
      <span style="min-width:28px;height:26px;border-radius:${multi?'6px':'13px'};background:${on?'var(--blue)':'var(--surface2)'};color:${on?'white':'var(--text2)'};font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0 4px;">${tag}</span>
      <span style="flex:1;line-height:1.6;">${sub.type==='tfng'?opt:escapeHtml(opt)}</span>
    </button>`;
  }).join('');
}
// 听力选择/阅读小题：选择答案（pick>0 表示多选，需选满 pick 项）
function selectSubAnswer(qIdx,si,ci,pick){
  const q=S.activeExam?.questionsList?.[qIdx];if(!q)return;
  const subs=parseSubs(q)||[];
  const arr=Array.isArray(S.answers[qIdx])?[...S.answers[qIdx]]:[];
  if(pick>0){
    let cur=Array.isArray(arr[si])?[...arr[si]]:[];
    if(cur.includes(ci))cur=cur.filter(x=>x!==ci);
    else{cur.push(ci);if(cur.length>pick)cur.shift();}
    arr[si]=cur.length?cur.sort((a,b)=>a-b):undefined;
  } else arr[si]=ci;
  if(arr.some(v=>v!==undefined&&v!==null&&v!==''))S.answers[qIdx]=arr;else delete S.answers[qIdx];
  const box=document.getElementById('sub-opts-'+si);
  if(box)box.innerHTML=_buildSubOpts(qIdx,si);
  _engUpdateCount(qIdx);
}
// 对应题：选择某条描述对应的选项
function selectMatchAnswer(qIdx,si,val){
  const arr=Array.isArray(S.answers[qIdx])?[...S.answers[qIdx]]:[];
  arr[si]=val===''?undefined:parseInt(val);
  if(arr.some(v=>v!==undefined&&v!==null&&v!==''))S.answers[qIdx]=arr;else delete S.answers[qIdx];
  const sel=event?.target;
  if(sel){const has=val!=='';sel.style.borderColor=has?'var(--blue)':'var(--border-md)';sel.style.background=has?'var(--blue-light)':'var(--surface)';sel.style.color=has?'var(--blue)':'var(--text)';}
  _engUpdateCount(qIdx);
}
function _insertText(t,text,newCursorOffset){
  const s=t.selectionStart,end=t.selectionEnd;
  if(document.execCommand&&document.execCommand('insertText',false,text)){if(newCursorOffset!==undefined)t.selectionStart=t.selectionEnd=s+newCursorOffset;}
  else{const val=t.value;t.value=val.substring(0,s)+text+val.substring(end);t.selectionStart=t.selectionEnd=newCursorOffset!==undefined?s+newCursorOffset:s+text.length;}
}
function frqKeyDown(e,qIdx){
  const t=e.target,s=t.selectionStart,end=t.selectionEnd,val=t.value;
  if(e.key==='Tab'&&!e.shiftKey&&s===end&&/\bsout$/.test(val.substring(0,s))){e.preventDefault();t.selectionStart=s-4;t.selectionEnd=s;const text='System.out.println();';_insertText(t,text,text.indexOf(')'));saveFrqAnswer(qIdx,t.value);return;}
  if(e.key==='Tab'){e.preventDefault();_insertText(t,'    ');saveFrqAnswer(qIdx,t.value);return;}
  const pairs={'{':`}`,'(':')','[':']','"':'"',"'":"'"};
  if(pairs[e.key]&&s===end){e.preventDefault();_insertText(t,e.key+pairs[e.key],1);saveFrqAnswer(qIdx,t.value);return;}
  const closers=new Set(['}',')',']','"',"'"]);
  if(closers.has(e.key)&&val[s]===e.key&&s===end){e.preventDefault();t.selectionStart=t.selectionEnd=s+1;return;}
  if(e.key==='Enter'){
    e.preventDefault();
    const lineStart=val.lastIndexOf('\n',s-1)+1;const currentLine=val.substring(lineStart,s);const indent=currentLine.match(/^(\s*)/)[1];
    if(val[s-1]==='{'&&val[s]==='}'){const extra=indent+'    ';_insertText(t,'\n'+extra+'\n'+indent,extra.length+1);}else _insertText(t,'\n'+indent);
    saveFrqAnswer(qIdx,t.value);return;
  }
  if(e.key==='Backspace'&&s===end&&s>0){
    const left=val[s-1],right=val[s];const pairMap={'{':'}','(':')','[':']'};
    if(pairMap[left]===right){e.preventDefault();t.selectionStart=s-1;t.selectionEnd=s+1;document.execCommand('delete')||(()=>{t.value=val.substring(0,s-1)+val.substring(s+1);t.selectionStart=t.selectionEnd=s-1;})();saveFrqAnswer(qIdx,t.value);return;}
  }
}
function saveFrqAnswer(qIdx,val){
  S.frqAnswers[qIdx]=val;saveExamState();
  if(val.trim())S.answers[qIdx]=0;else delete S.answers[qIdx];
  _updateNavGrid(qIdx);
  const answered=Object.keys(S.answers).length;
  const countEl=document.querySelector('#exam-question-area span[style*="已作答"]');
  if(countEl)countEl.textContent=`${answered} / ${S.activeExam.questionsList.length} 已作答${S.flaggedQuestions.size>0?` · ${S.flaggedQuestions.size} 已标记`:''}`;
  if(S._frqAutosaveTimer)clearTimeout(S._frqAutosaveTimer);
  S._frqAutosaveTimer=setTimeout(()=>_autoSaveFrqToServer(),5000);
}
async function _autoSaveFrqToServer(){
  if(!S.student?.studentKeyId||!S.activeExam||S._isPracticeMode)return;
  const snapKeyId=S.student.studentKeyId,snapExamId=S.activeExam.id;
  try{
    const ta=document.getElementById('frq-answer-input');if(ta)S.frqAnswers[S.currentQIdx]=ta.value;
    _syncFillInputs(S.currentQIdx);
    if(S.student?.studentKeyId!==snapKeyId||S.activeExam?.id!==snapExamId)return;
    const frqSnapshot=JSON.parse(JSON.stringify(S.frqAnswers||{}));
    const answersSnapshot=JSON.parse(JSON.stringify(S.answers||{}));
    const questionSnapshot=S.currentQIdx;
    await api('POST','/api/homework-progress',{student_key_id:snapKeyId,exam_id:snapExamId,frq_answers:frqSnapshot,answers_data:answersSnapshot,current_q:questionSnapshot});
    const hint=document.querySelector('#frq-autosave-hint');
    if(hint){hint.textContent='已自动保存 ✓';hint.style.color='var(--green)';setTimeout(()=>{if(hint){hint.textContent='自动保存 · 请详细作答';hint.style.color='';}},2000);}
  }catch(e){}
}

async function exitExam(){
  if(S._isHomeworkMode){
    if(!confirm('保存进度并退出作业？下次可以继续作答。'))return;
    if(S._frqAutosaveTimer){clearTimeout(S._frqAutosaveTimer);S._frqAutosaveTimer=null;}
    const ta=document.getElementById('frq-answer-input');if(ta)S.frqAnswers[S.currentQIdx]=ta.value;
    _syncFillInputs(S.currentQIdx);
    try{await api('POST','/api/homework-progress',{student_key_id:S.student.studentKeyId,exam_id:S.activeExam.id,frq_answers:S.frqAnswers,answers_data:S.answers,current_q:S.currentQIdx});toast('作业进度已保存 ✓');}
    catch(e){toast('保存失败，请重试');return;}
    _saveHwTime();
  } else{
    const wasAC=!!S._acVisibility;
    stopAntiCheat(); // Safari 弹 confirm 会退出全屏，先停防切屏避免误判
    if(!confirm('退出考试？已作答内容不会保存。')){if(wasAC)startAntiCheat();return;}
  }
  stopAntiCheat();stopTimer();stopHeartbeat();clearExamState();
  sessionStorage.removeItem('examState');sessionStorage.removeItem('examState_frq');
  document.getElementById('exam-timer').style.display='none';
  S.tabSwitches=0;S.flaggedQuestions=new Set();S._isHomeworkMode=false;
  showScreen('student');
  const _exitName=S.student.name;
  if(_studentExamItems.length){
    _renderStudentLayout(_exitName,_studentExamItems);
    api('GET','/api/student/exams',{student_name:_exitName}).then(items=>{_studentExamItems=items;_renderStudentLayout(_exitName,items);}).catch(()=>{});
  } else{
    try{const saved=localStorage.getItem('fav_'+_exitName);S._favorites=new Set(saved?JSON.parse(saved):[]);}catch(e){}
    const items=await api('GET','/api/student/exams',{student_name:_exitName});
    _studentExamItems=items;S._navSubject='';S._navType='all';S._navPage=1;_renderStudentLayout(_exitName,items);
  }
}

async function submitExam(){
  const exam=S.activeExam,qs=exam.questionsList;
  const answered=Object.keys(S.answers).length,flaggedCount=S.flaggedQuestions.size;
  const _ta=document.getElementById('frq-answer-input');if(_ta)S.frqAnswers[S.currentQIdx]=_ta.value;
  _syncFillInputs(S.currentQIdx);
  if(S._isPracticeMode){
    stopAntiCheat();stopTimer();clearExamState();document.getElementById('exam-timer').style.display='none';
    const questionsForDisplay=qs.map(q=>({...q}));let practiceScore=0;
    const practiceTotalScore=qs.reduce((s,q)=>s+(q.max_score||1),0);
    questionsForDisplay.forEach((q,i)=>{
      const qt=getQType(q,exam);
      const myAns=S.answers[i];
      if(qt==='fill'||qt==='fill_text'){
        const bs=getQBlanks(q);
        const correct=bs?bs.map(b=>b.answer):(q.answer_key??null);
        q.correct_answer=correct;
        if(isManualQ(q,qt))return;
        if(bs){const eq=qt==='fill'?numEqC:strEqC;const myArr=Array.isArray(myAns)?myAns:[myAns];bs.forEach((b,bi)=>{if(eq(myArr[bi],b.answer))practiceScore+=(b.score??1);});}
        else if(correct!==null&&fillAnsCorrect(qt,myAns,correct))practiceScore+=(q.max_score||1);
        return;
      }
      if(ENG_QTS.includes(qt)){
        const key=engKeyClient(q,qt);q.correct_answer=key;
        if(key!==null)practiceScore+=engEarnedClient(q,qt,myAns,key);
        return;
      }
      const cm=(qt==='choice')?choiceMulti(q):null;
      if(cm){const cor=(cm.correct||[]).map(Number);q.correct_answer=cor;practiceScore+=choiceMultiEarnedClient(cm,myAns,cor);return;}
      if(qt==='frq'||q.correct_answer===null)return;
      if(parseInt(myAns)===q.correct_answer)practiceScore+=(q.max_score||1);
    });
    showResults(practiceScore,practiceTotalScore,questionsForDisplay);S._isPracticeMode=false;return;
  }
  if(S._frqAutosaveTimer){clearTimeout(S._frqAutosaveTimer);S._frqAutosaveTimer=null;}
  // mixed 或 frq 都需要先同步进度
  if((exam.exam_type==='frq'||exam.exam_type==='mixed')&&S.student?.studentKeyId){
    try{
      await api('POST','/api/homework-progress',{student_key_id:S.student.studentKeyId,exam_id:exam.id,frq_answers:S.frqAnswers,answers_data:S.answers,current_q:S.currentQIdx}).catch(()=>{});
      const latestProg=await api('GET','/api/homework-progress',{student_key_id:S.student.studentKeyId,exam_id:exam.id}).catch(()=>null);
      if(latestProg?.frq_answers){const srvAnswers=typeof latestProg.frq_answers==='string'?JSON.parse(latestProg.frq_answers):latestProg.frq_answers;Object.keys(srvAnswers).forEach(k=>{const sv=srvAnswers[k]||'',lv=S.frqAnswers[k]||'';if(sv.length>lv.length)S.frqAnswers[k]=sv;});}
    }catch(e){}
  }
  let confirmMsg='';
  if(answered<qs.length)confirmMsg+=`还有 ${qs.length-answered} 题未作答。\n`;
  if(flaggedCount>0)confirmMsg+=`有 ${flaggedCount} 题已标记待检查。\n`;
  confirmMsg+='\n确定要提交答案吗？提交后不能修改。';
  // 先停防切屏再弹 confirm：Safari 弹原生对话框会退出全屏，否则被误判为切屏（白屏/误计次数）
  const wasAntiCheat=!!S._acVisibility;
  stopAntiCheat();
  if(!confirm(confirmMsg)){if(wasAntiCheat)startAntiCheat();return;}
  if(S._submitting)return;S._submitting=true;
  const answersSnapshot={...S.answers};
  stopTimer();stopHeartbeat();clearExamState();
  const result=await api('POST','/api/records',{exam_id:exam.id,student_key_id:S.student.studentKeyId,student_name:S.student.name,answers_data:answersSnapshot,frq_answers:S.frqAnswers||{},tab_switches:S.tabSwitches||0,duration_seconds:_calcDuration()});
  S._submitting=false;
  if(result.error){toast('提交失败：'+result.error);return;}
  S.answers=answersSnapshot;
  document.getElementById('exam-timer').style.display='none';
  if(result.has_manual||result.is_frq){S._frqMaxScore=result.total;S._frqQScores={};}
  const questionsForDisplay=qs.map((q,i)=>({...q,correct_answer:result.correct_answers?result.correct_answers[i]:undefined}));
  _updateLocalRecord(exam.id,S.student.studentKeyId,result);
  try{ if(result.collection&&result.collection.unlocked&&window.NEBSReward){ const _cs=result.collection.cards||[result.collection]; for(const _it of _cs){ await NEBSReward.play(_it); } _stuCollectionOnUnlock(); } }catch(e){}
  showResults(result.score,result.total,questionsForDisplay);
}

// ── 成绩展示 ─────────────────────────────────────────────
function toggleWrongOnly(){
  S._wrongOnlyMode=!S._wrongOnlyMode;
  const btn=document.getElementById('wrong-only-btn');
  if(btn){btn.style.background=S._wrongOnlyMode?'var(--red-light)':'';btn.style.color=S._wrongOnlyMode?'var(--red)':'';btn.style.borderColor=S._wrongOnlyMode?'var(--red)':'';btn.textContent=S._wrongOnlyMode?'✗ 只看错题（点击取消）':'✗ 只看错题';}
  _renderResultCards();
}
function _isAnswerWrong(q,i,exam){
  const correct=q.correct_answer??null,myAns=S.answers[i];
  if(correct===null)return false;
  const qt=getQType(q,exam);
  if(qt==='fill'||qt==='fill_text'){
    if(isManualQ(q,qt))return false; // 人工批改的题不计入自动错题
    return !fillAnsCorrect(qt,myAns,correct);
  }
  if(ENG_QTS.includes(qt))return engEarnedClient(q,qt,myAns,correct)<(q.max_score||1);
  const cm=choiceMulti(q);if(cm)return choiceMultiEarnedClient(cm,myAns,correct)<(q.max_score||1);
  return myAns!==correct;
}

function _fmtAns(v){if(v===undefined||v===null)return'';return Array.isArray(v)?v.map(x=>(x===undefined||x==='')?'—':x).join('，'):String(v);}
// 填空题结果展示（支持多空 + 人工批改评语）
function _fillResultHtml(q,qt,myAns,correct,i){
  const isManual=isManualQ(q,qt);
  const blanks=getQBlanks(q);
  const myArr=Array.isArray(myAns)?myAns:[myAns];
  const corArr=Array.isArray(correct)?correct:[correct];
  const n=Math.max(blanks?blanks.length:1,corArr.length,1);
  const eq=qt==='fill'?numEqC:strEqC;
  let rows='';
  for(let bi=0;bi<n;bi++){
    const label=blanks?.[bi]?.label||(n>1?`空 ${bi+1}`:'');
    const mv=myArr[bi],cv=corArr[bi];
    const ok=isManual?null:eq(mv,cv);
    rows+=`<div style="display:grid;grid-template-columns:90px 1fr 1fr;gap:10px;align-items:center;margin-bottom:8px;">
      <div style="font-size:12px;color:var(--text3);word-break:break-all;">${escapeHtml(label)}</div>
      <div style="background:${isManual?'var(--surface2)':ok?'var(--green-light)':'var(--red-light)'};border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;font-size:15px;font-family:'DM Mono',monospace;text-align:center;color:${isManual?'var(--text)':ok?'var(--green)':'var(--red)'};white-space:pre-wrap;word-break:break-all;">${(mv===undefined||mv==='')?'（未作答）':escapeHtml(String(mv))}</div>
      <div style="background:var(--green-light);border:1px solid rgba(59,109,17,0.15);border-radius:var(--radius-sm);padding:10px;font-size:15px;font-family:'DM Mono',monospace;text-align:center;color:var(--text);white-space:pre-wrap;word-break:break-all;">${escapeHtml(String(cv??'?'))}</div>
    </div>`;
  }
  const head=`<div style="display:grid;grid-template-columns:90px 1fr 1fr;gap:10px;margin-bottom:5px;"><div></div><div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;">我的作答</div><div style="font-size:11px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:0.4px;">${isManual?'参考答案':'正确答案'}</div></div>`;
  const fb=isManual&&S._frqFeedback?.[i]?`<div style="margin-top:8px;background:var(--amber-light);border-left:3px solid var(--amber);border-radius:var(--radius-sm);padding:8px 14px;font-size:13px;color:var(--text);line-height:1.7;white-space:pre-wrap;"><span style="font-weight:600;color:var(--amber);">教师评语：</span>${escapeHtml(S._frqFeedback[i])}</div>`:'';
  const exp=q.explanation?`<div style="margin-top:8px;background:var(--amber-light);border-left:3px solid var(--amber);border-radius:var(--radius-sm);padding:8px 14px;font-size:13px;color:var(--text);line-height:1.7;"><span style="font-weight:600;color:var(--amber);">解析：</span>${escapeHtml(q.explanation)}</div>`:'';
  return head+rows+fb+exp;
}
// 英语小题型结果展示（audio_choice/reading/matching：逐小题对错）
function _engSubsResultHtml(q,qt,myAns,correct){
  const subs=parseSubs(q)||(qt==='matching'?{stems:[],options:[]}:[]);
  const myArr=Array.isArray(myAns)?myAns:[];const corArr=Array.isArray(correct)?correct:[];
  const letterOf=oi=>String.fromCharCode(65+oi);
  if(qt==='matching'){
    const m=matchCanon(subs);
    const refBox=m.stems.length?`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:10px;font-size:13px;line-height:1.8;">${m.stems.map((st,si)=>`<div><strong>${letterOf(si)}</strong>　${escapeHtml(st)}</div>`).join('')}</div>`:'';
    return refBox+m.options.map((o,i)=>{
      const ok=_ansNum(myArr[i])===Number(corArr[i]);
      const mine=(myArr[i]===undefined||myArr[i]===null||myArr[i]==='')?'—':letterOf(Number(myArr[i]));
      return`<div style="display:flex;gap:10px;align-items:center;padding:8px 12px;margin-bottom:6px;border-radius:var(--radius-sm);border:1px solid ${ok?'var(--green)':'var(--red)'};background:${ok?'var(--green-light)':'var(--red-light)'};">
        <span style="font-size:12px;font-weight:700;min-width:22px;color:var(--text3);">${i+1}.</span>
        <span style="flex:1;font-size:13px;line-height:1.6;white-space:pre-wrap;color:var(--text);">${escapeHtml(o.text||'')}</span>
        <span style="font-size:14px;font-weight:700;color:${ok?'var(--green)':'var(--red)'};">${mine}</span>
        ${ok?'<span style="color:var(--green);font-weight:700;">✓</span>':`<span style="font-size:12px;color:var(--text2);">正确 <strong style="color:var(--green);">${corArr[i]!=null?letterOf(Number(corArr[i])):'?'}</strong></span>`}
      </div>`;
    }).join('');
  }
  // audio_choice / reading：完整显示每一小题（题干 + 全部选项 + 对错高亮 + 小题得分）
  return (Array.isArray(subs)?subs:[]).map((sub,i)=>{
    const isTfng=sub.type==='tfng';
    const opts=isTfng?TFNG:(sub.choices||[]);
    const corSet=new Set((Array.isArray(corArr[i])?corArr[i]:[corArr[i]]).map(Number).filter(n=>!isNaN(n)));
    const rawMine=myArr[i];
    const mySet=new Set((Array.isArray(rawMine)?rawMine:(rawMine===undefined||rawMine===null||rawMine==='')?[]:[rawMine]).map(Number).filter(n=>!isNaN(n)));
    const isMulti=corSet.size>1;
    const per=sub.score??1;
    const matches=[...mySet].filter(v=>corSet.has(v)).length;
    const earned=isMulti?matches*per:(mySet.size===1&&corSet.has([...mySet][0])?per:0);
    const maxPts=isMulti?corSet.size*per:per;
    const ok=earned>=maxPts;
    const optRows=opts.map((opt,oi)=>{
      const isCor=corSet.has(oi),isMine=mySet.has(oi);
      const tag=isTfng?['T','F','NG'][oi]:letterOf(oi);
      if(!isCor&&!isMine)return`<div style="display:flex;gap:8px;align-items:center;padding:5px 10px;font-size:13px;color:var(--text2);"><span style="min-width:26px;font-weight:600;">${tag}</span><span>${escapeHtml(String(opt))}</span></div>`;
      return`<div style="display:flex;gap:8px;align-items:center;padding:6px 10px;margin:2px 0;border-radius:6px;border:1.5px solid ${isCor?'var(--green)':'var(--red)'};background:${isCor?'var(--green-light)':'var(--red-light)'};font-size:13px;">
        <span style="min-width:26px;font-weight:700;color:${isCor?'var(--green)':'var(--red)'};">${tag}</span>
        <span style="flex:1;color:var(--text);">${escapeHtml(String(opt))}</span>
        ${isMine?`<span style="font-size:11px;font-weight:600;color:${isCor?'var(--green)':'var(--red)'};">← 我的选择</span>`:''}
        ${isCor?'<span style="font-size:11px;color:var(--green);font-weight:600;">✓ 正确答案</span>':''}
      </div>`;
    }).join('');
    return`<div style="margin-bottom:14px;padding:12px 14px;background:var(--surface);border:1px solid ${ok?'var(--green)':'var(--red)'};border-radius:var(--radius-sm);">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
        <span style="font-size:13px;font-weight:700;color:var(--text3);">${i+1}.</span>
        <span style="flex:1;font-size:14px;font-weight:600;line-height:1.7;white-space:pre-wrap;">${escapeHtml(sub.text||'')}</span>
        <span class="badge ${ok?'badge-green':'badge-red'}" style="flex-shrink:0;">${earned} / ${maxPts} 分</span>
      </div>
      ${optRows}
      ${mySet.size===0?'<div style="font-size:12px;color:var(--text3);margin-top:4px;">（未作答）</div>':''}
    </div>`;
  }).join('');
}
// 多选选择题结果：所有选项显示对错（正确项绿、错选红、漏选灰）
function _multiChoiceResultHtml(q,myAns,correct,letters){
  const cor=new Set((Array.isArray(correct)?correct:[correct]).map(Number));
  const sel=new Set((Array.isArray(myAns)?myAns:(myAns===undefined?[]:[myAns])).map(Number));
  const rows=letters.map((l,i)=>{
    const isCor=cor.has(i),isSel=sel.has(i);
    let bg='var(--surface2)',border='var(--border-md)',color='var(--text2)',tag='';
    if(isCor&&isSel){bg='var(--green-light)';border='var(--green)';color='var(--green)';tag='✓ 选对';}
    else if(isCor&&!isSel){bg='var(--surface)';border='var(--green)';color='var(--green)';tag='正确答案（漏选）';}
    else if(!isCor&&isSel){bg='var(--red-light)';border='var(--red)';color='var(--red)';tag='✗ 错选';}
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:5px;border-radius:var(--radius-sm);border:1.5px solid ${border};background:${bg};">
      <span style="font-size:13px;font-weight:700;color:${color};min-width:18px;">${l}</span>
      <span style="flex:1;font-size:14px;color:${color};">${l}</span>
      ${tag?`<span style="font-size:11px;font-weight:600;color:${color};">${tag}</span>`:''}
    </div>`;
  }).join('');
  const exp=q.explanation?`<div style="margin-top:10px;background:var(--amber-light);border-left:3px solid var(--amber);border-radius:var(--radius-sm);padding:8px 14px;font-size:13px;color:var(--text);line-height:1.7;"><span style="font-weight:600;color:var(--amber);">解析：</span>${escapeHtml(q.explanation)}</div>`:'';
  return`<div style="display:flex;flex-direction:column;gap:0;">${rows}</div>${exp}`;
}
function _renderResultCards(){
  const exam=S.activeExam,questions=exam.questionsList;
  const container=document.getElementById('result-cards-container');if(!container)return;
  const toShow=S._wrongOnlyMode?questions.filter((q,i)=>_isAnswerWrong(q,i,exam)):questions;
  const wrongCount=questions.filter((q,i)=>_isAnswerWrong(q,i,exam)).length;
  if(S._wrongOnlyMode&&toShow.length===0){container.innerHTML=`<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-title">全部答对了！</div><div class="empty-desc">没有错题</div></div>`;return;}
  container.innerHTML=toShow.map(q=>{
    const i=questions.indexOf(q);
    const correct=q.correct_answer??null,myAns=S.answers[i];
    const qt=getQType(q,exam);
    const isFrq=qt==='frq',isFill=qt==='fill'||qt==='fill_text';
    const isEng=ENG_QTS.includes(qt),isEngFill=qt==='cloze'||qt==='audio_fill';
    const isManual=isFill&&isManualQ(q,qt);
    const _cm=(qt==='choice')?choiceMulti(q):null;
    const cmEarned=_cm?choiceMultiEarnedClient(_cm,myAns,correct):0;
    const engEarned=isEng?engEarnedClient(q,qt,myAns,correct):0;
    const isCorrect=_cm?(cmEarned>=(q.max_score||1)):isEng?(engEarned>=(q.max_score||1)):isFill?(!isManual&&fillAnsCorrect(qt,myAns,correct)):(correct!==null&&myAns===correct);
    let qImgs=[];
    if(q.imgs_json){try{qImgs=JSON.parse(q.imgs_json).filter(Boolean);}catch(e){}}
    if(!qImgs.length){if(q.img_url)qImgs.push(q.img_url);if(q.img_url2)qImgs.push(q.img_url2);}
    const letters=qLetters(q,exam);
    const borderColor=(isFrq||isManual)?(S._frqQScores?.[i]!==undefined?'var(--blue)':'var(--border-md)'):(isCorrect?'var(--green)':'var(--red)');
    const qtBadge=exam.exam_type==='mixed'?`<span class="badge ${isFrq?'badge-amber':(isFill||isEng)?'badge-blue':'badge-gray'}" style="font-size:10px;">${_qtLabel(qt)}</span>`:'';
    const resultTextHtml=(qt==='cloze'||qt==='audio_fill')?String(q.question_text||'').replace(/\[\[(\d+)\]\]|\[([^\[\]\n]+)\]/g,'＿＿'):q.question_text;
    return`<div style="margin-bottom:32px;padding-bottom:28px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;">第 ${i+1} 题</span>
        ${qtBadge}
        ${(isFrq||isManual)?(S._frqQScores?.[i]!==undefined?`<span class="badge badge-blue">${S._frqQScores[i]} / ${q.max_score??1} 分</span>`:'<span class="badge badge-gray">✍️ 待老师批改</span>'):_cm?`<span class="badge ${isCorrect?'badge-green':'badge-red'}">${isCorrect?'✓ 全对':(cmEarned>0?'部分正确':'✗ 错误')} · 得分 ${cmEarned} / ${q.max_score??1}</span>`:isEng?`<span class="badge ${isCorrect?'badge-green':'badge-red'}">${isCorrect?'✓ 全对':'部分正确'} · 得分 ${engEarned} / ${q.max_score??1}</span>`:isCorrect?`<span class="badge badge-green">✓ 正确${q.max_score&&q.max_score>1?` · ${q.max_score}分`:''}</span>`:isFill?`<span class="badge badge-red">✗ 错误</span><span style="font-size:12px;color:var(--text2);">我填了 <strong>${escapeHtml(_fmtAns(myAns))||'未答'}</strong> · 正确答案 <strong style="color:var(--green);">${escapeHtml(_fmtAns(correct))||'?'}</strong></span>`:`<span class="badge badge-red">✗ 错误</span><span style="font-size:12px;color:var(--text2);">我选了 <strong>${letters[myAns]??'未答'}</strong> · 正确答案 <strong style="color:var(--green);">${letters[correct]??'?'}</strong></span>`}
        ${myAns===undefined&&!isFrq&&!isManual?'<span class="badge badge-gray">未作答</span>':''}
      </div>
      <div style="border-left:3px solid ${borderColor};padding-left:16px;">
        ${qImgs.length?`<div style="margin-bottom:14px;">${qImgs.map(u=>`<img src="${u}" style="max-width:100%;display:block;margin-bottom:6px;border-radius:var(--radius-sm);border:1px solid var(--border);" />`).join('')}</div>`:''}
        ${q.audio_url?`<div style="margin-bottom:12px;"><audio controls preload="none" src="${q.audio_url}" style="width:100%;max-width:420px;"></audio></div>`:''}
        ${resultTextHtml?`<div style="font-size:${qt==='reading'?'13':'15'}px;line-height:2;color:var(--text);white-space:pre-wrap;font-family:'DM Mono',monospace;margin-bottom:14px;${qt==='reading'?'max-height:260px;overflow-y:auto;background:var(--surface2);border-radius:var(--radius-sm);padding:12px 16px;':''}">${escapeHtml(resultTextHtml)}</div>`:''}
        ${(isFill||isEngFill)?_fillResultHtml(q,qt,myAns,correct,i):isEng?_engSubsResultHtml(q,qt,myAns,correct):_cm?_multiChoiceResultHtml(q,myAns,correct,letters):isFrq?`
          ${S._frqQScores?.[i]!==undefined||S._frqFeedback?.[i]?`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">${S._frqQScores?.[i]!==undefined?`<div style="background:var(--blue-light);border-radius:var(--radius-sm);padding:6px 14px;font-size:13px;color:var(--blue);font-weight:600;">得分 ${S._frqQScores[i]} / ${q.max_score??1}</div>`:''} ${S._frqFeedback?.[i]?`<div style="background:var(--amber-light);border-left:3px solid var(--amber);border-radius:var(--radius-sm);padding:8px 14px;font-size:13px;color:var(--text);flex:1;white-space:pre-wrap;line-height:1.7;"><span style="font-weight:600;color:var(--amber);">教师评语：</span>${escapeHtml(S._frqFeedback[i])}</div>`:''}</div>`:''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.4px;">我的作答</div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px;line-height:1.7;white-space:pre-wrap;font-family:'DM Mono',monospace;color:${S.frqAnswers?.[i]?'var(--text)':'var(--text3)'};">${escapeHtml(S.frqAnswers?.[i])||'（未作答）'}</div></div>
            <div><div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.4px;">参考答案</div><div style="background:var(--green-light);border:1px solid rgba(59,109,17,0.15);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px;line-height:1.7;white-space:pre-wrap;font-family:'DM Mono',monospace;color:var(--text);">${q.explanation?escapeHtml(q.explanation):'<span style="color:var(--text3);">（暂无参考答案）</span>'}</div></div>
          </div>`:
          `<div style="display:flex;flex-direction:column;gap:5px;">
            ${letters.map((l,ci)=>{
              const isMyAns=ci===myAns,isCorrectAns=ci===correct;
              if(!isMyAns&&!isCorrectAns)return'';
              let bg='var(--surface2)',border='var(--border-md)',color='var(--text2)',weight='400';
              if(isCorrectAns){bg='var(--green-light)';border='var(--green)';color='var(--green)';weight='600';}
              if(isMyAns&&!isCorrect){bg='var(--red-light)';border='var(--red)';color='var(--red)';weight='600';}
              if(isMyAns&&isCorrect){bg='var(--green-light)';border='var(--green)';color='var(--green)';weight='600';}
              return`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);border:1.5px solid ${border};background:${bg};">
                <span style="font-size:13px;font-weight:700;color:${color};min-width:18px;">${l}</span>
                <span style="flex:1;font-size:14px;font-weight:${weight};color:${color};">${l}</span>
                ${isMyAns&&!isCorrect?'<span style="font-size:11px;color:var(--red);font-weight:600;">← 我的选择</span>':''}
                ${isCorrectAns?'<span style="font-size:11px;color:var(--green);font-weight:600;">✓ 正确答案</span>':''}
              </div>`;
            }).join('')}
          </div>
          ${q.explanation?`<div style="margin-top:10px;background:var(--amber-light);border-left:3px solid var(--amber);border-radius:var(--radius-sm);padding:8px 14px;font-size:13px;color:var(--text);line-height:1.7;"><span style="font-weight:600;color:var(--amber);">解析：</span>${escapeHtml(q.explanation)}</div>`:''}`}
      </div>
    </div>`;
  }).join('');
  const wrongLabel=document.getElementById('wrong-count-label');if(wrongLabel)wrongLabel.textContent=`共 ${wrongCount} 题错误`;
}

function showResults(score,total,questions){
  const exam=S.activeExam;
  S._lastResult={examId:exam?.id,score,total};
  const isPractice=S._isPracticeMode;S._isPracticeMode=false;
  if(questions&&exam&&exam.questionsList){questions.forEach((q,i)=>{if(q.correct_answer!==undefined&&exam.questionsList[i])exam.questionsList[i].correct_answer=q.correct_answer;});}
  const isFrqExam=exam.exam_type==='frq';
  const hasManualGrading=!isPractice&&(isFrqExam||exam.questionsList.some(q=>{const qt=getQType(q,exam);return qt==='frq'||isManualQ(q,qt);}));
  const isPrivate=(exam.is_private===1||exam.is_private===true)&&!isPractice;
  const pct=total>0?Math.round((score||0)/total*100):0;
  const{fg}=scoreColor(pct);
  const label=pct>=80?'优秀！':pct>=60?'良好，继续加油 💪':'需要多加复习 📖';
  const wrongCount=(isFrqExam||hasManualGrading)?0:questions.filter((q,i)=>_isAnswerWrong(q,i,exam)).length;
  const _heroHtml=(()=>{
    if(hasManualGrading){
      if(isPractice)return`<div style="font-size:48px;margin:12px 0;">✍️</div><div style="font-size:18px;font-weight:600;margin-top:4px;">练习完成</div>`;
      const isGraded=S._frqQScores&&Object.keys(S._frqQScores).length>0;
      if(isGraded)return`<div style="font-size:48px;margin:12px 0;">📝</div><div style="font-size:22px;font-weight:700;margin-top:4px;">已批改</div><div style="font-size:28px;font-weight:700;color:var(--blue);margin-top:6px;">${score} <span style="font-size:16px;color:var(--text2);font-weight:400;">/ ${S._frqMaxScore??total} 分</span></div>`;
      return`<div style="font-size:48px;margin:12px 0;">⏳</div><div style="font-size:18px;font-weight:600;margin-top:4px;">待批改</div><div style="font-size:14px;color:var(--text2);margin-top:6px;">含人工批改题目，提交成功 · 老师批改后可查看完整成绩</div>`;
    }
    return`<div class="result-score" style="color:${fg};">${pct}%</div><div style="font-size:16px;margin-top:8px;">${score} / ${total} 分</div><div style="font-size:14px;color:var(--text2);margin-top:4px;">${label}</div>`;
  })();
  showScreen('results');
  document.getElementById('results-content').innerHTML=`
    <div style="padding:12px 28px;">
    ${isPractice?`<div class="card mb-2" style="background:var(--blue-light);border-color:var(--blue-mid);padding:10px 16px;display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">🏋️</span><div><div style="font-size:13px;font-weight:600;color:var(--blue);">练习模式</div><div style="font-size:12px;color:var(--blue);">本次作答不计入成绩</div></div></div>`:''}
    <div class="card mb-3 result-hero">
      <div style="font-size:13px;color:var(--text2);margin-bottom:6px;">${exam.name}</div>
      ${_heroHtml}
    </div>
    ${isPrivate?`<div class="card mb-3" style="background:var(--surface2);border:1px solid var(--border);text-align:center;padding:16px 20px;"><div style="font-size:14px;color:var(--text2);">🔒 本场为隐私模式，仅显示成绩，题目与答案不对外开放</div></div>`:`
    ${!isFrqExam&&!hasManualGrading&&wrongCount>0&&!isPractice?`
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
      <button onclick="exportWrongPdf()" class="btn btn-lg" style="background:var(--surface);border:1.5px solid var(--border-md);color:var(--text);gap:8px;font-size:14px;"><span style="font-size:16px;">📄</span> 导出错题 PDF</button>
    </div>`:''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <span id="wrong-count-label" style="font-size:13px;color:var(--text2);">共 ${wrongCount} 题错误</span>
      ${wrongCount>0?`<button id="wrong-only-btn" onclick="toggleWrongOnly()" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid var(--border-md);background:var(--surface);color:var(--text2);transition:all 0.15s;">✗ 只看错题</button>`:''}
    </div>
    <div id="result-cards-container"></div>`}
    <button class="btn btn-primary btn-block btn-lg mb-3" onclick="returnToStudent()">返回我的考试</button>
    </div>`;
  if(!isPrivate)_renderResultCards();
}

function exportWrongPdf(){
  const exam=S.activeExam,questions=exam.questionsList;
  const wrongQs=questions.map((q,i)=>{
    const qt=getQType(q,exam);
    const correct=q.correct_answer??null,myAns=S.answers[i];
    if(correct===null&&qt!=='frq')return null;
    const _cmp=choiceMulti(q);
    const isWrong=ENG_QTS.includes(qt)?engEarnedClient(q,qt,myAns,correct)<(q.max_score||1):_cmp?choiceMultiEarnedClient(_cmp,myAns,correct)<(q.max_score||1):qt==='fill'?!numEqC(myAns,correct):qt==='fill_text'?!strEqC(myAns,correct):(myAns!==correct);
    if(!isWrong)return null;
    let qImgs=[];
    if(q.imgs_json){try{qImgs=JSON.parse(q.imgs_json).filter(Boolean);}catch(e){}}
    if(!qImgs.length){if(q.img_url)qImgs.push(q.img_url);if(q.img_url2)qImgs.push(q.img_url2);}
    return{idx:i+1,q,myAns,correct,qImgs,qt};
  }).filter(Boolean);
  if(!wrongQs.length){toast('没有错题');return;}
  const now=new Date().toLocaleDateString('zh-CN');
  const rows=wrongQs.map(({idx,q,myAns,correct,qImgs,qt})=>{const letters=qLetters(q,exam);const _cmp=choiceMulti(q);
    const _selTxt=_cmp?((Array.isArray(myAns)?myAns:[myAns]).map(Number).filter(n=>!isNaN(n)).map(x=>letters[x]||x).join('')||'未答'):'';
    const _corTxt=_cmp?((Array.isArray(correct)?correct:[correct]).map(Number).map(x=>letters[x]||x).join('')):'';
    return`
    <div class="q-block">
      <div class="q-header">
        <span class="q-num">第 ${idx} 题</span>
        ${(qt==='fill'||qt==='fill_text')?`<span class="wrong-tag">✗ 我填了 ${myAns??'?'}</span><span class="correct-tag">✓ 正确答案 ${correct}</span>`:_cmp?`<span class="wrong-tag">✗ 我选了 ${_selTxt}</span><span class="correct-tag">✓ 正确答案 ${_corTxt}</span>`:`<span class="wrong-tag">✗ 我选了 ${letters[myAns]??'?'}</span><span class="correct-tag">✓ 正确答案 ${letters[correct]??'?'}</span>`}
      </div>
      ${q.question_text?`<div class="q-text">${q.question_text}</div>`:''}
      ${qImgs.map(u=>`<img src="${u.startsWith('http')?u:window.location.origin+u}" class="q-img" />`).join('')}
      ${q.explanation?`<div class="explanation"><strong>解析：</strong>${q.explanation}</div>`:''}
    </div>`;}).join('');
  const html=`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>${exam.name} 错题本</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: 'PingFang SC','Microsoft YaHei',sans-serif; font-size: 14px; color: #1a1a18; background: white; padding: 32px 40px; } h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; } .meta { font-size: 12px; color: #888; margin-bottom: 28px; } .q-block { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px; page-break-inside: avoid; } .q-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; } .q-num { font-weight: 700; font-size: 15px; } .wrong-tag { background: #FCEBEB; color: #A32D2D; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; } .correct-tag { background: #EAF3DE; color: #3B6D11; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; } .q-text { font-size: 14px; line-height: 1.8; color: #333; margin-bottom: 10px; white-space: pre-wrap; } .q-img { max-width: 100%; border-radius: 6px; border: 1px solid #eee; margin: 8px 0; display: block; } .explanation { margin-top: 12px; background: #F0EFE9; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #555; line-height: 1.7; } @media print { body { padding: 16px 20px; } .q-block { break-inside: avoid; } }</style>
</head><body><h1>${exam.name} · 错题本</h1><div class="meta">科目：${exam.subject} &nbsp;·&nbsp; 共 ${wrongQs.length} 道错题 &nbsp;·&nbsp; 导出时间：${now}</div>${rows}</body></html>`;
  const win=window.open('','_blank');win.document.write(html);win.document.close();win.onload=()=>{win.print();};
}


function _updateLocalRecord(examId,studentKeyId,result){
  const item=_studentExamItems.find(i=>i.exam.id===examId);if(!item)return;
  item.record={score:result.score,total:result.total,frq_score:result.frq_score??null,frq_max_score:result.frq_max_score??null,answers_data:S.answers||{},frq_answers:S.frqAnswers||{},frq_feedback:{},frq_q_scores:{},correct_answers:result.correct_answers||{},created_at:new Date().toLocaleString('zh-CN')};
}
async function returnToStudent(){
  showScreen('student');const studentName=S.student.name;
  if(_studentExamItems.length){
    _renderStudentLayout(studentName,_studentExamItems);
    api('GET','/api/student/exams',{student_name:studentName}).then(items=>{items.forEach(item=>{const local=_studentExamItems.find(i=>i.exam.id===item.exam.id);if(local?.record&&!item.record)item.record=local.record;});_studentExamItems=items;_renderStudentLayout(studentName,items);}).catch(()=>{});
  } else{
    try{const saved=localStorage.getItem('fav_'+studentName);S._favorites=new Set(saved?JSON.parse(saved):[]);}catch(e){S._favorites=new Set();}
    const items=await api('GET','/api/student/exams',{student_name:studentName});
    _studentExamItems=items;S._navSubject='';S._navType='all';S._navPage=1;_renderStudentLayout(studentName,items);
  }
}

init();
