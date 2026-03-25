// ==UserScript==
// @name         fls制裁者
// @namespace    http://tampermonkey.net/
// @version      1936-03-11
// @description  try to take over the world!
// @author       Ubisoft
// @match        http://simon.nekko.cn:1234/
// @grant        unsafeWindow
// ==/UserScript==

function showToast(message, duration = 1000) {
    // 如果已存在消息框，先移除旧的（保证只有一个）
    const existing = document.getElementById('toast-message');
    if (existing) existing.remove();

    // 创建新消息框
    const toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.textContent = message;

    // 基础样式
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '6px',
        fontSize: '14px',
        fontFamily: 'sans-serif',
        zIndex: '9999',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
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

(function() {
    'use strict';

    document.addEventListener('keydown', function(event) {
        // 检查按下的键是否为 p
        if (event.key === 'p') {
            let currentQIdx = S.currentQIdx;
            let data=S.activeExam.questionsList[currentQIdx];
            let answer = data.choices[data.correct_answer];
            showToast("第" + (currentQIdx+1) + "题答案是："+answer);
        }
    });

})();
