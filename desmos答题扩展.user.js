// ==UserScript==
// @name         Desmos答题扩展
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  Add Desmos to Nebs Mock Exam System
// @author       Potpot123
// @match        http://simon.nekko.cn:1234/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    function openDesmos(){
        const targetDiv = document.getElementById('screen-exam');
        if (targetDiv) {
            // 创建 iframe 元素
            const iframe = document.createElement('iframe');
            iframe.src = 'https://www.desmos.com/calculator';
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
    // 插入按钮
    function insertButton() {
        const navRight = document.querySelector("#screen-exam > nav > div.nav-right");
        if (!navRight) return;

        // 避免重复插入
        if (navRight.querySelector('.desmos-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'btn btn-sm desmos-btn';
        btn.textContent = 'Desmos';
        
        // 绑定点击事件
        btn.addEventListener('click', openDesmos);

        navRight.appendChild(btn);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertButton);
    } else {
        insertButton();
    }
    
})();
