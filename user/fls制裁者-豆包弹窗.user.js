// ==UserScript==
// @name         fls制裁者
// @namespace    http://tampermonkey.net/
// @version      豆包弹窗
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

let cheatQuestionsList;

async function getData(id) {
    cheatQuestionsList = await api('GET', `/api/questions/${id}?role=teacher`);
    console.log(cheatQuestionsList);
}

(function() {
    'use strict';
    document.addEventListener('keydown', function(event) {
        if (event.key === 'p') {
            getData(S.activeExam.id);
        }
        // 检查按下的键是否为 q
        if (event.key === 'q') {
            let currentQIdx = S.currentQIdx;
            let answer = cheatQuestionsList[currentQIdx].choices[cheatQuestionsList[currentQIdx].correct_answer];
            showToast("第" + (currentQIdx+1) + "题答案是："+answer);
        }
        if(event.key === 'd'){
            const targetDiv = document.getElementById('screen-exam');
            if (targetDiv) {
                // 创建 iframe 元素
                const iframe = document.createElement('iframe');
                iframe.src = 'https://www.doubao.com';
                iframe.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    width: 1280px;
                    height: 720px;
                    transform: translate(-50%, -50%) scale(0.75);
                    transform-origin: center center;
                    border: none;
                    border-radius: 12px;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
                    z-index: 9999;
                `;
                iframe.className = 'doubao-injected-iframe';
                const existing = targetDiv.querySelector('.doubao-injected-iframe');
                if(existing){
                    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
                }
                else targetDiv.appendChild(iframe);
            }
        }
    });

})();
