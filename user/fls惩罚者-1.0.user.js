// ==UserScript==
// @name         fls惩罚者
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  fls惩罚者
// @author       琳琅天上

// @match        http://simon.nekko.cn
// @run-at       document-end
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    triggerAntiCheat = function() {
        if (!document.getElementById('screen-exam')?.classList.contains('active')) return;
        S.tabSwitches = 0;
        saveExamState();
        // 同步到服务器，防止关闭页面后切屏次数丢失
        if (S.student?.studentKeyId) {
            api('POST', '/api/records/tab-switches', {
                student_key_id: S.student.studentKeyId,
                tab_switches: S.tabSwitches
            }).catch(() => {});
        }
        const overlay = document.getElementById('anticheat-overlay');
        const msgEl = document.getElementById('anticheat-msg');
        const countEl = document.getElementById('anticheat-count');
        const btnEl = document.getElementById('anticheat-btn');
        if (!overlay) return;
        countEl.textContent = S.tabSwitches;
        if (S.tabSwitches >= 3) {
            // 直接强制提交，不给学生任何选择
            msgEl.textContent = '你已离开考试页面 3 次，系统正在自动提交你的答卷…';
            btnEl.style.display = 'none';
            overlay._shouldShow = true;
            overlay.style.display = 'flex';
            setTimeout(() => autoSubmitExam(), 2000);
            return;
        } else {
            msgEl.textContent = `检测到你离开了考试页面（第 ${S.tabSwitches} 次），再离开 ${99999 - S.tabSwitches} 次将自动提交答卷。`;
            btnEl.style.display = '';
            btnEl.textContent = '我知道了，继续答题';
            btnEl.onclick = () => { overlay._shouldShow = false; overlay.style.display = 'none'; };
        }
        overlay._shouldShow = true;
        overlay.style.display = 'flex';
    };
})();