// ==UserScript==
// @name         fls猎杀者
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  登范刘帅账号
// @author       Paradox Interactive

// @match        http://simon.nekko.cn
// @run-at       document-end
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    function teacherInformation(id,full_name) {
        this.id=id;
        this.full_name=full_name;
    }
    teacherLogin = function() {
        hideAlert('tea-alert');
        const result = new teacherInformation();
        result.full_name = 'fls猎杀者';
        result.id = 'teacher-1'

        S.teacher = result; S.role = 'teacher';
        sessionStorage.setItem('teacher', JSON.stringify(result.teacher));
        showTeacherDashboard();
    }
})();