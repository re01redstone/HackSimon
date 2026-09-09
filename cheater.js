// ==UserScript==
// @name         HackSimon
// @namespace    http://tampermonkey.net/
// @version      v1.1
// @description  try to take over the world!
// @author       Hypergryph Network
// @match        http://simon.nekko.cn:1234/

// @grant        unsafeWindow

// ==/UserScript==

// ── 低可见度模式 ───────────────────────────────────────────
let _lowVisMode = false;
let _doubaoBar = null;  // 豆包标题栏引用，用于低可见度切换

function applyLowVis() {
    // 豆包标题栏
    if (_doubaoBar) {
        _doubaoBar.style.background = _lowVisMode ? '#f5f5f5' : '#1a1a2e';
        _doubaoBar.style.color = _lowVisMode ? '#aaa' : '#fff';
    }
    // 豆包面板阴影
    if (_doubaoPanel) {
        _doubaoPanel.style.boxShadow = _lowVisMode ? 'none' : '0 8px 40px rgba(0,0,0,0.35)';
    }
    // GUI 标题栏
    const guiBar = document.getElementById('gui-panel-bar');
    if (guiBar) {
        guiBar.style.background = _lowVisMode ? '#f5f5f5' : '#1a1a2e';
        guiBar.style.color = _lowVisMode ? '#aaa' : '#fff';
    }
    // GUI 面板阴影
    if (_guiPanel) {
        _guiPanel.style.boxShadow = _lowVisMode ? 'none' : '0 8px 40px rgba(0,0,0,0.35)';
    }
}

function showToast(message, duration = 1000) {
    // 如果已存在消息框，先移除旧的（保证只有一个）
    const existing = document.getElementById('toast-message');
    if (existing) existing.remove();

    // 创建新消息框
    const toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.textContent = message;

    // 基础样式
    const bg = _lowVisMode ? 'rgba(245,245,245,0.95)' : 'rgba(20,20,20,0.8)';
    const fg = _lowVisMode ? '#aaa' : '#f0f0ff';
    const shadow = _lowVisMode ? 'none' : '0 2px 10px rgba(255,255,255,0.3)';
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: bg,
        color: fg,
        padding: '10px 20px',
        borderRadius: '6px',
        fontSize: '14px',
        fontFamily: 'sans-serif',
        zIndex: '9999',
        boxShadow: shadow,
        opacity: '0',
        transition: 'opacity 0.2s ease'
    });

    document.body.appendChild(toast);
    // 强制重绘后淡入
    setTimeout(() => { toast.style.opacity = '1'; }, 10);

    // 设置自动消失
    if (duration > 0) {
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 200);
        }, duration);
    }
}

let cheatQuestionsList;

async function getData(id) {
    cheatQuestionsList = await api('GET', `/api/questions/${id}?role=teacher`);
    //I cracked the code:)
    console.log('=== 题目总数:', cheatQuestionsList.length, '===');
    cheatQuestionsList.forEach((q, i) => {
        const raw = q.correct_answer;
        const type = q.question_type || '?';
        console.log(
            `[${i}] type=${type} | correct_answer=`, raw,
            `| typeof=${typeof raw} | isArray=${Array.isArray(raw)} | [1]=${raw?.[1]}`,
            q
        );
    });
}

// ── 随机抽卡 ──────────────────────────────────────────────
async function randomDraw() {
    const R = (typeof NEBSReward !== 'undefined') ? NEBSReward : (unsafeWindow && unsafeWindow.NEBSReward);
    if (!R) {
        showToast('NEBSReward 未加载，请先进入考试或图鉴页面');
        return;
    }
    try {
        const d = await api('GET', '/api/collection/cards', {});
        const cards = d.cards || [];
        if (!cards.length) {
            showToast('卡池为空');
            return;
        }
        const card = cards[Math.floor(Math.random() * cards.length)];
        showToast('抽卡: ' + (card.cn || card.en || '???'));
        R.play({ card: card });
    } catch (e) {
        showToast('抽卡失败: ' + e.message);
        console.error('randomDraw error:', e);
    }
}

    // ── 豆包嵌入式弹窗 ────────────────────────────────────────
let _doubaoPanel = null;

function toggleDoubao() {
    // 已存在 → 关闭
    if (_doubaoPanel) {
        _doubaoPanel.remove();
        _doubaoPanel = null;
        _doubaoBar = null;
        return;
    }
    // 创建容器
    _doubaoPanel = document.createElement('div');
    _doubaoPanel.id = 'doubao-panel';
    Object.assign(_doubaoPanel.style, {
        position: 'fixed',
        top: '10%',
        right: '20px',
        width: '420px',
        height: '75%',
        zIndex: '99999',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        resize: 'both',
        minWidth: '300px',
        minHeight: '300px'
    });

    // 标题栏（可拖拽）
    const bar = document.createElement('div');
    _doubaoBar = bar;  // 保存引用，供低可见度模式使用
    bar.textContent = '🤖 豆包助手';
    const barBg = _lowVisMode ? '#f5f5f5' : '#1a1a2e';
    const barFg = _lowVisMode ? '#333' : '#fff';
    Object.assign(bar.style, {
        padding: '10px 14px',
        background: barBg,
        color: barFg,
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'move',
        flexShrink: '0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        userSelect: 'none'
    });
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
        cursor: 'pointer',
        fontSize: '18px',
        padding: '0 4px',
        opacity: '0.7'
    });
    closeBtn.onclick = (e) => { e.stopPropagation(); toggleDoubao(); };
    bar.appendChild(closeBtn);

    // 拖拽
    let dragging = false, ox, oy;
    bar.onmousedown = (e) => {
        dragging = true;
        ox = e.clientX - _doubaoPanel.offsetLeft;
        oy = e.clientY - _doubaoPanel.offsetTop;
        document.body.style.userSelect = 'none';
    };
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        _doubaoPanel.style.left = (e.clientX - ox) + 'px';
        _doubaoPanel.style.top = (e.clientY - oy) + 'px';
        _doubaoPanel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.userSelect = '';
    });

    // iframe
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.doubao.com/chat/';
    Object.assign(iframe.style, {
        flex: '1',
        border: 'none',
        width: '100%',
        height: '100%'
    });
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');

    _doubaoPanel.appendChild(bar);
    _doubaoPanel.appendChild(iframe);
    document.body.appendChild(_doubaoPanel);
}

// ── GUI 控制面板 ───────────────────────────────────────────
let _guiPanel = null;

function toggleGui() {
    if (_guiPanel) {
        _guiPanel.remove();
        _guiPanel = null;
        return;
    }

    _guiPanel = document.createElement('div');
    _guiPanel.id = 'gui-panel';
    Object.assign(_guiPanel.style, {
        position: 'fixed',
        top: '10%',
        right: '480px',
        width: '300px',
        height: 'auto',
        zIndex: '99999',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        resize: 'both',
        minWidth: '260px',
        minHeight: '200px'
    });

    // 标题栏（可拖拽）
    const bar = document.createElement('div');
    bar.id = 'gui-panel-bar';
    bar.textContent = '⚙ HackSimon';
    const barBg = _lowVisMode ? '#f5f5f5' : '#1a1a2e';
    const barFg = _lowVisMode ? '#333' : '#fff';
    Object.assign(bar.style, {
        padding: '10px 14px',
        background: barBg,
        color: barFg,
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'move',
        flexShrink: '0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        userSelect: 'none'
    });
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
        cursor: 'pointer',
        fontSize: '18px',
        padding: '0 4px',
        opacity: '0.7'
    });
    closeBtn.onclick = (e) => { e.stopPropagation(); toggleGui(); };
    bar.appendChild(closeBtn);

    // 拖拽
    let dragging = false, ox, oy;
    bar.onmousedown = (e) => {
        dragging = true;
        ox = e.clientX - _guiPanel.offsetLeft;
        oy = e.clientY - _guiPanel.offsetTop;
        document.body.style.userSelect = 'none';
    };
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        _guiPanel.style.left = (e.clientX - ox) + 'px';
        _guiPanel.style.top = (e.clientY - oy) + 'px';
        _guiPanel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        document.body.style.userSelect = '';
    });

    // 内容区
    const content = document.createElement('div');
    Object.assign(content.style, {
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontSize: '13px',
        fontFamily: 'sans-serif',
        color: '#333'
    });

    // 考试 ID
    const examIdRow = document.createElement('div');
    examIdRow.style.display = 'flex';
    examIdRow.style.justifyContent = 'space-between';
    examIdRow.style.alignItems = 'center';
    const examIdLabel = document.createElement('span');
    examIdLabel.textContent = '考试 ID:';
    examIdLabel.style.color = '#888';
    const examIdRight = document.createElement('div');
    examIdRight.style.display = 'flex';
    examIdRight.style.alignItems = 'center';
    examIdRight.style.gap = '8px';
    const examIdValue = document.createElement('span');
    examIdValue.id = 'gui-exam-id';
    examIdValue.textContent = S.activeExam?.id || '（未开始考试）';
    examIdValue.style.fontWeight = '600';
    examIdValue.style.color = '#1a1a2e';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.title = '复制考试 ID';
    Object.assign(copyBtn.style, {
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '14px',
        padding: '2px 4px',
        borderRadius: '4px',
        opacity: '0.6',
        transition: 'opacity 0.15s'
    });
    copyBtn.onmouseenter = () => { copyBtn.style.opacity = '1'; };
    copyBtn.onmouseleave = () => { copyBtn.style.opacity = '0.6'; };
    copyBtn.onclick = () => {
        const id = examIdValue.textContent;
        if (!id || id === '（未开始考试）') return;
        const ta = document.createElement('textarea');
        ta.value = id;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('考试 ID 已复制: ' + id);
        } catch (e) {
            showToast('复制失败');
        }
        document.body.removeChild(ta);
    };
    examIdRight.appendChild(examIdValue);
    examIdRight.appendChild(copyBtn);
    examIdRow.appendChild(examIdLabel);
    examIdRow.appendChild(examIdRight);

    // 低可见度模式开关
    const lowVisRow = document.createElement('div');
    lowVisRow.style.display = 'flex';
    lowVisRow.style.justifyContent = 'space-between';
    lowVisRow.style.alignItems = 'center';
    const lowVisLabel = document.createElement('span');
    lowVisLabel.textContent = '低可见度模式';
    lowVisLabel.style.color = '#888';
    const toggle = document.createElement('label');
    toggle.style.cssText = 'position:relative;display:inline-block;width:44px;height:24px;cursor:pointer';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = _lowVisMode;
    checkbox.style.opacity = '0';
    checkbox.style.width = '0';
    checkbox.style.height = '0';
    const slider = document.createElement('span');
    slider.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:#ccc;border-radius:24px;transition:0.3s';
    const sliderDot = document.createElement('span');
    sliderDot.style.cssText = 'position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:white;border-radius:50%;transition:0.3s';
    slider.appendChild(sliderDot);
    toggle.appendChild(checkbox);
    toggle.appendChild(slider);

    checkbox.addEventListener('change', () => {
        _lowVisMode = checkbox.checked;
        slider.style.background = _lowVisMode ? '#4caf50' : '#ccc';
        sliderDot.style.transform = _lowVisMode ? 'translateX(20px)' : 'translateX(0)';
        applyLowVis();
    });

    // 初始状态
    if (_lowVisMode) {
        slider.style.background = '#4caf50';
        sliderDot.style.transform = 'translateX(20px)';
    }

    lowVisRow.appendChild(lowVisLabel);
    lowVisRow.appendChild(toggle);

    // 随机抽卡按钮
    const drawRow = document.createElement('div');
    drawRow.style.display = 'flex';
    drawRow.style.justifyContent = 'center';
    const drawBtn = document.createElement('button');
    drawBtn.textContent = '🃏 模拟随机抽卡';
    Object.assign(drawBtn.style, {
        padding: '10px 24px',
        fontSize: '14px',
        fontWeight: '600',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(102,126,234,0.4)',
        transition: 'transform 0.15s, box-shadow 0.15s'
    });
    drawBtn.onmouseenter = () => {
        drawBtn.style.transform = 'scale(1.05)';
        drawBtn.style.boxShadow = '0 4px 16px rgba(102,126,234,0.6)';
    };
    drawBtn.onmouseleave = () => {
        drawBtn.style.transform = 'scale(1)';
        drawBtn.style.boxShadow = '0 2px 8px rgba(102,126,234,0.4)';
    };
    drawBtn.onclick = () => randomDraw();
    drawRow.appendChild(drawBtn);

    content.appendChild(examIdRow);
    content.appendChild(lowVisRow);
    content.appendChild(drawRow);

    _guiPanel.appendChild(bar);
    _guiPanel.appendChild(content);
    document.body.appendChild(_guiPanel);
}

(function() {
    'use strict';
    // 禁用反作弊，覆写函数
    triggerAntiCheat = function() {
        if (!document.getElementById('screen-exam')?.classList.contains('active')) return;
        S.tabSwitches = 0;
        saveExamState();
        const overlay = document.getElementById('anticheat-overlay');
        const msgEl = document.getElementById('anticheat-msg');
        const countEl = document.getElementById('anticheat-count');
        const btnEl = document.getElementById('anticheat-btn');
        if (!overlay) return;
        countEl.textContent = S.tabSwitches;
        msgEl.textContent = `虽然但是，犯瘤蟀管不着你。`;
        btnEl.style.display = '';
        btnEl.textContent = '我知道错了，下次还干';
        btnEl.onclick = () => { overlay._shouldShow = false; overlay.style.display = 'none'; };
        overlay._shouldShow = true;
        overlay.style.display = 'flex';
    };

    // 解析 subs_json（可能是 JSON 字符串或已解析对象）
    function parseSubs(subs) {
        if (!subs) return null;
        if (typeof subs === 'string') {
            try { return JSON.parse(subs); } catch (e) { return null; }
        }
        return subs;
    }

    // 从题目对象中提取答案：多选读 subs_json.correct，单选读 correct_answer
    function getAnswer(q) {
        const subs = parseSubs(q.subs_json);
        if (subs && subs.multi && Array.isArray(subs.correct)) {
            return { multi: true, answer: subs.correct };
        }
        return { multi: false, answer: q.correct_answer };
    }

    // 将答案索引转为字母（0→A, 1→B, ...），多选用逗号分隔
    function answerToLetters(result) {
        if (result === null || result.answer === null || result.answer === undefined) return null;
        const ans = result.answer;
        if (result.multi) {
            return ans.map(i => String.fromCharCode(65 + i)).join(', ');
        }
        return String.fromCharCode(65 + ans);
    }

    document.addEventListener('keydown', function(event) {
        // 输入框内不触发快捷键
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        if (event.key === 'w') {
            getData(S.activeExam.id);
            showToast("获取答案数据成功");
        }
        // E: 打开/关闭豆包弹窗
        if (event.key === 'e') {
            toggleDoubao();
        }
        // G: 打开/关闭 GUI 控制面板
        if (event.key === 'g') {
            toggleGui();
        }
        // Q: 查看当前题目答案
        if (event.key === 'q') {
            if (!cheatQuestionsList) { showToast("请先按 W 获取答案数据"); return; }
            let currentQIdx = S.currentQIdx;
            let result = getAnswer(cheatQuestionsList[currentQIdx]);
            let letters = answerToLetters(result);
            let typeLabel = result.multi ? '【多选】' : '';
            if (letters) {
                showToast("第" + (currentQIdx + 1) + "题" + typeLabel + "答案: " + letters);
            } else {
                showToast("答案走丢了 (subs_json=" + JSON.stringify(cheatQuestionsList[currentQIdx].subs_json) + " correct_answer=" + cheatQuestionsList[currentQIdx].correct_answer + ")");
            }
        }
        // A: 一键填充所有答案
        if (event.key === 'a') {
            if (!cheatQuestionsList) { showToast("请先按 W 获取答案数据"); return; }
            let singleCount = 0, multiCount = 0;
            cheatQuestionsList.forEach((q, index) => {
                let result = getAnswer(q);
                if (result.answer === null || result.answer === undefined) return;
                S.answers[index] = result.answer;  // 单选是数字，多选是数组，直接存
                result.multi ? multiCount++ : singleCount++;
            });
            saveExamState();
            showToast("填充完成: " + singleCount + " 单选 + " + multiCount + " 多选");
            // 跳转到最后一题，触发提交确认
            const lastIdx = cheatQuestionsList.length - 1;
            S.currentQIdx = lastIdx;
            if (typeof renderQuestion === 'function') renderQuestion(lastIdx);
        }
    });

})();