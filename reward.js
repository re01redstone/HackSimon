/* NEBS 满分奖励 · 过场动画 + 图鉴渲染 (self-contained)
   公开 API: window.NEBSReward = { play(payload), preview(card,opts), cardHTML(card,owned,shiny) } */
(function(){
  if(window.NEBSReward)return;
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const RAR={
    n:{tag:'N',acc:'#3B82F6',glow:'#7CB0FF',parts:44,label:'普通'},
    r:{tag:'R',acc:'#A855F7',glow:'#CB9BFF',parts:170,label:'稀有'},
    s:{tag:'SSR',acc:'#F5B301',glow:'#FFDE7A',parts:280,label:'传说'},
    h:{tag:'???',acc:'#DCE3FF',glow:'#FFFFFF',parts:360,label:'隐藏'},
    L:{tag:'传奇',acc:'#FFCE6E',glow:'#FFF3C8',parts:420,label:'传说角色'}
  };
  const mono=c=>((c&&c.en)?c.en.trim()[0]:'∑').toUpperCase();

  /* ---------- inject CSS ---------- */
  const CSS=`
  #rwd-root{position:fixed;inset:0;z-index:99999;display:none;font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif}
  #rwd-root.on{display:block}
  .rwd-cine{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;
    background:radial-gradient(circle at 50% 46%,rgba(8,12,22,.4),rgba(4,6,12,.9) 70%);backdrop-filter:blur(3px);transition:opacity .25s}
  .rwd-cine.on{opacity:1;pointer-events:auto}
  #rwd-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6}
  .rwd-flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:9;mix-blend-mode:screen;pointer-events:none}
  .rwd-pillar{position:absolute;top:50%;left:50%;width:2px;height:0;transform:translate(-50%,-50%);
    background:linear-gradient(180deg,transparent,var(--rwacc,#7CB0FF),transparent);filter:blur(1px) drop-shadow(0 0 22px var(--rwacc,#7CB0FF));opacity:0;z-index:2}
  .rwd-bar{position:absolute;left:0;right:0;height:0;background:#000;z-index:7;transition:height .45s cubic-bezier(.7,0,.3,1)}
  .rwd-bar.t{top:0}.rwd-bar.b{bottom:0}
  .rwd-rays{position:absolute;inset:-45%;z-index:1;opacity:0;pointer-events:none;filter:blur(1.5px);
    background:repeating-conic-gradient(from 0deg,rgba(255,222,130,.28) 0deg 4deg,transparent 4deg 11deg);
    -webkit-mask:radial-gradient(closest-side,transparent 5%,#000 26%,transparent 76%);mask:radial-gradient(closest-side,transparent 5%,#000 26%,transparent 76%)}
  @keyframes rwd-spin{to{transform:rotate(360deg)}}
  @keyframes rwd-flow{to{stroke-dashoffset:-92}}
  @keyframes rwd-pulse{0%,100%{r:6;opacity:.55}50%{r:10;opacity:1}}
  /* 血迹：每一滩血按次序"啪"地砸在地上，落点带一点过冲 */
  @keyframes rwd-blot{0%{opacity:0;transform:scale(.15)}55%{opacity:1;transform:scale(1.22)}100%{opacity:1;transform:scale(1)}}
  .rwd-blot{opacity:0;transform-origin:0 0;animation:rwd-blot .34s cubic-bezier(.2,1.5,.3,1) both}
  /* 电弧：忽明忽暗地闪，steps 让它跳变而不是渐变 */
  @keyframes rwd-arc{0%,44%{opacity:0}46%,52%{opacity:.95}54%,100%{opacity:0}}
  /* 指示器通道里往前扫的那道光 */
  @keyframes rwd-lane{from{transform:translateX(-26px)}to{transform:translateX(100px)}}
  .rwd-arc{position:absolute;top:50%;left:50%;width:min(94vw,520px);aspect-ratio:1;transform:translate(-50%,-50%) scale(.25);z-index:1;opacity:0;pointer-events:none}
  .rwd-arc .r{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,226,140,.6);box-shadow:0 0 22px rgba(245,179,1,.5),inset 0 0 30px rgba(245,179,1,.22)}
  .rwd-arc .r1{inset:11%;border-style:dashed;animation:rwd-spin 8s linear infinite reverse}
  .rwd-arc .r2{inset:24%;animation:rwd-spin 5.5s linear infinite}
  .rwd-arc .r0{animation:rwd-spin 11s linear infinite}
  .rwd-arc .core{position:absolute;inset:34%;border-radius:50%;background:radial-gradient(circle,rgba(255,242,196,.6),rgba(245,179,1,.15) 55%,transparent 72%);filter:blur(5px)}
  .rwd-arc .gl{position:absolute;top:50%;left:50%;font:700 16px/1 ui-monospace,Menlo,monospace;color:#FFEBB0;text-shadow:0 0 12px rgba(245,179,1,1);transform-origin:0 0}
  .rwd-glyphs{position:absolute;inset:0;animation:rwd-spin 20s linear infinite}
  .rwd-impact{position:absolute;top:24%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:8;opacity:0}
  .rwd-word{position:relative;font-family:"Arial Black","Helvetica Neue",system-ui,sans-serif;font-weight:900;font-size:clamp(42px,11vw,120px);letter-spacing:-2px;line-height:.9;transform:scaleX(1.06)}
  .rwd-word .l{position:absolute;inset:0}.rwd-word .w{position:relative;color:#fff}
  .rwd-word .rc{color:#ff2d55;mix-blend-mode:screen}.rwd-word .cy{color:#22e0ff;mix-blend-mode:screen}
  .rwd-sub{margin-top:8px;font:700 clamp(13px,2.6vw,22px)/1 "Arial Black",system-ui;letter-spacing:8px;color:var(--rwacc,#7CB0FF);text-shadow:0 0 18px var(--rwacc,#7CB0FF)}
  .rwd-legend{position:absolute;top:62%;left:50%;transform:translate(-50%,-50%) scale(.6);z-index:8;opacity:0;
    font:900 clamp(32px,9.5vw,90px)/1 "Arial Black",system-ui;letter-spacing:2px;
    background:linear-gradient(90deg,#FFD65A,#fff6d5,#FFB300,#fff,#FFD65A);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 0 10px rgba(255,210,90,.95)) drop-shadow(0 0 34px rgba(245,179,1,.8))}
  .rwd-cere{position:absolute;z-index:8;text-align:center;opacity:0;transform:translateY(10px)}
  .rwd-cere .a{font:700 12px/1 ui-monospace,monospace;letter-spacing:6px;color:#8A93A8}
  .rwd-cere .b{margin-top:12px;font:900 clamp(24px,7vw,54px)/1 "Arial Black",system-ui;letter-spacing:1px;background:linear-gradient(90deg,#7CB0FF,#CB9BFF,#FFDE7A);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 30px rgba(120,150,220,.4)}
  .rwd-cere .c{margin-top:10px;font:600 12px/1.5 system-ui;letter-spacing:2px;color:#8A93A8}
  .rwd-cardwrap{position:relative;z-index:3;opacity:0;transform:translateY(26px) scale(.9);perspective:1400px}
  /* 揭卡前的硬屏蔽：!important 的作者声明优先级高于动画，任何 fill:'forwards' 的残留都盖不过它 */
  .rwd-cardwrap.rwd-hide{opacity:0!important;visibility:hidden!important}
  .rwd-card{width:min(70vw,236px);aspect-ratio:5/7;position:relative;transform-style:preserve-3d;transform:rotateY(180deg);border-radius:16px}
  .rwd-face{position:absolute;inset:0;border-radius:16px;overflow:hidden;backface-visibility:hidden;border:1.5px solid var(--rwacc,#7CB0FF)}
  .rwd-face.flat{border:3.5px solid #16161c;border-radius:22px;overflow:visible;box-shadow:7px 9px 0 rgba(0,0,0,.5)}
  .rwd-back{transform:rotateY(180deg);display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,rgba(120,150,210,.10) 0 10px,transparent 10px 20px),linear-gradient(160deg,#16203a,#0b1122)}
  .rwd-back:after{content:"∑";font:900 46px/1 "Arial Black";color:rgba(140,170,230,.5);text-shadow:0 0 20px rgba(120,150,210,.5)}
  .rwd-front{transform:rotateY(0deg);display:flex;flex-direction:column;padding:0;background:linear-gradient(165deg,#141d33,#0a1020)}
  .rwd-art{position:relative;width:100%;height:60%;overflow:hidden;background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--rwacc) 22%,#0a1020),#0a1020 82%)}
  .rwd-art .rwd-pimg{width:100%;height:100%;object-fit:cover;display:block}
  .rwd-art:after{content:"";position:absolute;left:0;right:0;bottom:0;height:44%;background:linear-gradient(180deg,transparent,#0e1524);pointer-events:none}
  .rwd-art .rwd-pfallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:900 clamp(30px,9vw,52px)/1 "Arial Black",system-ui;color:var(--rwacc,#7CB0FF);text-shadow:0 0 20px var(--rwacc,#7CB0FF)}
  .rwd-art.noimg .rwd-pfallback{display:flex}
  .rwd-arttop{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:8px 9px;z-index:2}
  .rwd-info{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 12px 12px}
  .rwd-rarity{font:800 9px/1 ui-monospace,monospace;letter-spacing:2px;color:var(--rwacc,#7CB0FF);text-shadow:0 0 10px color-mix(in srgb,var(--rwacc) 60%,transparent)}
  .rwd-front.rainbow:after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;mix-blend-mode:color-dodge;opacity:.5;background:conic-gradient(from 0deg,#ff2d55,#ffd65a,#22e0ff,#a855f7,#ff2d55);background-size:180% 180%;animation:rwd-holo 3.2s linear infinite}
  @keyframes rwd-holo{to{background-position:180% 180%}}
  .rwd-heaven{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 40%,rgba(255,242,205,.6),rgba(255,206,120,.18) 42%,rgba(10,8,4,0) 74%)}
  .rwd-front.holo:after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;mix-blend-mode:screen;opacity:.6;background:linear-gradient(115deg,transparent 36%,rgba(255,247,214,.75) 47%,rgba(255,255,255,.92) 50%,rgba(255,232,170,.7) 53%,transparent 64%);background-size:250% 250%;animation:rwd-holo2 3.4s linear infinite}
  @keyframes rwd-holo2{0%{background-position:130% 0}100%{background-position:-130% 0}}
  .rwd-hero{position:relative;width:100%;height:100%;overflow:hidden;border-radius:inherit;background:radial-gradient(circle at 50% 30%,#1a2238,#0a1020 82%)}
  .rwd-hero .rwd-hpimg{width:100%;height:100%;object-fit:cover;object-position:center 22%;display:block}
  .rwd-hero:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(6,8,16,.94) 0,rgba(6,8,16,.30) 30%,transparent 52%);pointer-events:none}
  .rwd-hero .rwd-pfallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:900 clamp(30px,9vw,54px)/1 "Arial Black",system-ui;color:#FFE9A8;text-shadow:0 0 22px #FFCE6E}
  .rwd-hero.noimg .rwd-pfallback{display:flex}
  .rwd-heroframe{position:absolute;inset:9px;border:1px solid rgba(245,224,160,.55);border-radius:8px;pointer-events:none;z-index:2;box-shadow:inset 0 0 26px rgba(245,214,140,.16)}
  .rwd-heroname{position:absolute;left:0;right:0;bottom:15px;text-align:center;z-index:3;font:800 clamp(18px,3.4vw,28px)/1.05 "Songti SC","STSong","Noto Serif SC",serif;letter-spacing:5px;text-indent:5px;color:#fff;text-shadow:0 2px 20px rgba(0,0,0,.7),0 0 18px rgba(255,228,160,.35)}
  .rwd-tsub{display:block;margin-top:4px;font:700 10px/1 system-ui;letter-spacing:4px;text-indent:4px;opacity:.82}
  /* 柴龙恩 · 迟疑卡：哑光纸面、透背微光和几乎看不见的柔边 */
  .rwd-hesitant{position:relative;width:100%;height:100%;overflow:hidden;border-radius:inherit;background:#262a31}
  .rwd-hesitant .rwd-hpimg{width:100%;height:100%;object-fit:cover;object-position:center 17%;display:block;filter:saturate(.88) contrast(.96) brightness(.9)}
  .rwd-hesitant:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(to top,rgba(10,12,17,.91),rgba(10,12,17,.18) 38%,rgba(235,241,250,.035) 67%,transparent);box-shadow:inset 0 0 18px rgba(238,244,255,.08)}
  .rwd-hesitant.noimg{display:flex;align-items:center;justify-content:center}
  .rwd-hesitant .rwd-pfallback{display:none;font:900 48px/1 system-ui;color:#d7dde7}.rwd-hesitant.noimg .rwd-pfallback{display:block}
  .rwd-hesframe{position:absolute;inset:8px;border:1px solid rgba(235,242,255,.16);border-radius:9px;z-index:2;pointer-events:none;box-shadow:0 0 9px rgba(225,235,250,.07),inset 0 0 14px rgba(225,235,250,.04)}
  .rwd-hesname{position:absolute;left:0;right:0;bottom:15px;z-index:3;text-align:center;color:#eef1f6;font:750 clamp(18px,3.4vw,27px)/1.05 "Songti SC","STSong",serif;letter-spacing:5px;text-indent:5px;text-shadow:0 2px 16px rgba(0,0,0,.82)}
  .rwd-hesname .rwd-tsub{color:#b9c0cc;letter-spacing:3px;text-shadow:none;opacity:.78}
  .rwd-hes-edge{top:50%;left:50%;width:min(70vw,236px);aspect-ratio:5/7;transform:translate(-50%,-50%) translateX(-18px);border:1px solid rgba(235,242,255,.18);border-radius:17px;box-shadow:0 0 15px rgba(226,236,252,.08);filter:blur(.45px);z-index:3}
  .rwd-hes-backlight{inset:0;background:radial-gradient(ellipse at 48% 48%,rgba(218,229,246,.115),rgba(25,30,39,.025) 31%,transparent 67%);z-index:1}
  .rwd-ctop{width:100%;display:flex;justify-content:space-between;align-items:center;font:700 10px/1 ui-monospace,monospace;z-index:2}
  .rwd-tag{padding:3px 8px;border-radius:6px;color:#0a0f1a;background:var(--rwacc,#7CB0FF);letter-spacing:1px;box-shadow:0 0 16px color-mix(in srgb,var(--rwacc) 60%,transparent)}
  .rwd-no{color:#8A93A8}
  .rwd-name{font:800 clamp(16px,4.6vw,20px)/1.1 system-ui;letter-spacing:1px;z-index:2;color:#EAF0FF}
  .rwd-en{margin-top:3px;font:600 10px/1 ui-monospace,monospace;letter-spacing:1.5px;color:var(--rwacc,#7CB0FF);z-index:2;text-transform:uppercase}
  .rwd-years{margin-top:2px;font:500 9px/1 ui-monospace,monospace;color:#5C6680;z-index:2}
  .rwd-formula{margin-top:5px;width:100%;text-align:center;font:600 12px/1.3 ui-monospace,"SF Mono",monospace;color:#EAF0FF;z-index:2;
    padding:6px 6px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid color-mix(in srgb,var(--rwacc) 30%,transparent)}
  .rwd-shine{position:absolute;inset:0;z-index:3;pointer-events:none;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.78) 48%,transparent 60%);transform:translateX(-130%)}
  .rwd-glow{position:absolute;inset:-3px;border-radius:18px;z-index:-1;opacity:0;box-shadow:0 0 40px 6px var(--rwacc,#7CB0FF),0 0 120px 20px color-mix(in srgb,var(--rwacc) 45%,transparent)}
  .rwd-shiny-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);z-index:4;font:800 10px/1 ui-monospace,monospace;letter-spacing:2px;color:#0a0f1a;padding:4px 9px;border-radius:999px;background:linear-gradient(90deg,#fff,#FFDE7A,#fff);box-shadow:0 0 20px #FFDE7A;white-space:nowrap;opacity:0}
  .rwd-tap{position:absolute;bottom:26px;left:0;right:0;text-align:center;font:11px/1 ui-monospace,monospace;color:#5C6680;letter-spacing:1px;opacity:0;transition:opacity .4s;z-index:8}
  .rwd-wave{position:absolute;top:50%;left:50%;width:40px;height:40px;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:2}
  @keyframes rwd-shake{10%,90%{transform:translate(-2px,1px)}30%,70%{transform:translate(5px,-3px)}50%{transform:translate(-7px,3px)}}
  .rwd-shaking{animation:rwd-shake .5s cubic-bezier(.36,.07,.19,.97) both}
  @keyframes rwd-shakebig{10%,90%{transform:translate(-5px,3px)}30%,70%{transform:translate(11px,-6px)}50%{transform:translate(-15px,7px)}}
  .rwd-shakingbig{animation:rwd-shakebig .62s cubic-bezier(.36,.07,.19,.97) both}
  /* 图鉴格子 */
  .rwd-mini{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:5/7;border:1.5px solid var(--rwacc,#334);background:linear-gradient(165deg,#141d33,#0a1020);
    display:flex;flex-direction:column;padding:0;--rwacc:#7CB0FF}
  .rwd-mini.locked{border-color:rgba(120,140,180,.25);background:linear-gradient(165deg,#10131c,#0a0d14);cursor:default;padding:12px 10px;align-items:center}
  .rwd-mini.owned{cursor:pointer;transition:transform .15s,box-shadow .2s}
  .rwd-mini.owned:hover{transform:translateY(-3px);box-shadow:0 8px 30px -10px var(--rwacc)}
  .rwd-mini .lock{margin:auto;font-size:34px;color:rgba(150,170,210,.35)}
  .rwd-mini .lockt{font:600 11px/1.4 system-ui;color:#5C6680;text-align:center}

  /* ===== 多风格过场 fx ===== */
  .rwd-fx2{position:absolute;pointer-events:none}
  .rwd-bigword{top:33%;left:50%;transform:translate(-50%,-50%) scale(.6);z-index:9;opacity:0;font-weight:900;white-space:nowrap;text-align:center}
  .rwd-bigword.ink{font-family:"STKaiti","KaiTi","Songti SC","Noto Serif SC",serif;font-size:clamp(60px,17vw,160px);color:#141414;letter-spacing:20px;text-indent:20px;text-shadow:0 6px 34px rgba(0,0,0,.28)}
  .rwd-bigword.blue{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:clamp(46px,12vw,116px);color:#A9EEFF;letter-spacing:12px;text-indent:12px;text-shadow:0 0 26px #38C6FF,0 0 60px rgba(56,198,255,.5)}
  .rwd-bigword.star{font-family:"Songti SC","Noto Serif SC",serif;font-size:clamp(54px,15vw,140px);letter-spacing:16px;text-indent:16px;color:#fff;text-shadow:0 0 20px #B9C6FF,0 0 48px #7C6BFF}
  .rwd-bigword.cute{font-family:"Yuanti SC","YouYuan","Hiragino Maru Gothic","PingFang SC",sans-serif;font-size:clamp(42px,12vw,104px);letter-spacing:4px;color:#fff;text-shadow:0 3px 0 #FF6FB5,0 6px 0 #E24E9B,0 0 28px #FFA8D8}
  /* 水墨 */
  .rwd-ink{transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,#0a0a0a 54%,rgba(10,10,10,.42) 78%,transparent);filter:blur(2px);z-index:2}
  .rwd-scroll{top:7%;left:50%;transform:translateX(-50%);width:min(72vw,310px);height:0;overflow:hidden;background:linear-gradient(#fffdf5,#f0e6cc);box-shadow:0 12px 44px rgba(0,0,0,.4),inset 0 0 0 1px rgba(120,80,20,.25);z-index:2;border-radius:5px}
  .rwd-seal{top:50%;left:50%;transform:translate(-50%,-50%);width:116px;height:116px;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;background:#9e1b1b;color:#fff;font-family:"STKaiti","KaiTi","Songti SC",serif;font-weight:800;font-size:46px;letter-spacing:6px;z-index:9;border-radius:9px;box-shadow:0 0 0 4px #7a1414,0 12px 44px rgba(120,10,10,.5)}
  /* 蓝图 */
  .rwd-grid{inset:0;background:linear-gradient(#0a1a30,#050c18);z-index:1}
  .rwd-grid:after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(90,205,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(90,205,255,.16) 1px,transparent 1px);background-size:38px 38px;-webkit-mask:radial-gradient(circle at 50% 46%,#000 30%,transparent 78%);mask:radial-gradient(circle at 50% 46%,#000 30%,transparent 78%)}
  .rwd-geo{top:50%;left:50%;transform:translate(-50%,-50%);width:min(86vw,440px);aspect-ratio:1;z-index:2;overflow:visible}
  .rwd-geo path,.rwd-geo circle,.rwd-geo polygon,.rwd-geo line{fill:none;stroke-linecap:round;stroke-dasharray:2600;stroke-dashoffset:2600;animation:rwd-draw 1.5s ease forwards}
  @keyframes rwd-draw{to{stroke-dashoffset:0}}
  .rwd-code{left:0;right:0;bottom:12%;text-align:center;z-index:3;font:600 clamp(12px,2.6vw,17px)/1.7 ui-monospace,monospace;color:#8FE9FF;text-shadow:0 0 12px rgba(56,198,255,.7);opacity:0}
  /* 星空 */
  .rwd-space{inset:0;background:radial-gradient(circle at 50% 42%,#141a40,#070a1c 60%,#03040c);z-index:1}
  .rwd-const{top:50%;left:50%;transform:translate(-50%,-50%);width:min(80vw,420px);aspect-ratio:1;z-index:2;overflow:visible}
  .rwd-const line{stroke:#BFD0FF;stroke-width:1.4;stroke-dasharray:600;stroke-dashoffset:600;animation:rwd-draw 1.1s ease forwards;filter:drop-shadow(0 0 5px #8CA6FF)}
  .rwd-const circle{fill:#fff;stroke:none;filter:drop-shadow(0 0 6px #cfe0ff)}
  /* 可爱 · 卡框 */
  .rwd-cute{position:relative;width:100%;height:100%;overflow:hidden;border-radius:inherit;background:linear-gradient(165deg,#ffd9ec,#f0e2ff)}
  .rwd-cute .rwd-hpimg{width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block}
  .rwd-cute:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(150,45,105,.62),rgba(150,45,105,.05) 44%,transparent 60%);pointer-events:none}
  .rwd-cute.noimg{display:flex;align-items:center;justify-content:center}
  .rwd-cute .rwd-pfallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:900 clamp(30px,9vw,54px)/1 "Yuanti SC",system-ui;color:#fff;text-shadow:0 0 20px #FF8FC7}
  .rwd-cute.noimg .rwd-pfallback{display:flex}
  .rwd-cuteframe{position:absolute;inset:7px;border:2px solid rgba(255,255,255,.9);border-radius:13px;pointer-events:none;z-index:2;box-shadow:inset 0 0 22px rgba(255,175,215,.55),0 0 0 1px rgba(255,130,195,.6)}
  .rwd-cutedeco{position:absolute;z-index:3;font-size:14px;line-height:1;filter:drop-shadow(0 1px 1px rgba(180,60,120,.4))}
  .rwd-cutedeco.tl{top:11px;left:12px}.rwd-cutedeco.tr{top:11px;right:12px}.rwd-cutedeco.bl{bottom:34px;left:12px}.rwd-cutedeco.br{bottom:34px;right:12px}
  .rwd-cutename{position:absolute;left:0;right:0;bottom:12px;text-align:center;z-index:4;font:800 clamp(17px,3.4vw,25px)/1.05 "Yuanti SC","YouYuan","PingFang SC",sans-serif;letter-spacing:3px;text-indent:3px;color:#fff;text-shadow:0 2px 6px rgba(190,55,120,.85),0 0 14px rgba(255,150,210,.75)}
  /* 满月主题贴纸卡：扁平色块 + 粗黑描边 + 微旋转，跟其他传说角色的渐变卡框刻意区分 */
  .rwd-flat{position:relative;width:100%;height:100%;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6% 7%;transform:rotate(var(--flatrot,0deg))}
  .rwd-flatface{position:relative;width:82%;aspect-ratio:1;border-radius:50%;background:#fff;border:3.5px solid #16161c;overflow:hidden;margin-bottom:5.5%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .rwd-flatface .rwd-hpimg{width:100%;height:100%;object-fit:cover;object-position:center 20%}
  .rwd-flatface .rwd-pfallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:900 clamp(20px,6vw,30px)/1 "Arial Black",system-ui}
  .rwd-flatface.noimg .rwd-pfallback{display:flex}
  .rwd-flatname{font:800 clamp(14px,3.6vw,18px)/1.15 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:.02em;text-align:center}
  .rwd-flattag{margin-top:5%;font:800 clamp(9px,2.2vw,11px)/1 -apple-system,"PingFang SC",sans-serif;color:#fff;padding:4px 11px;border-radius:999px;letter-spacing:.02em;white-space:nowrap;box-shadow:0 2px 0 rgba(0,0,0,.25)}
  .rwd-mini.flat{border:3px solid #16161c;border-radius:14px;box-shadow:4px 5px 0 rgba(0,0,0,.42)}
  /* 英雄联盟卡面：原画满幅出血 + 金色雕花边框 + 底部铭牌，走符文之地卡牌的路子，
     跟粉彩贴纸卡刻意拉开——这类原画的价值就在整张图，不能裁成小圆头像 */
  .rwd-lol{position:relative;width:100%;height:100%;overflow:hidden;border-radius:inherit;background:#0a0a0f}
  .rwd-lol .rwd-hpimg{width:100%;height:100%;object-fit:cover;object-position:center 18%;display:block}
  .rwd-lol:after{content:"";position:absolute;inset:0;pointer-events:none;
    background:linear-gradient(to top,rgba(4,4,8,.97) 3%,rgba(4,4,8,.72) 20%,rgba(4,4,8,.12) 42%,transparent 62%),
      radial-gradient(ellipse at 50% 8%,rgba(0,0,0,.55),transparent 58%)}
  .rwd-lol .rwd-pfallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:900 clamp(30px,9vw,54px)/1 "Arial Black",system-ui;color:var(--lolg,#C8AA6E)}
  .rwd-lol.noimg .rwd-pfallback{display:flex}
  .rwd-lolframe{position:absolute;inset:0;z-index:3;pointer-events:none}
  .rwd-lolname{position:absolute;left:0;right:0;bottom:7.5%;z-index:4;text-align:center;padding:0 8%}
  .rwd-lolname .n{font:700 clamp(15px,3.5vw,22px)/1.1 "Songti SC","STSong","Noto Serif SC",serif;letter-spacing:.18em;text-indent:.18em;
    background:linear-gradient(180deg,#F6E7BF 6%,#C8AA6E 52%,#8A6A28 96%);-webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 1px 0 rgba(0,0,0,.9)) drop-shadow(0 0 10px rgba(200,170,110,.35))}
  .rwd-lolname .rule{display:flex;align-items:center;justify-content:center;gap:6px;margin:5px 0 4px}
  .rwd-lolname .rule i{display:block;height:1px;width:24%;background:linear-gradient(90deg,transparent,var(--lolg,#C8AA6E))}
  .rwd-lolname .rule i+i{background:linear-gradient(90deg,var(--lolg,#C8AA6E),transparent)}
  .rwd-lolname .rule b{width:5px;height:5px;transform:rotate(45deg);background:var(--lolg,#C8AA6E);box-shadow:0 0 6px var(--lolg,#C8AA6E)}
  .rwd-lolname .t{font:600 clamp(8px,1.9vw,10px)/1 -apple-system,"PingFang SC",sans-serif;letter-spacing:.14em;text-indent:.14em;color:#C9BC97;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rwd-lolhex{position:absolute;top:4.5%;left:50%;transform:translateX(-50%);z-index:4;width:15%;aspect-ratio:1;opacity:.95}
  .rwd-mini.lol{border:1px solid rgba(200,170,110,.5);border-radius:10px;background:#0a0a0f;
    box-shadow:0 0 0 1px rgba(0,0,0,.7),0 6px 20px rgba(0,0,0,.5)}
  .rwd-mini.hesitant{border:1px solid rgba(225,234,247,.18);background:#20242b;box-shadow:0 5px 18px rgba(13,17,24,.32),0 0 7px rgba(225,234,247,.045)}
  .rwd-face.lol{border:1.5px solid rgba(200,170,110,.62);border-radius:12px;overflow:hidden;
    box-shadow:0 0 0 1px rgba(10,10,15,.9),0 0 26px rgba(200,170,110,.22)}
  .rwd-ribbon{top:50%;left:50%;width:170vmax;height:52px;transform:translate(-50%,-50%);border-radius:40px;filter:blur(.5px);z-index:2}
  .rwd-stamp{top:50%;left:50%;transform:translate(-50%,-50%);z-index:9;font-size:clamp(90px,26vw,230px);line-height:1;opacity:0;filter:drop-shadow(0 8px 20px rgba(0,0,0,.3))}
  .rwd-bow{top:31%;left:50%;transform:translate(-50%,-50%);z-index:9;font-size:clamp(60px,17vw,150px);line-height:1;opacity:0}
  .rwd-void{position:absolute;inset:0;z-index:8;pointer-events:none;background:radial-gradient(circle at 50% 46%,#0a0e18 0,#000 72%)}
  .rwd-mini.holo{position:relative;overflow:hidden;box-shadow:0 0 0 1px var(--rwacc),0 6px 22px rgba(130,150,255,.30)}
  .rwd-mini.holo:after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.55) 48%,transparent 64%);background-size:250% 250%;animation:rwd-holo 3.2s linear infinite;mix-blend-mode:screen}
  @keyframes rwd-holo{0%{background-position:130% 0}100%{background-position:-130% 0}}
  .rwd-mini.hidden{background:linear-gradient(160deg,#12182b,#080b16)}
  .rwd-lockq{margin:auto;font:800 34px/1 system-ui;color:rgba(200,214,255,.55);text-shadow:0 0 16px rgba(180,200,255,.5);letter-spacing:2px}
  /* 元素魔法阵（无职转生风） */
  .rwd-mcircle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(88vw,470px);aspect-ratio:1;z-index:2;overflow:visible}
  .rwd-mcircle g.spin{transform-box:fill-box;transform-origin:center;animation:rwd-spin 18s linear infinite}
  .rwd-mcircle g.spinr{transform-box:fill-box;transform-origin:center;animation:rwd-spin 11s linear infinite reverse}
  .rwd-mcircle .draw{fill:none;stroke-linecap:round;stroke-dasharray:3000;stroke-dashoffset:3000;animation:rwd-draw 1.4s ease forwards}
  .rwd-mcircle text{font-family:"Songti SC","Noto Serif SC",serif}
  .rwd-bigword.ele{font-family:"STKaiti","KaiTi","Songti SC","Noto Serif SC",serif;font-size:clamp(58px,17vw,158px);letter-spacing:16px;text-indent:16px;color:#fff}
  .rwd-kanji{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) scale(.4);z-index:9;opacity:0;font-family:"STKaiti","KaiTi","Songti SC",serif;font-weight:900;font-size:clamp(130px,36vw,320px);color:#fff;text-shadow:0 0 24px #FF3B5C,0 0 72px #FF3B5C,0 6px 30px rgba(0,0,0,.5)}
  .rwd-worb{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%);border-radius:50%;z-index:3}
  .rwd-wlvl{position:absolute;left:0;right:0;bottom:0;z-index:1;pointer-events:none}
  .rwd-spiral{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(92vw,520px);aspect-ratio:1;z-index:2;overflow:visible}
  .rwd-spiral g.spin{transform-box:fill-box;transform-origin:center;animation:rwd-spin 5.5s linear infinite}
  .rwd-spiral path{fill:none;stroke-linecap:round;stroke-dasharray:4000;stroke-dashoffset:4000;animation:rwd-draw 1.2s ease forwards}
  .rwd-bolt{position:absolute;top:0;z-index:7;pointer-events:none}
  .rwd-wstream{position:absolute;inset:0;width:100%;height:100%;z-index:2}
  .rwd-wstream path{stroke-linecap:round;stroke-dasharray:3200;stroke-dashoffset:3200;animation:rwd-draw 1.3s ease forwards}
  .rwd-wbloom{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) scale(0);width:min(84vw,460px);height:min(84vw,460px);z-index:3;filter:drop-shadow(0 0 22px rgba(120,220,255,.7))}
  .rwd-wbloom .wb-outer{transform-box:fill-box;transform-origin:center;animation:rwd-spin 20s linear infinite}
  .rwd-wbloom .wb-inner{transform-box:fill-box;transform-origin:center;animation:rwd-spin 13s linear infinite reverse}
  .rwd-wbloom .wb-core{filter:drop-shadow(0 0 14px #bfeeff)}
  @media (prefers-reduced-motion:reduce){.rwd-shaking,.rwd-shakingbig{animation:none}.rwd-shine,.rwd-rays{display:none}.rwd-mini.holo:after{animation:none}}
  `;
  const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);

  /* ---------- overlay DOM ---------- */
  const root=document.createElement('div');root.id='rwd-root';
  root.innerHTML=`<div class="rwd-cine" id="rwd-cine">
    <canvas id="rwd-fx"></canvas>
    <div class="rwd-flash" id="rwd-flash"></div>
    <div class="rwd-bar t" id="rwd-barT"></div><div class="rwd-bar b" id="rwd-barB"></div>
    <div class="rwd-rays" id="rwd-rays"></div>
    <div class="rwd-arc" id="rwd-arc"><div class="core"></div><div class="r r0"></div><div class="r r1"></div><div class="r r2"></div><div class="rwd-glyphs" id="rwd-glyphs"></div></div>
    <div class="rwd-pillar" id="rwd-pillar"></div>
    <div class="rwd-impact" id="rwd-impact"><div class="rwd-word"><span class="l rc" data-w>PERFECT</span><span class="l cy" data-w>PERFECT</span><span class="w" data-w>PERFECT</span></div><div class="rwd-sub" id="rwd-sub">满分达成</div></div>
    <div class="rwd-legend" id="rwd-legend">LEGENDARY</div>
    <div class="rwd-cere" id="rwd-cere"><div class="a">SYSTEM UNLOCKED</div><div class="b">图鉴系统 已解锁</div><div class="c">每次高分随机翻开一位大师 · 集齐全图鉴</div></div>
    <div class="rwd-cardwrap" id="rwd-cardwrap">
      <div class="rwd-shiny-badge" id="rwd-shiny">✦ 闪光重复 +1</div>
      <div class="rwd-card" id="rwd-card">
        <div class="rwd-glow" id="rwd-glow"></div>
        <div class="rwd-face rwd-back"></div>
        <div class="rwd-face rwd-front" id="rwd-front"></div>
        <div class="rwd-shine" id="rwd-shine"></div>
      </div>
    </div>
    <div class="rwd-tap" id="rwd-tap">点击任意处继续</div>
  </div>`;
  const ready=()=>{document.body.appendChild(root);init();};

  let cine,flash,pillar,impactEl,cardwrap,card,front,shine,glow,cere,shiny,sub,barT,barB,rays,arc,legendWord,tapHint,cv,cx;
  function init(){
    cine=g('rwd-cine');flash=g('rwd-flash');pillar=g('rwd-pillar');impactEl=g('rwd-impact');cardwrap=g('rwd-cardwrap');
    card=g('rwd-card');front=g('rwd-front');shine=g('rwd-shine');glow=g('rwd-glow');cere=g('rwd-cere');shiny=g('rwd-shiny');
    sub=g('rwd-sub');barT=g('rwd-barT');barB=g('rwd-barB');rays=g('rwd-rays');arc=g('rwd-arc');legendWord=g('rwd-legend');tapHint=g('rwd-tap');
    cv=g('rwd-fx');cx=cv.getContext('2d');
    const gl=g('rwd-glyphs'),syms=['∑','∫','π','∞','∂','√','Δ','λ','Φ','⊕','∇','≡'],R=48;
    syms.forEach((s,i)=>{const a=i/syms.length*360,e=document.createElement('div');e.className='gl';e.textContent=s;e.style.transform=`rotate(${a}deg) translate(0,-${R}%) rotate(${-a}deg)`;gl.appendChild(e);});
    addEventListener('resize',resize);
    cine.addEventListener('click',()=>{if(busy){skip=true;skipRes.forEach(f=>f());skipRes=[];}else finish();});
    loop();
  }
  const g=id=>document.getElementById(id);

  /* ---------- AUDIO ---------- */
  let AC,REV,WET,MASTER,DEST;
  function impulse(sec,decay){const a=AC,len=Math.floor(a.sampleRate*sec),b=a.createBuffer(2,len,a.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);}return b;}
  function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}
      MASTER=AC.createDynamicsCompressor();MASTER.threshold.value=-15;MASTER.knee.value=26;MASTER.ratio.value=3.4;MASTER.attack.value=.004;MASTER.release.value=.22;
      const mg=AC.createGain();mg.gain.value=1.18;MASTER.connect(mg).connect(AC.destination);DEST=MASTER;
      REV=AC.createConvolver();REV.buffer=impulse(2.7,3.0);WET=AC.createGain();WET.gain.value=.5;REV.connect(WET).connect(MASTER);}
    if(AC.state==='suspended')AC.resume();return AC;}
  function env(gn,now,a,peak,d){gn.gain.setValueAtTime(.0001,now);gn.gain.exponentialRampToValueAtTime(peak,now+a);gn.gain.exponentialRampToValueAtTime(.0001,now+a+d);}
  function osc(f0,f1,t,type,peak,delay,wet){const a=ac();if(!a)return;const o=a.createOscillator(),gn=a.createGain(),now=a.currentTime+(delay||0);o.type=type||'sine';o.frequency.setValueAtTime(f0,now);if(f1)o.frequency.exponentialRampToValueAtTime(f1,now+t);env(gn,now,.012,peak||.3,t);o.connect(gn).connect(DEST);if(wet)gn.connect(REV);o.start(now);o.stop(now+t+.1);}
  function noiseHit(t,peak,delay,f0,f1,wet,lp){const a=ac();if(!a)return;const n=a.createBufferSource(),len=Math.floor(a.sampleRate*t),b=a.createBuffer(1,len,a.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;n.buffer=b;const bp=a.createBiquadFilter();bp.type=lp?'lowpass':'bandpass';bp.Q.value=lp?.7:1.1;const now=a.currentTime+(delay||0);bp.frequency.setValueAtTime(f0||1200,now);if(f1)bp.frequency.exponentialRampToValueAtTime(f1,now+t);const gn=a.createGain();env(gn,now,.006,peak||.3,t);n.connect(bp).connect(gn).connect(DEST);if(wet)gn.connect(REV);n.start(now);}
  function impact(level){const a=ac();if(!a)return;const now=a.currentTime;const o=a.createOscillator(),gn=a.createGain();o.type='sine';o.frequency.setValueAtTime(210*level,now);o.frequency.exponentialRampToValueAtTime(34,now+.34);env(gn,now,.005,.8*level,.44);o.connect(gn).connect(DEST);o.start(now);o.stop(now+.55);
    const o2=a.createOscillator(),g2=a.createGain();o2.type='triangle';o2.frequency.setValueAtTime(440*level,now);o2.frequency.exponentialRampToValueAtTime(120,now+.16);env(g2,now,.004,.42*level,.2);o2.connect(g2).connect(DEST);o2.start(now);o2.stop(now+.3);noiseHit(.11,.34*level,0,3200,300,false,true);}
  function boom(){const a=ac();if(!a)return;const now=a.currentTime;[50,60].forEach(f=>{const o=a.createOscillator(),gn=a.createGain();o.type='sine';o.frequency.setValueAtTime(f*2.6,now);o.frequency.exponentialRampToValueAtTime(f*.7,now+.5);env(gn,now,.005,.62,.85);o.connect(gn).connect(DEST);o.start(now);o.stop(now+.95);});noiseHit(.5,.34,0,220,60,true,true);impact(1.7);}
  function riser(t){osc(90,1500,t,'sawtooth',.06,0,true);osc(320,2200,t,'sine',.05,0,true);noiseHit(t,.16,0,180,6500,true);let time=0,step=.17;for(let i=0;i<12;i++){osc(480+i*44,480+i*44,.06,'square',.03,time);time+=step;step*=.82;}}
  function whoosh(t,f0,f1,peak){noiseHit(t,peak||.18,0,f0,f1,true);}
  function sparkle(n,base,delay){for(let i=0;i<n;i++){const f=base*Math.pow(1.16,i+(Math.random()*2|0));osc(f,f,.5,'triangle',.09,(delay||0)+i*.05,true);}}
  function chordSSR(){const a=ac();if(!a)return;[293.66,392,466.16,587.33,698.46].forEach((f,i)=>{const o=a.createOscillator(),o2=a.createOscillator(),gn=a.createGain(),now=a.currentTime+i*.04;o.type='sawtooth';o2.type='sawtooth';o.frequency.value=f;o2.frequency.value=f*1.006;gn.gain.setValueAtTime(.0001,now);gn.gain.exponentialRampToValueAtTime(.075,now+.3);gn.gain.exponentialRampToValueAtTime(.0001,now+1.7);o.connect(gn);o2.connect(gn);gn.connect(DEST);gn.connect(REV);o.start(now);o2.start(now);o.stop(now+1.8);o2.stop(now+1.8);});[523,659,784,1047,1319,1568].forEach((f,i)=>osc(f,f,.9,'sine',.08,.16+i*.06,true));osc(1200,3600,.5,'triangle',.08,.1,true);osc(80,48,1.1,'sine',.34,0);}
  function sfx(rar,phase){try{
    if(phase==='hit'){if(rar==='n'){whoosh(.16,320,1500,.13);impact(.7);}else if(rar==='r'){whoosh(.28,250,1900,.2);impact(1.05);}else{boom();}}
    else if(phase==='reveal'){if(rar==='n'){sparkle(3,1100,0);}else if(rar==='r'){sparkle(6,900,0);osc(1300,3200,.34,'sine',.08,.02,true);}else{chordSSR();}}
    else if(phase==='riser'){riser(1.55);}}catch(e){}}

  /* ---------- particles ---------- */
  let W,H,DPR,P=[],storm=0,stormRar='s';
  function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*DPR;cv.height=H*DPR;cx.setTransform(DPR,0,0,DPR,0,0);}
  function burst(x,y,rar,mult){const c=RAR[rar],n=Math.round((reduce?.3:1)*c.parts*(mult||1)),cols=[c.acc,c.glow,'#ffffff',rar==='s'?'#fff2c2':(rar==='h'?'#ffffff':c.glow)];
    for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,sp=2+Math.random()*((rar==='s'||rar==='h')?14:8);P.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,g:.14+Math.random()*.1,life:1,dec:.008+Math.random()*.012,size:2+Math.random()*((rar==='s'||rar==='h')?4:3),col:cols[i%cols.length],rot:Math.random()*6,vr:(Math.random()-.5)*.4,shape:Math.random()<.5?'r':'c'});}}
  function rainStep(){const c=RAR[stormRar];for(let i=0;i<6;i++)P.push({x:Math.random()*W,y:-10,vx:(Math.random()-.5)*2,vy:2.5+Math.random()*3.5,g:.05,life:1,dec:.004,size:2+Math.random()*3.5,col:Math.random()<.5?c.glow:(stormRar==='s'?'#fff3c8':'#ffffff'),rot:Math.random()*6,vr:.2,shape:'r'});}
  function loop(){requestAnimationFrame(loop);if(!cx)return;cx.clearRect(0,0,W,H);if(storm>0){storm--;if(!reduce)rainStep();}
    for(let i=P.length-1;i>=0;i--){const p=P[i];p.vy+=p.g;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;p.life-=p.dec;if(p.life<=0||p.y>H+30){P.splice(i,1);continue;}
      cx.globalAlpha=Math.max(0,p.life);cx.fillStyle=p.col;if(p.shape==='r'){cx.save();cx.translate(p.x,p.y);cx.rotate(p.rot);cx.fillRect(-p.size,-p.size/2,p.size*2,p.size);cx.restore();}else if(p.shape==='star'){cx.save();cx.translate(p.x,p.y);cx.rotate(p.rot);pStar(cx,p.size*1.7);cx.restore();}else if(p.shape==='heart'){cx.save();cx.translate(p.x,p.y);cx.rotate(p.rot*.25);pHeart(cx,p.size*1.25);cx.restore();}else if(p.shape==='petal'){cx.save();cx.translate(p.x,p.y);cx.rotate(p.rot);cx.beginPath();cx.ellipse(0,0,p.size*1.7,p.size*.72,0,0,7);cx.fill();cx.restore();}else{cx.beginPath();cx.arc(p.x,p.y,p.size,0,7);cx.fill();}}
    cx.globalAlpha=1;}

  /* ---------- helpers ---------- */
  let busy=false,skip=false,skipRes=[];
  const raf=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  function wait(ms){return new Promise(res=>{let done=false;const t=setTimeout(()=>{if(!done){done=true;res();}},ms);skipRes.push(()=>{if(!done){done=true;clearTimeout(t);res();}});});}
  function shockwave(color,max,dur,thick){const w=document.createElement('div');w.className='rwd-wave';w.style.border=(thick||2)+'px solid '+color;w.style.boxShadow='0 0 30px '+color;cine.appendChild(w);
    w.animate([{transform:'translate(-50%,-50%) scale(.12)',opacity:.95},{transform:`translate(-50%,-50%) scale(${max})`,opacity:0}],{duration:dur,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish=()=>w.remove();}
  const TSTY={
    ink:      {layout:'hero',bg:'linear-gradient(165deg,#2b2620,#14110c)',frame:'rgba(212,170,110,.62)',name:'#F3ECDD',accent:'#D2AA6E'},
    blueprint:{layout:'hero',bg:'linear-gradient(165deg,#0e2036,#081522)',frame:'rgba(92,214,255,.7)',name:'#EAF6FF',accent:'#5CD6FF'},
    cosmic:   {layout:'hero',bg:'radial-gradient(circle at 50% 28%,#26305e,#0a0e22 82%)',frame:'rgba(157,180,255,.7)',name:'#EDF0FF',accent:'#9DB4FF'},
    magic:    {layout:'cute',bg:'linear-gradient(165deg,#ffd9ec,#f0e2ff)',frame:'rgba(255,255,255,.9)',accent:'#FF8FC7',deco:['✿','♡','★','✿']},
    dessert:  {layout:'cute',bg:'linear-gradient(165deg,#ffe3ec,#e5f7ee 60%,#fff3d9)',frame:'rgba(255,255,255,.92)',accent:'#FFB3C7',deco:['🍓','🎀','🧁','⭐']},
    sticker:  {layout:'cute',bg:'linear-gradient(165deg,#fff6e3,#ffeaf2)',frame:'rgba(255,193,94,.85)',accent:'#FFC15E',deco:['⭐','✧','☆','✩']},
    hesitant: {layout:'hesitant',bg:'#262a31',frame:'rgba(235,242,255,.16)',name:'#EEF1F6',accent:'#B8C1CE'},
    xujiahao_ssr:{layout:'hero',bg:'radial-gradient(circle at 50% 30%,#243654,#02040a 82%)',frame:'rgba(255,211,105,.9)',name:'#FFF4CF',accent:'#FFD369'},
    water:    {layout:'hero',bg:'radial-gradient(circle at 50% 30%,#0d3a52,#04121f 82%)',frame:'rgba(90,214,255,.72)',name:'#EAF9FF',accent:'#38C6E8'},
    wind:     {layout:'hero',bg:'radial-gradient(circle at 50% 30%,#0c3a2c,#03140f 82%)',frame:'rgba(80,235,175,.72)',name:'#EAFFF6',accent:'#3EE6A6'},
    king:     {layout:'hero',bg:'radial-gradient(circle at 50% 28%,#241a3a,#04030a 82%)',frame:'rgba(255,224,140,.88)',name:'#FFF7E0',accent:'#FFD65A'},
    sword:    {layout:'hero',bg:'radial-gradient(circle at 50% 32%,#3a0e14,#0c0406 82%)',frame:'rgba(255,110,128,.82)',name:'#FFE7EA',accent:'#FF5A6E'},
    /* 满月主题 · 三个传说角色，卡面走「贴纸风」：扁平色块 + 粗黑描边 + 微旋转，跟其他传说角色的水墨/魔法卡框区分开 */
    mitsuki:  {layout:'flat',bg:'#FFE9A8',accent:'#E0A821',ink:'#3a2c05',rot:'-2.4deg'},
    meroko:   {layout:'flat',bg:'#FFD3E6',accent:'#FF6FA5',ink:'#5c1636',rot:'2deg'},
    takuto:   {layout:'flat',bg:'#CFE0FF',accent:'#5C7CE0',ink:'#101a3a',rot:'-1.4deg'},
    /* 英雄联盟 · 原画满幅 + 金色雕花框（符文之地卡牌风），gold 按各自地区/主题微调 */
    rengar:   {layout:'lol',gold:'#C8AA6E',accent:'#E8C24A'},
    warwick:  {layout:'lol',gold:'#B9C87E',accent:'#7CE06A'},
    volibear: {layout:'lol',gold:'#C0A8E0',accent:'#A46BFF',imgf:'brightness(1.22) contrast(1.1) saturate(1.08)'}
  };
  function tacc(card){const s=TSTY[card&&card.style];return s?s.accent:null;}
  function tcute(card){const s=TSTY[card&&card.style];return !!(s&&s.layout==='cute');}
  function tflat(card){const s=TSTY[card&&card.style];return !!(s&&s.layout==='flat');}
  function tlol(card){const s=TSTY[card&&card.style];return !!(s&&s.layout==='lol');}
  function thesitant(card){const s=TSTY[card&&card.style];return !!(s&&s.layout==='hesitant');}
  // 金色雕花边框：双线 + 四角缺口菱形 + 顶部小尖饰，符文之地卡牌那种感觉
  function lolFrameSVG(g){return '<svg class="rwd-lolframe" viewBox="0 0 100 140" preserveAspectRatio="none">'
    +'<defs><linearGradient id="lolg1" x1="0" y1="0" x2="0" y2="1">'
    +'<stop offset="0" stop-color="#F6E7BF"/><stop offset=".5" stop-color="'+g+'"/><stop offset="1" stop-color="#7A5C22"/></linearGradient></defs>'
    +'<rect x="2.4" y="2.4" width="95.2" height="135.2" fill="none" stroke="url(#lolg1)" stroke-width="1" vector-effect="non-scaling-stroke"/>'
    +'<rect x="4.6" y="4.6" width="90.8" height="130.8" fill="none" stroke="'+g+'" stroke-width=".5" opacity=".55" vector-effect="non-scaling-stroke"/>'
    +['2.4,2.4','97.6,2.4','2.4,137.6','97.6,137.6'].map(p=>{const[x,y]=p.split(',').map(Number);
       return '<path d="M'+x+' '+y+' l'+(x<50?7:-7)+' 0 l'+(x<50?-7:7)+' '+(y<70?7:-7)+' Z" fill="url(#lolg1)"/>'
        +'<circle cx="'+(x<50?x+3.4:x-3.4)+'" cy="'+(y<70?y+3.4:y-3.4)+'" r="1.05" fill="#F6E7BF"/>';}).join('')
    +'<path d="M50 2.4 l4.6 4.2 -4.6 4.2 -4.6 -4.2 Z" fill="url(#lolg1)"/>'
    +'<path d="M50 137.6 l4.6 -4.2 -4.6 -4.2 -4.6 4.2 Z" fill="url(#lolg1)" opacity=".8"/>'
    +'</svg>';}
  function lolHexSVG(g){return '<svg class="rwd-lolhex" viewBox="0 0 40 40">'
    +'<path d="M20 2 L35 11 L35 29 L20 38 L5 29 L5 11 Z" fill="rgba(6,8,14,.82)" stroke="'+g+'" stroke-width="1.6"/>'
    +'<path d="M20 8 L29.5 13.6 L29.5 26.4 L20 32 L10.5 26.4 L10.5 13.6 Z" fill="none" stroke="'+g+'" stroke-width=".8" opacity=".6"/>'
    +'<path d="M20 13 l3.4 6.6 7.2 1 -5.3 5 1.3 7.2 -6.6 -3.5 -6.6 3.5 1.3 -7.2 -5.3 -5 7.2 -1 Z" fill="'+g+'" opacity=".95"/></svg>';}
  function faceTeacher(card){
    const sty=TSTY[card.style]||TSTY.ink;
    const img=card.portrait?`<img class="rwd-hpimg" src="${card.portrait}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('noimg')">`:'';
    const sub=card.sub?`<div class="rwd-tsub">${card.sub}</div>`:'';
    if(sty.layout==='hesitant')return `<div class="rwd-hesitant${card.portrait?'':' noimg'}">${img}<span class="rwd-pfallback">${mono(card)}</span><div class="rwd-hesframe"></div><div class="rwd-hesname">${card.cn||''}${sub}</div></div>`;
    if(sty.layout==='lol'){
      const g=sty.gold||'#C8AA6E';
      const limg=card.portrait
        ? `<img class="rwd-hpimg" src="${card.portrait}" alt=""${sty.imgf?` style="filter:${sty.imgf}"`:''} onerror="this.style.display='none';this.parentNode.classList.add('noimg')">`
        : '';
      return `<div class="rwd-lol${card.portrait?'':' noimg'}" style="--lolg:${g}">${limg}
        <span class="rwd-pfallback">${mono(card)}</span>
        ${lolFrameSVG(g)}${lolHexSVG(g)}
        <div class="rwd-lolname"><div class="n">${card.cn||''}</div>
          <div class="rule"><i></i><b></b><i></i></div>
          <div class="t">${card.sub||''}</div></div>
      </div>`;
    }
    if(sty.layout==='flat'){
      const fimg=sty.imgf&&card.portrait
        ? `<img class="rwd-hpimg" src="${card.portrait}" alt="" style="filter:${sty.imgf}" onerror="this.style.display='none';this.parentNode.classList.add('noimg')">`
        : img;
      return `<div class="rwd-flat" style="background:${sty.bg};--flatrot:${sty.rot||'0deg'}">
        <div class="rwd-flatface${card.portrait?'':' noimg'}">${fimg}<span class="rwd-pfallback" style="color:${sty.accent}">${mono(card)}</span></div>
        <div class="rwd-flatname" style="color:${sty.ink||'#16161c'}">${card.cn||''}</div>
        ${card.sub?`<div class="rwd-flattag" style="background:${sty.accent}">${card.sub}</div>`:''}
      </div>`;
    }
    if(sty.layout==='cute'){const d=sty.deco||['✿','♡','★','✿'];
      return `<div class="rwd-cute${card.portrait?'':' noimg'}" style="background:${sty.bg}">${img}<span class="rwd-pfallback">${mono(card)}</span><div class="rwd-cuteframe" style="border-color:${sty.frame}"></div><span class="rwd-cutedeco tl">${d[0]}</span><span class="rwd-cutedeco tr">${d[1]}</span><span class="rwd-cutedeco bl">${d[2]}</span><span class="rwd-cutedeco br">${d[3]}</span><div class="rwd-cutename">${card.cn||''}${sub}</div></div>`;}
    return `<div class="rwd-hero${card.portrait?'':' noimg'}" style="background:${sty.bg}">${img}<span class="rwd-pfallback">${mono(card)}</span><div class="rwd-heroframe" style="border-color:${sty.frame}"></div><div class="rwd-heroname" style="color:${sty.name}">${card.cn||''}${sub}</div></div>`;}
  function faceHTML(card,rar){
    if(rar==='h'||(card&&TSTY[card.style]))return faceTeacher(card);
    const img=card.portrait?`<img class="rwd-pimg" src="${card.portrait}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('noimg')">`:'';
    return `<div class="rwd-art${card.portrait?'':' noimg'}">${img}<span class="rwd-pfallback">${mono(card)}</span>
      <div class="rwd-arttop"><span class="rwd-tag">${RAR[rar].tag}</span><span class="rwd-no">NO.${String(card.no).padStart(2,'0')}</span></div></div>
    <div class="rwd-info"><div class="rwd-rarity">${RAR[rar].tag} · ${RAR[rar].label}</div>
    <div class="rwd-name">${card.cn||''}</div>
    <div class="rwd-en">${card.en||''}${card.years?' · '+card.years:''}</div>
    <div class="rwd-formula">${card.formula||''}</div></div>`;}
  function setCard(cardObj,shinyOn){const rar=cardObj.rarity||'n',c=RAR[rar];const acc=tacc(cardObj)||c.acc;
    [front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    front.innerHTML=faceHTML(cardObj,rar);front.classList.toggle('flat',tflat(cardObj));front.classList.toggle('lol',tlol(cardObj));
    front.classList.toggle('holo',(rar==='h'||!!TSTY[cardObj.style])&&!tcute(cardObj)&&!tflat(cardObj)&&!tlol(cardObj)&&!thesitant(cardObj));
    impactEl.querySelectorAll('[data-w]').forEach(e=>e.textContent='PERFECT');
    sub.style.setProperty('--rwacc',c.acc);sub.style.color=c.acc;sub.style.textShadow='0 0 18px '+c.acc;sub.textContent=cardObj.student?'师生图鉴 · 悄然入场':(rar==='L'?'传说降临 · 本尊现身':(rar==='h'?'隐藏人物 · 本尊现身':(rar==='s'?'满分 · 传说':'高分达成')));legendWord.textContent=cardObj.student?'ENCOUNTER':(rar==='h'?'MYTHOS':'LEGENDARY');
    pillar.style.setProperty('--rwacc',c.glow);}
  function resetStage(){
    // 关键：fill:'forwards' 的动画结束后会一直把最终值钉在元素上，且优先级高于内联样式。
    // 不先取消掉上一张卡残留的动画，这里写的 opacity=0 之类全部无效，卡片会从一开场就挂在画面上。
    [cardwrap,card,glow,front,shine,flash,pillar,arc,legendWord,impactEl,cere,shiny,rays,barT,barB].forEach(el=>{
      if(el&&el.getAnimations)el.getAnimations().forEach(a=>{try{a.cancel();}catch(e){}});});
    cardwrap.classList.add('rwd-hide');
    flash.style.background='';card.style.transition='none';card.style.transform='rotateY(180deg)';
    cardwrap.style.transition='none';cardwrap.style.opacity='0';cardwrap.style.transform='translateY(26px) scale(.9)';cardwrap.style.filter='';
    front.style.opacity='1';front.style.filter='';
    glow.style.opacity='0';shine.style.transition='none';shine.style.transform='translateX(-130%)';
    impactEl.style.opacity='0';impactEl.style.transform='translate(-50%,-50%) scale(1.6)';cere.style.opacity='0';shiny.style.opacity='0';tapHint.style.opacity='0';
    legendWord.style.opacity='0';legendWord.style.transform='translate(-50%,-50%) scale(.6)';
    barT.style.height='0';barB.style.height='0';rays.style.opacity='0';rays.style.animation='';
    arc.style.transition='none';arc.style.opacity='0';arc.style.transform='translate(-50%,-50%) scale(.25)';pillar.style.opacity='0';pillar.style.height='0';pillar.style.width='2px';}
  // 卡片只在这里解封：每个动画在"该揭卡了"的那一刻调用一次
  function showCard(){cardwrap.classList.remove('rwd-hide');}
  function glitch(rc,cy){let n=0;const id=setInterval(()=>{n++;const m=Math.max(0,16-n*3);rc.style.transform='translateX(-'+m+'px)';cy.style.transform='translateX('+m+'px)';if(n>=6){clearInterval(id);rc.style.transform='translateX(-2px)';cy.style.transform='translateX(2px)';}},42);}
  async function slamPerfect(rar){flash.style.transition='none';flash.style.opacity=rar==='s'?'1':'.85';await raf();flash.style.transition='opacity .5s';flash.style.opacity='0';
    sfx(rar,'hit');impactEl.style.transition='opacity .18s,transform .28s cubic-bezier(.18,1.4,.35,1)';impactEl.style.opacity='1';impactEl.style.transform='translate(-50%,-50%) scale('+(rar==='s'?1.15:1)+')';glitch(impactEl.querySelector('.rc'),impactEl.querySelector('.cy'));}
  async function flipCard(rar,dm,mult){pillar.style.opacity='0';card.style.transition='transform '+(0.6*dm)+'s cubic-bezier(.3,.9,.2,1)';card.style.transform='rotateY(0deg)';
    setTimeout(()=>{sfx(rar,'reveal');shine.style.transition='transform .7s ease-out';shine.style.transform='translateX(130%)';burst(W/2,H/2,rar,mult);glow.style.transition='opacity .5s';glow.style.opacity=rar==='s'?'1':rar==='r'?'.9':'.55';},260*dm);
    await wait(720*dm);}
  function settleShiny(shinyOn){glow.style.transition='opacity 1.2s ease-in-out';glow.style.opacity=(front.classList.contains('holo'))?'.7':'.42';if(shinyOn){shiny.style.transition='opacity .4s';shiny.style.opacity='1';burst(W/2,H*.32,'s',.5);}}

  async function playStd(rar,first){const dm=rar==='r'?1.3:1;cine.classList.add('on');resetStage();await raf();
    if(first){cere.style.transition='opacity .5s,transform .5s';cere.style.opacity='1';cere.style.transform='translateY(0)';osc(300,600,.5,'sine',.12,0,true);osc(450,900,.6,'triangle',.08,.05,true);await wait(1550);if(skip)return;cere.style.opacity='0';await wait(300);}
    await slamPerfect(rar);if(rar==='r'){cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),500);}
    await wait(rar==='r'?860:560);if(skip)return;
    impactEl.style.transition='opacity .4s,transform .5s';impactEl.style.opacity='0';impactEl.style.transform='translate(-50%,-140%) scale(.8)';
    if(rar==='r'){pillar.style.transition='none';pillar.style.height='0';pillar.style.opacity='1';await raf();pillar.style.transition='height .35s ease-out';pillar.style.height='72%';osc(200,520,.4,'sawtooth',.05,0,true);await wait(300);}else{await wait(120);}
    if(skip)return;cardwrap.style.transition='opacity .28s,transform '+(rar==='r'?.45:.35)+'s cubic-bezier(.2,.9,.2,1)';showCard();cardwrap.style.opacity='1';cardwrap.style.transform='translateY(0) scale(1)';
    await wait(rar==='r'?320:220);if(skip)return;if(rar==='r'){stormRar='r';storm=70;}
    await flipCard(rar,dm,rar==='r'?1.3:1);if(skip)return;
    if(rar==='r'){shockwave('rgba(203,155,255,.7)',8,760,3);cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),480);}}

  async function playMega(){cine.classList.add('on');resetStage();await raf();
    barT.style.height='13%';barB.style.height='13%';sfx('s','riser');
    rays.style.transition='opacity 1s';rays.style.opacity='1';rays.style.animation='rwd-spin 13s linear infinite';
    arc.style.transition='opacity .8s,transform 1.6s cubic-bezier(.2,.8,.2,1)';arc.style.opacity='1';arc.style.transform='translate(-50%,-50%) scale(1) rotate(60deg)';
    arc.animate([{filter:'brightness(1)'},{filter:'brightness(1.5)'},{filter:'brightness(2)'}],{duration:1900,easing:'ease-in'});
    shockwave('rgba(255,222,122,.5)',5,900,2);await wait(650);if(skip)return;
    shockwave('rgba(255,230,150,.6)',7,850,2);await wait(650);if(skip)return;
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),500);shockwave('rgba(255,240,180,.7)',9,750,3);await wait(600);if(skip)return;
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),620);await slamPerfect('s');
    legendWord.style.transition='opacity .3s,transform .55s cubic-bezier(.18,1.6,.3,1)';legendWord.style.opacity='1';legendWord.style.transform='translate(-50%,-50%) scale(1)';
    legendWord.animate([{backgroundPosition:'0% 0'},{backgroundPosition:'250% 0'}],{duration:2000,iterations:Infinity});
    shockwave('rgba(255,255,255,.9)',10,700,4);setTimeout(()=>shockwave('rgba(255,222,122,.85)',13,850,4),110);setTimeout(()=>shockwave('rgba(245,179,1,.7)',16,1000,3),240);setTimeout(()=>shockwave('rgba(255,240,180,.6)',19,1150,2),380);
    stormRar='s';storm=140;burst(W/2,H*.45,'s',1.7);await wait(1050);if(skip)return;
    impactEl.style.transition='opacity .4s,transform .5s';impactEl.style.opacity='0';impactEl.style.transform='translate(-50%,-160%) scale(.8)';
    pillar.style.transition='none';pillar.style.height='0';pillar.style.opacity='1';pillar.style.width='5px';await raf();pillar.style.transition='height .3s ease-out';pillar.style.height='80%';
    cardwrap.style.transition='opacity .3s,transform .5s cubic-bezier(.2,.9,.2,1)';showCard();cardwrap.style.opacity='1';cardwrap.style.transform='translateY(0) scale(1)';
    await wait(360);if(skip)return;await flipCard('s',1.4,1.2);if(skip)return;
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),500);arc.style.transition='opacity 1s';arc.style.opacity='.45';}

  async function playHidden(){cine.classList.add('on');resetStage();await raf();
    cine.querySelectorAll('.rwd-heaven').forEach(e=>e.remove());
    // 0) 神光渐起（暖金天光，而非黑屏）
    const hv=document.createElement('div');hv.className='rwd-heaven';cine.appendChild(hv);
    hv.animate([{opacity:0},{opacity:1}],{duration:950,fill:'forwards'});
    osc(180,360,1.2,'sine',.10,0,true);osc(270,540,1.3,'triangle',.07,.06,true);
    rays.style.transition='opacity 1.6s';rays.style.opacity='.55';rays.style.animation='rwd-spin 26s linear infinite';
    await wait(1050);if(skip){hv.remove();return;}
    // 1) 金色星阵 · 圣印降临
    barT.style.height='12%';barB.style.height='12%';sfx('s','riser');
    arc.style.transition='opacity 1s,transform 1.9s cubic-bezier(.2,.8,.2,1)';arc.style.opacity='1';arc.style.transform='translate(-50%,-50%) scale(1.06) rotate(40deg)';
    arc.animate([{filter:'brightness(1)'},{filter:'brightness(1.85)'}],{duration:2100,easing:'ease-in'});
    const GC=['rgba(255,240,190,.6)','rgba(255,214,120,.55)','rgba(255,250,230,.85)'];
    shockwave(GC[0],6,1000,3);await wait(640);if(skip)return;
    shockwave(GC[1],8,950,3);await wait(600);if(skip)return;
    // 2) 圣环扩张 + 光爆
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),480);
    shockwave(GC[2],10,840,4);boom();await wait(540);if(skip)return;
    // 圣光爆闪（金白，取代霓虹冲击字）
    flash.style.transition='none';flash.style.background='radial-gradient(circle,#fff8e6,#ffdd99)';flash.style.opacity='1';await raf();flash.style.transition='opacity .75s';flash.style.opacity='0';
    // MYTHOS 金色圣言
    legendWord.style.transition='opacity .35s,transform .6s cubic-bezier(.18,1.5,.3,1)';legendWord.style.opacity='1';legendWord.style.transform='translate(-50%,-50%) scale(1)';
    legendWord.animate([{backgroundPosition:'0% 0'},{backgroundPosition:'300% 0'}],{duration:2000,iterations:Infinity});
    shockwave('rgba(255,255,255,.9)',12,780,5);setTimeout(()=>shockwave(GC[1],15,920,4),120);setTimeout(()=>shockwave(GC[0],18,1100,3),260);
    stormRar='h';storm=170;burst(W/2,H*.44,'h',1.8);await wait(900);if(skip)return;
    // 3) 金柱升起 + 卡片飞升
    pillar.style.setProperty('--rwacc','#FFE9A8');pillar.style.transition='none';pillar.style.height='0';pillar.style.opacity='1';pillar.style.width='6px';await raf();pillar.style.transition='height .34s ease-out';pillar.style.height='84%';
    cardwrap.style.transition='opacity .3s,transform .55s cubic-bezier(.2,.9,.2,1)';showCard();cardwrap.style.opacity='1';cardwrap.style.transform='translateY(0) scale(1)';
    burst(W/2,H*.5,'h',1.1);await wait(400);if(skip)return;
    // 4) 圣言隐去 + 翻面露人像 + 圣光和弦
    legendWord.style.transition='opacity .5s';legendWord.style.opacity='0';
    await flipCard('h',1.5,1.4);if(skip)return;
    boom();glow.style.transition='opacity .5s';glow.style.opacity='1';
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),560);
    shockwave('rgba(255,246,214,.9)',12,880,4);arc.style.transition='opacity 1.5s';arc.style.opacity='.5';
    hv.style.transition='opacity 1.3s';hv.style.opacity='.55';}

  /* ===== 多风格过场动画（预览：6 套供挑选） ===== */
  function pStar(g,r){g.beginPath();for(let i=0;i<10;i++){const rr=i%2?r*.44:r,a=Math.PI/5*i-Math.PI/2;g[i?'lineTo':'moveTo'](Math.cos(a)*rr,Math.sin(a)*rr);}g.closePath();g.fill();}
  function pHeart(g,r){g.beginPath();g.moveTo(0,r*.35);g.bezierCurveTo(r,-r*.5,r*1.3,r*.55,0,r*1.15);g.bezierCurveTo(-r*1.3,r*.55,-r,-r*.5,0,r*.35);g.closePath();g.fill();}
  function clearFx(){cine.querySelectorAll('.rwd-fx2').forEach(e=>e.remove());}
  function tint(bg,z){const d=document.createElement('div');d.className='rwd-fx2';d.style.cssText='inset:0;opacity:0;z-index:'+(z||1)+';background:'+bg;cine.appendChild(d);return d;}
  function svgEl(html){const d=document.createElement('div');d.innerHTML=html;return d.firstElementChild;}
  function bigword(text,cls){const d=document.createElement('div');d.className='rwd-fx2 rwd-bigword '+cls;d.textContent=text;cine.appendChild(d);return d;}
  function showWord(text,cls){const d=bigword(text,cls);requestAnimationFrame(()=>{d.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.55)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:520,easing:'cubic-bezier(.18,1.5,.3,1)',fill:'forwards'});});return d;}
  function pop(x,y,o){o=o||{};const n=o.n||60,cols=o.cols||['#fff'],sh=o.shape||'c';
    for(let i=0;i<n;i++){let a;if(o.dir!=null){a=o.dir+(Math.random()-.5)*(o.spread||1.2);}else{a=Math.random()*6.283;}
      const sp=(o.sp||3)*(.4+Math.random()*.9);
      P.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp+(o.up||0),g:(o.g==null?.12:o.g),life:1,dec:o.dec||.01,size:(o.size||3)*(.6+Math.random()*.8),col:cols[(Math.random()*cols.length)|0],rot:Math.random()*6.28,vr:(Math.random()-.5)*.3,shape:sh});}}
  function inkBlot(x,y,r,delay){const d=document.createElement('div');d.className='rwd-fx2 rwd-ink';d.style.left=x+'px';d.style.top=y+'px';cine.appendChild(d);
    d.animate([{width:'0',height:'0',opacity:0},{width:r*2+'px',height:r*2+'px',opacity:.92}],{duration:700,delay:delay||0,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});}
  function ribbonEl(c){const d=document.createElement('div');d.className='rwd-fx2 rwd-ribbon';d.style.background='linear-gradient(90deg,transparent,'+c+' 30%,#fff 50%,'+c+' 70%,transparent)';d.style.opacity='.85';cine.appendChild(d);return d;}
  function geoSVG(){return svgEl('<svg class="rwd-fx2 rwd-geo" viewBox="0 0 400 400">'
    +'<circle cx="200" cy="200" r="150" stroke="#5CD6FF" stroke-width="2"/>'
    +'<polygon points="200,58 332,292 68,292" stroke="#5CD6FF" stroke-width="2" style="animation-delay:.3s"/>'
    +'<path d="M250 200 a50 50 0 0 1 -50 50 a80 80 0 0 1 -80 -80 a130 130 0 0 1 130 -130 a210 210 0 0 1 210 210" stroke="#FFD65A" stroke-width="2.6" style="animation-delay:.5s"/>'
    +'<line x1="40" y1="200" x2="360" y2="200" stroke="#5CD6FF" stroke-width="1" style="animation-delay:.9s"/>'
    +'<line x1="200" y1="40" x2="200" y2="360" stroke="#5CD6FF" stroke-width="1" style="animation-delay:.9s"/></svg>');}
  function constSVG(){const pts=[[120,80],[210,60],[300,120],[330,220],[250,300],[150,290],[90,190]];
    let ln='',ci='';for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];ln+='<line x1="'+p[0]+'" y1="'+p[1]+'" x2="'+q[0]+'" y2="'+q[1]+'" style="animation-delay:'+(i*.12)+'s"/>';ci+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(2.5+Math.random()*2)+'"/>';}
    return svgEl('<svg class="rwd-fx2 rwd-const" viewBox="0 0 400 400">'+ln+ci+'</svg>');}
  function sfx2(k){try{const a=ac();if(!a)return;
    if(k==='gong'){osc(120,66,1.7,'sine',.32,0,true);osc(242,132,1.5,'sine',.16,0,true);noiseHit(.9,.1,0,480,120,true,true);}
    else if(k==='chime'){[880,1174,1568,2093,2637].forEach((f,i)=>osc(f,f,.8,'sine',.11,i*.05,true));}
    else if(k==='sparkle'||k==='glit'){for(let i=0;i<9;i++){const f=1300*Math.pow(1.14,i+((Math.random()*3)|0));osc(f,f,.4,'triangle',.06,i*.035,true);}}
    else if(k==='pop'){osc(420,880,.12,'sine',.22,0);}
    else if(k==='blip'){osc(300,900,.14,'square',.05,0);osc(600,1400,.1,'square',.04,.03);}
    else if(k==='tick'){osc(1600,1600,.04,'square',.03,0);}
    else if(k==='riseb'){osc(200,1800,1.1,'sawtooth',.05,0,true);noiseHit(1.1,.12,0,300,6000,true);}
    else if(k==='tap'){osc(180,90,.16,'sine',.28,0);noiseHit(.12,.16,0,1400,300,false);}
    else if(k==='poof'){noiseHit(.3,.16,0,1600,300,true,true);osc(700,300,.2,'sine',.1,0);}
    else if(k==='marimba'){[523,659,784,1047].forEach((f,i)=>osc(f,f,.5,'triangle',.12,i*.08,true));}
    else if(k==='clang'){noiseHit(.18,.34,0,4200,700,false);osc(2600,760,.16,'square',.09,0);osc(1700,420,.22,'triangle',.06,.01,true);}
    else if(k==='draw'){noiseHit(.34,.14,0,5200,1500,true);osc(1700,3400,.2,'sine',.05,0,true);}
    else if(k==='splash'){noiseHit(.42,.26,0,1300,320,true,true);osc(520,180,.28,'sine',.13,0);for(let i=0;i<6;i++)osc(700+i*130,700+i*130,.32,'sine',.05,i*.03,true);}
  }catch(e){}}
  async function reveal2(accGlow,onReveal){
    pillar.style.setProperty('--rwacc',accGlow);pillar.style.transition='none';pillar.style.height='0';pillar.style.opacity='1';pillar.style.width='6px';await raf();pillar.style.transition='height .34s ease-out';pillar.style.height='82%';
    cardwrap.style.transition='opacity .3s,transform .55s cubic-bezier(.2,.9,.2,1)';showCard();cardwrap.style.opacity='1';cardwrap.style.transform='translateY(0) scale(1)';
    glow.style.setProperty('--rwacc',accGlow);
    await wait(380);if(skip)return;
    card.style.transition='transform .84s cubic-bezier(.3,.9,.2,1)';card.style.transform='rotateY(0deg)';
    setTimeout(()=>{if(onReveal){try{onReveal();}catch(e){}}shine.style.transition='transform .7s ease-out';shine.style.transform='translateX(130%)';},380);
    await wait(820);glow.style.transition='opacity .6s';glow.style.opacity='1';pillar.style.opacity='0';}

  // —— 隐藏卡（邵老师）三套 ——
  async function playInk(){cine.classList.add('on');resetStage();clearFx();await raf();
    const paper=tint('radial-gradient(circle at 50% 40%,#f7efdc,#efe4c8 70%,#e7d8b0)',1);paper.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    osc(70,42,1.4,'sine',.3,0,true);noiseHit(.5,.2,0,900,200,true,true);
    for(let i=0;i<5;i++)inkBlot(W*(.28+Math.random()*.44),H*(.28+Math.random()*.4),60+Math.random()*120,i*110);
    await wait(760);if(skip){return;}
    const scroll=document.createElement('div');scroll.className='rwd-fx2 rwd-scroll';cine.appendChild(scroll);
    scroll.animate([{height:'0'},{height:'66vh'}],{duration:900,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    whoosh(.5,300,1400,.2);await wait(640);if(skip)return;
    const seal=document.createElement('div');seal.className='rwd-fx2 rwd-seal';seal.textContent='宗师';cine.appendChild(seal);
    seal.animate([{transform:'translate(-50%,-140%) scale(2.4)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:340,easing:'cubic-bezier(.2,1.5,.3,1)',fill:'forwards'});
    boom();cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),560);
    pop(W/2,H*.42,{n:60,cols:['#7a1414','#a52a2a','#1a1a1a'],shape:'c',sp:7,size:3,g:.14});
    await wait(900);if(skip)return;
    seal.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:'translate(-50%,-160%) scale(.7)',opacity:0}],{duration:500,fill:'forwards'});
    paper.animate([{opacity:1},{opacity:.5}],{duration:500,fill:'forwards'});
    await reveal2('#141414',()=>{sfx2('gong');pop(W/2,H/2,{n:72,cols:['#1a1a1a','#7a1414','#d9c48a'],shape:'c',sp:9,size:3});});
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),480);}

  async function playBlueprint(){cine.classList.add('on');resetStage();clearFx();await raf();
    [front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc','#5CD6FF'));
    const grid=document.createElement('div');grid.className='rwd-fx2 rwd-grid';cine.appendChild(grid);grid.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    sfx2('blip');osc(120,600,1.4,'sawtooth',.05,0,true);await wait(520);if(skip)return;
    cine.appendChild(geoSVG());for(let i=0;i<10;i++)setTimeout(()=>sfx2('tick'),i*140);
    await wait(1500);if(skip)return;
    const code=document.createElement('div');code.className='rwd-fx2 rwd-code';code.innerHTML='∮ E·dl = −dΦ/dt<br>∀ ε&gt;0  ∃ δ&gt;0<br>∴  Q.E.D.';cine.appendChild(code);code.animate([{opacity:0},{opacity:1}],{duration:500,fill:'forwards'});
    const w=showWord('宗师','blue');sfx2('riseb');
    pop(W/2,H*.5,{n:80,cols:['#5CD6FF','#A9EEFF','#fff','#FFD65A'],shape:'c',sp:8,size:2.5});
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),480);
    await wait(1000);if(skip)return;
    grid.animate([{opacity:1},{opacity:.4}],{duration:500,fill:'forwards'});w.animate([{opacity:1},{opacity:0}],{duration:400,fill:'forwards'});
    await reveal2('#5CD6FF',()=>{sfx2('blip');pop(W/2,H/2,{n:70,cols:['#5CD6FF','#fff','#FFD65A'],shape:'star',sp:7,size:4});});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),500);}

  async function playCosmic(){cine.classList.add('on');resetStage();clearFx();await raf();
    [front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc','#9DB4FF'));
    const sky=document.createElement('div');sky.className='rwd-fx2 rwd-space';cine.appendChild(sky);sky.animate([{opacity:0},{opacity:1}],{duration:700,fill:'forwards'});
    for(let i=0;i<70;i++)P.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,g:0,life:1,dec:.004,size:.6+Math.random()*1.6,col:Math.random()<.3?'#BFD0FF':'#fff',rot:0,vr:0,shape:'c'});
    osc(90,180,2,'sine',.12,0,true);await wait(720);if(skip)return;
    flash.style.transition='none';flash.style.background='radial-gradient(circle,#fff,#9db4ff 40%,transparent 70%)';flash.style.opacity='1';await raf();flash.style.transition='opacity .8s';flash.style.opacity='0';
    boom();shockwave('rgba(180,200,255,.7)',12,900,3);pop(W/2,H*.44,{n:140,cols:['#fff','#BFD0FF','#9C8CFF'],shape:'c',sp:12,size:2.4});
    await wait(700);if(skip)return;
    const cst=constSVG();cine.appendChild(cst);sfx2('sparkle');await wait(1200);if(skip)return;
    const w=showWord('宗师','star');sfx2('chime');
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),480);
    await wait(880);if(skip)return;
    cst.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(.2)'}],{duration:600,fill:'forwards'});
    w.animate([{opacity:1},{opacity:0}],{duration:400,fill:'forwards'});sky.animate([{opacity:1},{opacity:.55}],{duration:600,fill:'forwards'});
    await reveal2('#9DB4FF',()=>{sfx2('chime');pop(W/2,H/2,{n:80,cols:['#fff','#BFD0FF','#9C8CFF'],shape:'star',sp:8,size:3.5});});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),500);}

  // —— 女老师（可爱）三套 ——
  async function playMagic(){cine.classList.add('on');resetStage();clearFx();await raf();
    [front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc','#FF8FC7'));
    const sky=tint('radial-gradient(circle at 50% 42%,#ffd6ee,#ffc2e6 45%,#e9c7ff 80%)',1);sky.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    sfx2('sparkle');['#FF8FC7','#C9A7FF','#FFC7E6'].forEach((c,i)=>{const r=ribbonEl(c);r.animate([{transform:'translate(-50%,-50%) rotate('+(i*60)+'deg) scaleX(0)'},{transform:'translate(-50%,-50%) rotate('+(i*60+360)+'deg) scaleX(1)'}],{duration:1400,easing:'cubic-bezier(.3,.7,.3,1)',fill:'forwards'});});
    await wait(700);if(skip)return;
    pop(W/2,H*.4,{n:40,cols:['#fff','#FFE29A','#FF8FC7'],shape:'star',sp:7,size:5});sfx2('chime');await wait(480);if(skip)return;
    for(let k=0;k<3;k++)setTimeout(()=>pop(W*(.3+Math.random()*.4),H*.92,{n:14,dir:-1.5708,spread:1.0,cols:['#FF8FC7','#FFC7E6','#fff'],shape:'heart',g:-.01,size:6,dec:.006}),k*220);
    const w=showWord('变身！','cute');sfx2('sparkle');
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),400);
    await wait(1000);if(skip)return;
    w.animate([{opacity:1},{opacity:0}],{duration:350,fill:'forwards'});sky.animate([{opacity:1},{opacity:.7}],{duration:500,fill:'forwards'});
    await reveal2('#FF8FC7',()=>{sfx2('chime');pop(W/2,H/2,{n:50,cols:['#FF8FC7','#fff','#FFE29A','#C9A7FF'],shape:'heart',sp:7,size:5});pop(W/2,H/2,{n:40,cols:['#fff','#FFE29A'],shape:'star',sp:6,size:4});});}

  async function playDessert(){cine.classList.add('on');resetStage();clearFx();await raf();
    [front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc','#FFB3C7'));
    const sky=tint('linear-gradient(160deg,#ffe3ec,#e5f7ee 60%,#fff3d9)',1);sky.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});sfx2('marimba');
    for(let k=0;k<5;k++)setTimeout(()=>{pop(W*Math.random(),-20,{n:12,dir:1.5708,spread:.6,cols:['#FF9EC4','#8FE0C0','#FFD98A','#C9A7FF'],sp:1.6,g:.12,size:7,dec:.004});sfx2('pop');},k*260);
    await wait(1100);if(skip)return;
    const bow=document.createElement('div');bow.className='rwd-fx2 rwd-bow';bow.textContent='🎀';cine.appendChild(bow);
    bow.animate([{opacity:0,transform:'translate(-50%,-50%) scale(2) rotate(-20deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(0)'}],{duration:400,easing:'cubic-bezier(.2,1.5,.3,1)',fill:'forwards'});
    sfx2('poof');const w=showWord('甜心降临','cute');
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),400);
    await wait(900);if(skip)return;
    bow.animate([{opacity:1},{opacity:0}],{duration:400,fill:'forwards'});w.animate([{opacity:1},{opacity:0}],{duration:350,fill:'forwards'});sky.animate([{opacity:1},{opacity:.75}],{duration:500,fill:'forwards'});
    await reveal2('#FFB3C7',()=>{sfx2('marimba');pop(W/2,H/2,{n:46,cols:['#FF9EC4','#8FE0C0','#FFD98A','#fff'],shape:'c',sp:6,size:5});});}

  async function playSticker(){cine.classList.add('on');resetStage();clearFx();await raf();
    [front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc','#FFC15E'));
    const sky=tint('linear-gradient(160deg,#fff6e3,#ffeaf2 70%)',1);sky.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    for(let k=0;k<4;k++)setTimeout(()=>{pop(W*Math.random(),H*Math.random(),{n:16,cols:['#FFD98A','#FF9EC4','#8FD3FF','#fff'],shape:'star',sp:3,size:3.5,g:.02,dec:.01});sfx2('glit');},k*220);
    await wait(900);if(skip)return;
    const st=document.createElement('div');st.className='rwd-fx2 rwd-stamp';st.textContent='⭐';cine.appendChild(st);
    st.animate([{opacity:0,transform:'translate(-50%,-50%) scale(2.6) rotate(18deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(0)'}],{duration:300,easing:'cubic-bezier(.2,1.4,.35,1)',fill:'forwards'});
    sfx2('tap');cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),480);
    pop(W/2,H*.5,{n:50,cols:['#FFD98A','#FF9EC4','#fff'],shape:'star',sp:8,size:4});
    const w=showWord('闪亮登场','cute');await wait(950);if(skip)return;
    st.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.4)'}],{duration:450,fill:'forwards'});w.animate([{opacity:1},{opacity:0}],{duration:350,fill:'forwards'});sky.animate([{opacity:1},{opacity:.78}],{duration:500,fill:'forwards'});
    await reveal2('#FFC15E',()=>{sfx2('glit');pop(W/2,H/2,{n:56,cols:['#FFD98A','#FF9EC4','#8FD3FF','#fff'],shape:'star',sp:7,size:4});});}

  // —— 传奇角色 · 元素魔法（无职转生风）——
  function magicCircle(color,color2){color2=color2||color;
    const glyphs=['⟠','◇','✧','⬡','↯','✦','⟁','◈','❖','⟐','⌾','◆'];let runes='';
    for(let i=0;i<12;i++){const a=i/12*360,rad=(a-90)*Math.PI/180,rr=168,x=200+Math.cos(rad)*rr,y=200+Math.sin(rad)*rr;
      runes+='<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" fill="'+color+'" font-size="18" text-anchor="middle" dominant-baseline="central" opacity=".92" transform="rotate('+a.toFixed(1)+' '+x.toFixed(1)+' '+y.toFixed(1)+')">'+glyphs[i]+'</text>';}
    let ticks='';for(let i=0;i<48;i++){const a=i/48*2*Math.PI,r1=150,r2=i%4?157:163,x1=200+Math.cos(a)*r1,y1=200+Math.sin(a)*r1,x2=200+Math.cos(a)*r2,y2=200+Math.sin(a)*r2;
      ticks+='<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+color+'" stroke-width="1.4" opacity=".8"/>';}
    const tri=rot=>{let p='';for(let i=0;i<3;i++){const a=(rot+i*120-90)*Math.PI/180;p+=(i?' ':'')+(200+Math.cos(a)*118).toFixed(1)+','+(200+Math.sin(a)*118).toFixed(1);}return p;};
    return svgEl('<svg class="rwd-fx2 rwd-mcircle" viewBox="0 0 400 400" style="filter:drop-shadow(0 0 7px '+color+')">'
      +'<g class="spin"><circle class="draw" cx="200" cy="200" r="170" stroke="'+color+'" stroke-width="2.2"/>'
      +'<circle class="draw" cx="200" cy="200" r="150" stroke="'+color2+'" stroke-width="1" style="animation-delay:.12s"/>'
      +ticks+runes+'</g>'
      +'<g class="spinr"><circle class="draw" cx="200" cy="200" r="120" stroke="'+color+'" stroke-width="1.6" style="animation-delay:.22s"/>'
      +'<polygon class="draw" points="'+tri(0)+'" stroke="'+color+'" stroke-width="2.2" style="animation-delay:.38s"/>'
      +'<polygon class="draw" points="'+tri(180)+'" stroke="'+color2+'" stroke-width="2.2" style="animation-delay:.52s"/>'
      +'<circle class="draw" cx="200" cy="200" r="72" stroke="'+color+'" stroke-width="1.4" style="animation-delay:.66s"/>'
      +'<circle class="draw" cx="200" cy="200" r="40" stroke="'+color2+'" stroke-width="1.2" style="animation-delay:.78s"/></g></svg>');}
  function eleWord(text,color){const w=showWord(text,'ele');w.style.color='#fff';w.style.textShadow='0 0 22px '+color+',0 0 60px '+color;return w;}
  function mcIn(mc,rot){mc.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.5) rotate('+((rot||0)-30)+'deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate('+(rot||0)+'deg)'}],{duration:900,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});}
  function kanjiSlam(text,color){const kj=document.createElement('div');kj.className='rwd-fx2 rwd-kanji';kj.textContent=text;kj.style.whiteSpace='nowrap';kj.style.textShadow='0 0 24px '+color+',0 0 74px '+color+',0 6px 30px rgba(0,0,0,.55)';cine.appendChild(kj);
    kj.animate([{opacity:0,transform:'translate(-50%,-50%) scale(2.4) rotate(-10deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(0)'}],{duration:300,easing:'cubic-bezier(.2,1.5,.3,1)',fill:'forwards'});return kj;}

  async function playWater(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#38C6E8';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    const sky=tint('radial-gradient(circle at 50% 38%,#0a2c44,#04182a 55%,#01090f)',1);sky.animate([{opacity:0},{opacity:1}],{duration:500,fill:'forwards'});
    const clouds=tint('linear-gradient(180deg,rgba(4,16,28,.92),rgba(4,16,28,.35) 38%,transparent 62%)',2);clouds.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    const rain=setInterval(()=>{for(let i=0;i<4;i++)P.push({x:Math.random()*W,y:-12,vx:-2,vy:17+Math.random()*7,g:0,life:1,dec:.003,size:1.5+Math.random()*1.3,col:Math.random()<.4?'#cfeaff':'#7fb8dc',rot:0,vr:0,shape:'r'});},38);
    const bolt=(delay)=>setTimeout(()=>{if(skip)return;
      const b=svgEl('<svg class="rwd-fx2 rwd-bolt" viewBox="0 0 100 300" style="left:'+(18+Math.random()*60)+'%;top:0;height:62%;width:120px;opacity:0"><polyline points="52,0 40,66 62,96 44,158 66,208 46,300" fill="none" stroke="#e6f2ff" stroke-width="4" style="filter:drop-shadow(0 0 9px #9ecbff)"/></svg>');cine.appendChild(b);
      b.animate([{opacity:0},{opacity:1},{opacity:0},{opacity:.9},{opacity:0}],{duration:340,fill:'forwards'});
      flash.style.transition='none';flash.style.background='rgba(200,225,255,.55)';flash.style.opacity='.7';requestAnimationFrame(()=>{flash.style.transition='opacity .45s';flash.style.opacity='0';});
      noiseHit(.55,.2,0,220,60,true,true);osc(70,44,.7,'sine',.2,0);},delay);
    osc(58,42,1.8,'sine',.24,0,true);sfx('s','riser');
    const mc=magicCircle('#38C6E8','#9EEBFF');cine.appendChild(mc);mcIn(mc);bolt(650);
    const suck=setInterval(()=>{for(let a=0;a<9;a++){const ang=Math.random()*6.283,rad=280+Math.random()*130;pop(W/2+Math.cos(ang)*rad,H*.44+Math.sin(ang)*rad,{n:1,dir:ang+Math.PI+.55,spread:.1,cols:['#38C6E8','#9EEBFF','#cfffff'],shape:'c',sp:9,g:0,size:2.6,dec:.02});}},60);
    await wait(1250);if(skip){clearInterval(suck);clearInterval(rain);return;}
    clearInterval(suck);bolt(0);
    mc.animate([{opacity:.9,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.3)'}],{duration:520,easing:'ease-in',fill:'forwards'});
    const bloom=waterBloom();cine.appendChild(bloom);
    bloom.animate([{transform:'translate(-50%,-50%) scale(0) rotate(-40deg)'},{transform:'translate(-50%,-50%) scale(1.05) rotate(0)'},{transform:'translate(-50%,-50%) scale(1) rotate(0)'}],{duration:680,easing:'cubic-bezier(.2,1.3,.35,1)',fill:'forwards'});
    sfx2('splash');cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),560);
    for(let a=0;a<26;a++){const ang=-Math.PI/2+(a/26-0.5)*2.4;pop(W/2,H*.46,{n:2,dir:ang,spread:.06,cols:['#eafcff','#9EEBFF','#38C6E8'],shape:'c',sp:13,g:.16,size:2.6,dec:.012});}
    const bub=setInterval(()=>{pop(W/2+(Math.random()-.5)*W*.5,H*.92,{n:2,dir:-1.5708,spread:.5,cols:['#bfeeff','#eafcff','#fff'],shape:Math.random()<.25?'heart':'c',sp:4,up:-3,g:-.02,size:3.4,dec:.006});pop(W*Math.random(),H*Math.random()*.7,{n:1,cols:['#fff','#dff4ff'],shape:'star',sp:1.5,g:0,size:2.6,dec:.02});},110);
    await wait(760);if(skip){clearInterval(rain);clearInterval(bub);return;}
    flash.style.transition='none';flash.style.background='radial-gradient(circle,#eafcff,#7fdcff 42%,transparent 74%)';flash.style.opacity='1';await raf();flash.style.transition='opacity .7s';flash.style.opacity='0';
    const kj=kanjiSlam('水',acc);kj.style.textShadow='0 0 26px #38C6E8,0 0 72px #7fdcff,0 4px 20px rgba(0,0,0,.4)';boom();
    bloom.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:1,filter:'brightness(1)'},{transform:'translate(-50%,-50%) scale(1.5)',opacity:0,filter:'brightness(1.5)'}],{duration:600,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),560);
    shockwave('rgba(160,230,255,.75)',13,900,3);setTimeout(()=>shockwave('rgba(190,240,255,.55)',17,1050,2),150);
    for(let t=0;t<34;t++){const ang=t/34*6.283;pop(W/2,H*.46,{n:5,dir:ang,spread:.1,cols:['#9EEBFF','#38C6E8','#eafcff','#fff'],shape:t%4===0?'heart':'c',sp:13,g:.05,size:2.8,dec:.011});}
    pop(W/2,H*.46,{n:50,cols:['#fff','#dff4ff'],shape:'star',sp:9,g:0,size:3,dec:.012});
    clearInterval(bub);
    await wait(820);if(skip){clearInterval(rain);return;}
    clearInterval(rain);
    kj.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.25)'}],{duration:420,fill:'forwards'});
    mc.animate([{opacity:.9},{opacity:0}],{duration:500,fill:'forwards'});clouds.animate([{opacity:1},{opacity:.4}],{duration:600,fill:'forwards'});sky.animate([{opacity:1},{opacity:.5}],{duration:600,fill:'forwards'});
    await reveal2(acc,()=>{sfx2('chime');pop(W/2,H/2,{n:60,cols:['#9EEBFF','#eafcff','#fff'],shape:'heart',sp:8,size:4});pop(W/2,H/2,{n:44,cols:['#fff','#dff4ff'],shape:'star',sp:6,size:3});});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),520);}

  async function playKing(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#FFD65A';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    const sky=tint('radial-gradient(circle at 50% 44%,#1a1630,#0a0818 60%,#04030a)',1);sky.animate([{opacity:0},{opacity:1}],{duration:500,fill:'forwards'});
    sfx('s','riser');barT.style.height='12%';barB.style.height='12%';
    rays.style.transition='opacity 1.2s';rays.style.opacity='.5';rays.style.animation='rwd-spin 20s linear infinite';
    const pal=[['#38C6E8','#9EEBFF'],['#FF5A2C','#FFC24A'],['#3EE6A6','#9CFFD8'],['#D2A15E','#F0CE96']];
    pal.forEach((c,i)=>setTimeout(()=>{const mc=magicCircle(c[0],c[1]);cine.appendChild(mc);const s=(1.18-i*.13);
      mc.animate([{opacity:0,transform:'translate(-50%,-50%) scale('+(s+.3)+') rotate('+(i*24)+'deg)'},{opacity:.92,transform:'translate(-50%,-50%) scale('+s+') rotate('+(i*24)+'deg)'}],{duration:640,fill:'forwards'});
      sfx2('gong');shockwave('rgba(255,240,190,.45)',6+i*1.5,850,3);cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),380);},i*430));
    await wait(430*4+320);if(skip)return;
    const gmc=magicCircle('#FFE9A8','#FFF6D5');cine.appendChild(gmc);gmc.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.4)'},{opacity:1,transform:'translate(-50%,-50%) scale(.72)'}],{duration:600,fill:'forwards'});
    const w0=eleWord('无咏唱',acc);w0.style.textShadow='0 0 24px #FFE9A8,0 0 70px #FFB300';sfx2('riseb');
    await wait(880);if(skip)return;
    w0.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.5)'}],{duration:450,fill:'forwards'});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),640);
    flash.style.transition='none';flash.style.background='radial-gradient(circle,#fff,#ffe9a8 45%,transparent 74%)';flash.style.opacity='1';await raf();flash.style.transition='opacity .85s';flash.style.opacity='0';
    boom();
    legendWord.textContent='王級魔術';legendWord.style.transition='opacity .3s,transform .55s cubic-bezier(.18,1.6,.3,1)';legendWord.style.opacity='1';legendWord.style.transform='translate(-50%,-50%) scale(1)';
    legendWord.animate([{backgroundPosition:'0% 0'},{backgroundPosition:'250% 0'}],{duration:2000,iterations:Infinity});
    shockwave('rgba(255,255,255,.9)',11,760,5);setTimeout(()=>shockwave('rgba(255,224,140,.8)',15,920,4),120);setTimeout(()=>shockwave('rgba(245,179,1,.7)',19,1100,3),260);
    stormRar='s';storm=140;burst(W/2,H*.45,'s',1.7);pop(W/2,H*.46,{n:120,cols:['#FFE9A8','#fff','#FFD65A','#38C6E8','#FF5A2C','#3EE6A6'],shape:'star',sp:12,size:3,g:.06});
    await wait(1050);if(skip)return;
    cine.querySelectorAll('.rwd-mcircle').forEach(e=>e.animate([{opacity:.9},{opacity:0}],{duration:500,fill:'forwards'}));
    legendWord.style.transition='opacity .5s';legendWord.style.opacity='0';sky.animate([{opacity:1},{opacity:.55}],{duration:500,fill:'forwards'});
    await reveal2(acc,()=>{boom();sfx2('chime');pop(W/2,H/2,{n:110,cols:['#FFE9A8','#fff','#FFD65A','#38C6E8','#FF5A2C','#3EE6A6'],shape:'star',sp:9,size:4});});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),580);}

  function windSpiral(color,color2){color2=color2||color;let paths='';
    for(let s=0;s<3;s++){const off=s*(2*Math.PI/3);let d='';
      for(let i=0;i<=90;i++){const t=i/90*3.4*Math.PI+off,r=8+t*9,x=200+Math.cos(t)*r,y=200+Math.sin(t)*r;d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);}
      paths+='<path d="'+d+'" stroke="'+(s%2?color2:color)+'" stroke-width="'+(2.4-s*.4).toFixed(1)+'" style="animation-delay:'+(s*.12)+'s"/>';}
    return svgEl('<svg class="rwd-fx2 rwd-spiral" viewBox="0 0 400 400" style="filter:drop-shadow(0 0 6px '+color+')"><g class="spin">'+paths+'</g></svg>');}
  function slash(angle,delay,color,thick,big,spCols,silent){const d=document.createElement('div');d.className='rwd-fx2';const sc=spCols||['#fff','#ffe08a','#FF6A6A'];
    d.style.cssText='top:50%;left:50%;width:200vmax;height:'+(thick||8)+'px;transform:translate(-50%,-50%) rotate('+angle+'deg) scaleX(0);transform-origin:center;background:linear-gradient(90deg,transparent 0%,'+(color||'#fff')+' 40%,#fff 50%,'+(color||'#fff')+' 60%,transparent 100%);filter:blur(.5px) drop-shadow(0 0 14px '+(color||'#fff')+');z-index:8;opacity:0';
    cine.appendChild(d);
    setTimeout(()=>{d.animate([{transform:'translate(-50%,-50%) rotate('+angle+'deg) scaleX(0)',opacity:1},{transform:'translate(-50%,-50%) rotate('+angle+'deg) scaleX(1)',opacity:1},{transform:'translate(-50%,-50%) rotate('+angle+'deg) scaleX(1)',opacity:0}],{duration:340,easing:'cubic-bezier(.15,.85,.1,1)',fill:'forwards'});
      if(!silent)sfx2('clang');const rad=angle*Math.PI/180;
      pop(W/2,H/2,{n:big?34:18,dir:rad,spread:.25,cols:sc,shape:'r',sp:big?13:9,size:2,g:.22,dec:.025});
      pop(W/2,H/2,{n:big?34:18,dir:rad+Math.PI,spread:.25,cols:sc,shape:'r',sp:big?13:9,size:2,g:.22,dec:.025});
      cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),240);},delay);
    return d;}

  async function playSword(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#FF5A6E';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    const sky=tint('radial-gradient(circle at 50% 40%,#2a0a10,#140406 55%,#080203)',1);sky.animate([{opacity:0},{opacity:1}],{duration:500,fill:'forwards'});
    osc(70,50,1.2,'sine',.16,0,true);sfx2('draw');
    const gleam=document.createElement('div');gleam.className='rwd-fx2';gleam.style.cssText='top:0;bottom:0;left:50%;width:3px;transform:translate(-50%,0) rotate(20deg);background:linear-gradient(180deg,transparent,#fff,transparent);filter:blur(1px) drop-shadow(0 0 14px #fff);z-index:8;opacity:0';cine.appendChild(gleam);
    gleam.animate([{opacity:0,transform:'translate(-320px,0) rotate(20deg)'},{opacity:1,transform:'translate(-50%,0) rotate(20deg)'},{opacity:0,transform:'translate(240px,0) rotate(20deg)'}],{duration:720,easing:'ease-in-out',fill:'forwards'});
    await wait(760);if(skip)return;
    const angs=[28,-34,66,-14,48];
    for(let i=0;i<angs.length;i++){slash(angs[i],i*175,'#ffd0d6',i===angs.length-1?16:8,i===angs.length-1);}
    await wait(175*angs.length+150);if(skip)return;
    flash.style.transition='none';flash.style.background='radial-gradient(circle,#fff,#ff3b5c 45%,transparent 74%)';flash.style.opacity='1';await raf();flash.style.transition='opacity .7s';flash.style.opacity='0';
    const kj=document.createElement('div');kj.className='rwd-fx2 rwd-kanji';kj.textContent='斬';cine.appendChild(kj);
    kj.animate([{opacity:0,transform:'translate(-50%,-50%) scale(2.4) rotate(-12deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(0)'}],{duration:300,easing:'cubic-bezier(.2,1.5,.3,1)',fill:'forwards'});
    boom();sfx2('clang');cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),600);
    pop(W/2,H*.46,{n:80,cols:['#fff','#ffd0d6','#FF5A6E','#ffe08a'],shape:'r',sp:12,size:2.4,g:.24,dec:.02});
    await wait(880);if(skip)return;
    kj.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.25)'}],{duration:420,fill:'forwards'});
    sky.animate([{opacity:1},{opacity:.5}],{duration:500,fill:'forwards'});
    await reveal2(acc,()=>{sfx2('clang');slash(18,0,'#fff',10,false);pop(W/2,H/2,{n:70,cols:['#fff','#ffd0d6','#FF5A6E'],shape:'r',sp:9,size:2.4,g:.2,dec:.02});});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),520);}

  function windStream(){let p='';for(let i=0;i<6;i++){const y=50+i*78;const d='M-60,'+y+' C 240,'+(y-54)+' 520,'+(y+64)+' 800,'+(y-34)+' S 1460,'+(y+44)+' 1520,'+y;
      p+='<path d="'+d+'" stroke="rgba('+(i%2?'210,255,238':'255,255,255')+','+(0.55-i*0.06).toFixed(2)+')" stroke-width="'+(3.2-i*0.3).toFixed(1)+'" fill="none" style="animation-delay:'+(i*0.09).toFixed(2)+'s"/>';}
    return svgEl('<svg class="rwd-fx2 rwd-wstream" viewBox="0 0 1460 520" preserveAspectRatio="xMidYMid slice">'+p+'</svg>');}

  function waterBloom(){const petal='M0,0 C -17,-42 -11,-96 0,-122 C 11,-96 17,-42 0,0 Z';let outer='',inner='';
    for(let i=0;i<10;i++)outer+='<g transform="rotate('+(i*36)+')"><path d="'+petal+'" fill="url(#rwd-bl)" stroke="#eafcff" stroke-width="2" opacity=".9"/></g>';
    for(let i=0;i<8;i++)inner+='<g transform="rotate('+(i*45+22)+') scale(.6)"><path d="'+petal+'" fill="url(#rwd-bl2)" stroke="#f2feff" stroke-width="2.6" opacity=".96"/></g>';
    return svgEl('<svg class="rwd-fx2 rwd-wbloom" viewBox="-160 -160 320 320">'
     +'<defs><radialGradient id="rwd-bl" cx="50%" cy="82%" r="82%"><stop offset="0" stop-color="#eafcff" stop-opacity=".95"/><stop offset=".5" stop-color="#7fdcff" stop-opacity=".82"/><stop offset="1" stop-color="#2a9fe0" stop-opacity=".55"/></radialGradient>'
     +'<radialGradient id="rwd-bl2" cx="50%" cy="82%" r="82%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#8fe3ff" stop-opacity=".82"/></radialGradient></defs>'
     +'<g class="wb-outer">'+outer+'</g><g class="wb-inner">'+inner+'</g>'
     +'<circle class="wb-core" cx="0" cy="0" r="27" fill="url(#rwd-bl2)"/></svg>');}
  async function playWind(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#7DEFC0';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    const sky=tint('radial-gradient(circle at 50% 40%,#2a4a52,#1c3640 52%,#0e2026)',1);sky.animate([{opacity:0},{opacity:1}],{duration:500,fill:'forwards'});
    osc(240,520,1.4,'sine',.05,0,true);noiseHit(1.8,.12,0,600,3600,true);sfx('s','riser');
    const stream=windStream();cine.appendChild(stream);
    stream.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    stream.animate([{transform:'translateX(-30px)'},{transform:'translateX(30px)'}],{duration:3000,iterations:Infinity,direction:'alternate',easing:'ease-in-out'});
    const petals=setInterval(()=>{pop(-20,H*(.1+Math.random()*.8),{n:2,dir:.15,spread:.4,cols:['#bff7e0','#eafff6','#fff','#a9e8ff'],shape:'petal',sp:6,g:.005,up:-.5,size:5,dec:.006});},70);
    await wait(1050);if(skip){clearInterval(petals);return;}
    const sp=windSpiral('#8affd0','#eafff6');cine.appendChild(sp);sp.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.4)'},{opacity:.95,transform:'translate(-50%,-50%) scale(1.1)'}],{duration:750,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    for(let k=0;k<3;k++)setTimeout(()=>{for(let a=0;a<14;a++){const ang=a/14*6.283;pop(W/2+Math.cos(ang)*240,H*.46+Math.sin(ang)*240,{n:1,dir:ang+3.14+1.1,spread:.2,cols:['#bff7e0','#eafff6','#fff','#a9e8ff'],shape:'petal',sp:7,g:0,size:5,dec:.01});}},k*230);
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),500);
    await wait(1000);if(skip){clearInterval(petals);return;}
    clearInterval(petals);
    flash.style.transition='none';flash.style.background='radial-gradient(circle,#f2fffa,#a9f0d6 45%,transparent 74%)';flash.style.opacity='.9';await raf();flash.style.transition='opacity .8s';flash.style.opacity='0';
    const kj=kanjiSlam('風',acc);kj.style.textShadow='0 0 26px #7DEFC0,0 0 72px #7DEFC0,0 4px 20px rgba(0,0,0,.4)';sfx2('poof');
    sp.animate([{opacity:.95,transform:'translate(-50%,-50%) scale(1.1) rotate(0)'},{opacity:0,transform:'translate(-50%,-50%) scale(2) rotate(70deg)'}],{duration:640,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    for(let t=0;t<30;t++){const ang=t/30*6.283;pop(W/2,H*.46,{n:5,dir:ang,spread:.1,cols:['#bff7e0','#eafff6','#fff','#a9e8ff'],shape:'petal',sp:14,g:0,size:5,dec:.01});}
    shockwave('rgba(180,255,225,.65)',13,860,3);setTimeout(()=>shockwave('rgba(220,255,240,.5)',17,1000,2),140);
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),560);
    await wait(880);if(skip)return;
    kj.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.2)'}],{duration:420,fill:'forwards'});
    stream.animate([{opacity:1},{opacity:.4}],{duration:600,fill:'forwards'});sky.animate([{opacity:1},{opacity:.6}],{duration:600,fill:'forwards'});
    await reveal2(acc,()=>{sfx2('sparkle');pop(W/2,H/2,{n:70,cols:['#bff7e0','#eafff6','#fff'],shape:'petal',sp:8,size:5});pop(W/2,H/2,{n:40,cols:['#fff','#a9e8ff'],shape:'star',sp:6,size:3});});
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),520);}

  // —— 满月主题 · 专属视觉资产（追光灯 / 翅膀羽毛 / 残月彗星）——
  function spotBeam(color,rot){const id='rwsb'+((Math.random()*1e6)|0);
    return svgEl('<svg class="rwd-fx2" viewBox="0 0 200 420" preserveAspectRatio="none" style="top:-8%;left:50%;width:60vmax;height:78vmax;transform:translate(-50%,0) rotate('+(rot||0)+'deg);opacity:0">'
      +'<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+color+'" stop-opacity=".62"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'
      +'<polygon points="100,0 34,420 166,420" fill="url(#'+id+')"/></svg>');}
  function crescentMoon(color){const id='rwcm'+((Math.random()*1e6)|0);
    return svgEl('<svg class="rwd-fx2" viewBox="0 0 100 100" style="filter:drop-shadow(0 0 16px '+color+')">'
      +'<defs><mask id="'+id+'"><rect width="100" height="100" fill="#fff"/><circle cx="63" cy="40" r="33" fill="#000"/></mask></defs>'
      +'<circle cx="50" cy="50" r="33" fill="'+color+'" mask="url(#'+id+')"/></svg>');}
  function featherEl(color,xPct,delay,dur,sway){const d=document.createElement('div');d.className='rwd-fx2';
    d.innerHTML='<svg viewBox="0 0 40 90" style="width:100%;height:100%;overflow:visible"><path d="M20,2 C30,10 33,34 27,52 C24,64 21,78 20,88 C19,78 16,64 13,52 C7,34 10,10 20,2 Z" fill="'+color+'" opacity=".92"/><line x1="20" y1="6" x2="20" y2="84" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>';
    d.style.cssText='top:-8%;left:'+xPct+'%;width:20px;height:46px;opacity:0';cine.appendChild(d);
    d.animate([{transform:'translate(0,0) rotate('+(sway||0)+'deg)',opacity:0},{transform:'translate('+(sway>0?46:-46)+'px,50vh) rotate('+((sway||0)+50)+'deg)',opacity:1,offset:.55},{transform:'translate('+(sway>0?-22:22)+'px,110vh) rotate('+((sway||0)-30)+'deg)',opacity:0}],{duration:dur||2200,delay:delay||0,easing:'ease-in',fill:'forwards'}).onfinish=()=>d.remove();
    return d;}
  function wingHalf(color,side){let feathers='';
    for(let i=0;i<7;i++){const a=10+i*10,len=56+i*12,c1x=(len*.5*side).toFixed(1),c1y=-(6+i*2),c2x=(len*.85*side).toFixed(1),c2y=-(2+i*3),ex=(len*side).toFixed(1);
      feathers+='<path d="M0,0 C '+c1x+','+c1y+' '+c2x+','+c2y+' '+ex+',6" stroke="'+color+'" stroke-width="'+(9-i*.7).toFixed(1)+'" fill="none" stroke-linecap="round" opacity="'+(0.92-i*.06).toFixed(2)+'" transform="rotate('+(-a*side)+')"/>';}
    const pos=side<0?'left:50%;transform:translate(-100%,-50%)':'left:50%;transform:translate(0%,-50%)';
    return svgEl('<svg class="rwd-fx2" viewBox="-140 -90 280 180" style="top:50%;'+pos+';width:50vmin;height:32vmin;opacity:0"><g>'+feathers+'</g></svg>');}
  /* 幕布：流苏做成幕布的子元素，保证拉幕时必然跟着一起移出画面 */
  function curtainPanel(side){const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:0;bottom:0;'+(side<0?'left:0':'right:0')+';width:54%;z-index:5;'
      +'background:linear-gradient(90deg,#3a0a10,#6b1220 22%,#8a1a2c 42%,#a3223a 50%,#8a1a2c 58%,#6b1220 78%,#3a0a10),repeating-linear-gradient(90deg,rgba(0,0,0,.24) 0 14px,rgba(255,255,255,.035) 14px 28px);'
      +'background-blend-mode:multiply;box-shadow:'+(side<0?'22px 0 48px rgba(0,0,0,.55)':'-22px 0 48px rgba(0,0,0,.55)')+' inset;';
    const trim=document.createElement('div');
    trim.style.cssText='position:absolute;top:0;bottom:0;'+(side<0?'right:0':'left:0')+';width:10px;'
      +'background:linear-gradient(180deg,#FFE9A8,#D2A15E 12%,#FFE9A8 24%,#D2A15E 36%,#FFE9A8 48%,#D2A15E 60%,#FFE9A8 72%,#D2A15E 84%,#FFE9A8 96%);'
      +'box-shadow:0 0 10px rgba(255,224,140,.6);';
    d.appendChild(trim);
    cine.appendChild(d);return d;}
  function curtainValance(){const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:0;left:0;right:0;height:13%;z-index:6;'
      +'background:radial-gradient(circle at 10% -60%,transparent 62%,#6b1220 63%),radial-gradient(circle at 30% -60%,transparent 62%,#6b1220 63%),radial-gradient(circle at 50% -60%,transparent 62%,#6b1220 63%),radial-gradient(circle at 70% -60%,transparent 62%,#6b1220 63%),radial-gradient(circle at 90% -60%,transparent 62%,#6b1220 63%),linear-gradient(180deg,#8a1a2c,#6b1220);'
      +'box-shadow:0 10px 26px rgba(0,0,0,.55);';
    cine.appendChild(d);return d;}
  function floorSpot(color){const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:60%;left:50%;width:70vmin;height:26vmin;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,'+color+' 0%,transparent 70%);opacity:0;filter:blur(2px)';
    cine.appendChild(d);return d;}

  /* 满月 Mitsuki · 追星偶像开场：舞台幕布（绒面+流苏+顶部帷幔+地面聚光）左右拉开揭幕，不做卡片翻面 */
  async function playMitsuki(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#E0A821';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    card.style.transition='none';card.style.transform='rotateY(0deg)';
    cardwrap.style.transition='none';showCard();cardwrap.style.opacity='1';cardwrap.style.transform='translateY(0) scale(1)';
    glow.style.opacity='0';shine.style.transition='none';shine.style.transform='translateX(-130%)';
    const sky=tint('radial-gradient(circle at 50% 30%,#241b06,#0c0904 60%,#040302)',1);sky.animate([{opacity:0},{opacity:1}],{duration:500,fill:'forwards'});
    for(let i=0;i<40;i++)P.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,g:0,life:1,dec:.003+Math.random()*.004,size:.6+Math.random()*1.2,col:Math.random()<.3?'#FFE9A8':'#fff',rot:0,vr:0,shape:'c'});
    const spot=floorSpot('rgba(255,220,140,.55)');spot.animate([{opacity:0},{opacity:.9}],{duration:900,fill:'forwards'});
    const valance=curtainValance();
    const curL=curtainPanel(-1),curR=curtainPanel(1);
    const beamL=spotBeam(acc,-16),beamR=spotBeam(acc,16);cine.appendChild(beamL);cine.appendChild(beamR);
    osc(220,440,1.2,'sine',.08,0,true);sfx2('chime');
    beamL.animate([{opacity:0,transform:'translate(-50%,0) rotate(-30deg)'},{opacity:.75,transform:'translate(-50%,0) rotate(-8deg)'}],{duration:750,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    beamR.animate([{opacity:0,transform:'translate(-50%,0) rotate(30deg)'},{opacity:.75,transform:'translate(-50%,0) rotate(8deg)'}],{duration:750,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    rays.style.transition='opacity 1s';rays.style.opacity='.4';rays.style.animation='rwd-spin 26s linear infinite';
    await wait(700);if(skip)return;
    barT.style.height='6%';sfx('r','riser');
    await wait(500);if(skip)return;
    osc(660,880,.3,'sine',.12,0,true);sfx2('tap');
    await wait(260);if(skip)return;
    boom();cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),420);
    const w=showWord('满月降临','star');w.style.color='#fff';w.style.textShadow='0 0 22px #FFE9A8,0 0 60px #FFC531';
    curL.animate([{transform:'translateX(0)'},{transform:'translateX(-102%)'}],{duration:780,easing:'cubic-bezier(.6,0,.2,1)',fill:'forwards'});
    curR.animate([{transform:'translateX(0)'},{transform:'translateX(102%)'}],{duration:780,easing:'cubic-bezier(.6,0,.2,1)',fill:'forwards'});
    sfx2('poof');whoosh(.5,600,120,.16);
    glow.style.transition='opacity .6s';glow.style.opacity='.85';
    setTimeout(()=>{shine.style.transition='transform .7s ease-out';shine.style.transform='translateX(130%)';},380);
    pop(W/2,H*.46,{n:60,cols:['#FFE9A8','#fff','#FFC531'],shape:'star',sp:9,size:3.4,g:.05});
    pop(W*.08,H*.94,{n:36,dir:-1.0,spread:.5,cols:['#FFE9A8','#fff','#FFC531','#D2A15E'],shape:'r',sp:11,g:.14,size:3,dec:.012});
    pop(W*.92,H*.94,{n:36,dir:-2.1,spread:.5,cols:['#FFE9A8','#fff','#FFC531','#D2A15E'],shape:'r',sp:11,g:.14,size:3,dec:.012});
    await wait(850);if(skip)return;
    w.animate([{opacity:1},{opacity:0}],{duration:380,fill:'forwards'});
    sky.animate([{opacity:1},{opacity:.55}],{duration:500,fill:'forwards'});
    beamL.animate([{opacity:.75},{opacity:.25}],{duration:600,fill:'forwards'});beamR.animate([{opacity:.75},{opacity:.25}],{duration:600,fill:'forwards'});
    sfx2('chime');
    const call=setInterval(()=>{pop(Math.random()*W,-10,{n:2,dir:1.5708,spread:.3,cols:['#FFE9A8','#fff'],shape:'star',sp:2.4,g:.05,size:2.6,dec:.012});},110);
    setTimeout(()=>clearInterval(call),1400);
    await wait(500);if(skip)return;}

  /* 芽依 Meroko · 从天而降的调皮登场：卡片本体像弹力玩偶一样落地弹跳，不做翻面 */
  async function playMeroko(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#FF6FA5';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    card.style.transition='none';card.style.transform='rotateY(0deg)';
    cardwrap.style.transition='none';showCard();cardwrap.style.opacity='1';cardwrap.style.transform='translateY(-130vh) scale(.72) rotate(-10deg)';
    glow.style.opacity='0';
    const sky=tint('radial-gradient(circle at 50% 40%,#ffd9ea,#ffc2dc 55%,#ffe9f4 85%)',1);sky.animate([{opacity:0},{opacity:1}],{duration:550,fill:'forwards'});
    sfx2('sparkle');
    for(let i=0;i<13;i++)featherEl(i%2?'#fff':'#FF9EC4',6+Math.random()*88,i*70,1900+Math.random()*500,(i%2?1:-1)*(20+Math.random()*20));
    await wait(650);if(skip)return;
    sfx2('poof');
    // 五次落地弹跳，每次幅度递减：落→压扁→弹起→拉长→再落，像弹力玩偶
    showCard();cardwrap.animate([
      {transform:'translateY(-130vh) scale(.72) rotate(-10deg)',offset:0},
      {transform:'translateY(0) scale(1) rotate(3deg)',        offset:.26,easing:'cubic-bezier(.5,0,.9,.4)'},
      {transform:'translateY(3vh) scale(1.22,.72) rotate(4deg)',offset:.30},               // 第1次落地·压扁
      {transform:'translateY(-17vh) scale(.86,1.18) rotate(-5deg)',offset:.42},            // 弹起·拉长
      {transform:'translateY(2.4vh) scale(1.16,.79) rotate(-3deg)',offset:.54},            // 第2次落地
      {transform:'translateY(-10vh) scale(.91,1.12) rotate(3deg)',offset:.64},
      {transform:'translateY(1.8vh) scale(1.11,.86) rotate(2deg)',offset:.73},             // 第3次落地
      {transform:'translateY(-5.5vh) scale(.95,1.07) rotate(-2deg)',offset:.81},
      {transform:'translateY(1.2vh) scale(1.06,.93) rotate(-1deg)',offset:.87},            // 第4次落地
      {transform:'translateY(-2.6vh) scale(.98,1.03) rotate(1deg)',offset:.92},
      {transform:'translateY(.6vh) scale(1.03,.97) rotate(.5deg)',offset:.96},             // 第5次落地
      {transform:'translateY(-1vh) scale(.99,1.01) rotate(0)',offset:.98},
      {transform:'translateY(0) scale(1) rotate(0)',offset:1}
    ],{duration:1650,easing:'cubic-bezier(.3,.6,.3,1)',fill:'forwards'});
    // 每次触地都来一发粒子 + 音效 + 轻微震屏，弹跳感才落得实
    [[495,1],[891,.78],[1204,.58],[1435,.4],[1584,.26]].forEach(([t,pw])=>setTimeout(()=>{
      if(skip)return;
      pop(W/2,H*.72,{n:Math.round(40*pw)+8,dir:-1.5708,spread:1.5,cols:['#fff','#FFD6E8','#FF6FA5'],shape:'c',sp:6*pw+1.5,g:.1,size:3.4*pw+1});
      pop(W/2,H*.72,{n:Math.round(16*pw)+4,dir:-1.5708,spread:1.5,cols:['#fff','#ffe1ee'],shape:'star',sp:5*pw+1,g:.06,size:3*pw+1});
      osc(300+pw*260,150+pw*120,.13,'sine',.1+pw*.14,0);sfx2('pop');
      if(pw>.5){cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),200);}
    },t));
    // 下落轨迹上留一串闪光尾迹（第一次触地前，沿下落路径撒星）
    let trailT=0;const trail=setInterval(()=>{trailT+=40;const p=Math.min(1,trailT/495);if(p>=1){clearInterval(trail);return;}
      const y=H*(-.3+p*.86);pop(W/2+(Math.random()-.5)*30,y,{n:2,cols:['#fff','#FFD6E8','#FFEFF6'],shape:'star',sp:1.6,g:0,size:2.4,dec:.03});},40);
    skipRes.push(()=>clearInterval(trail));
    const wingL=wingHalf(acc,-1),wingR=wingHalf(acc,1);cine.appendChild(wingL);cine.appendChild(wingR);
    // 翅膀在第一次触地那一瞬张开
    setTimeout(()=>{if(skip)return;
      wingL.animate([{opacity:0,transform:'translate(-100%,-50%) scale(.25) rotate(-16deg)'},{opacity:.95,transform:'translate(-100%,-50%) scale(1) rotate(0)'}],{duration:420,easing:'cubic-bezier(.2,1.4,.3,1)',fill:'forwards'});
      wingR.animate([{opacity:0,transform:'translate(0%,-50%) scale(.25) rotate(16deg)'},{opacity:.95,transform:'translate(0%,-50%) scale(1) rotate(0)'}],{duration:420,easing:'cubic-bezier(.2,1.4,.3,1)',fill:'forwards'});
      pop(W/2,H*.46,{n:56,cols:['#fff','#FFD6E8','#FF6FA5'],shape:'heart',sp:8,size:5.4});sfx2('chime');
    },500);
    glow.style.transition='opacity .5s';setTimeout(()=>{glow.style.opacity='.8';},500);
    // 翅膀随后跟着后续弹跳小幅扇动（沿用各自的定位 transform，只改缩放）
    setTimeout(()=>{if(skip)return;
      const base=s=>['translate(-100%,-50%)','translate(0%,-50%)'][s];
      [wingL,wingR].forEach((wg,i)=>wg.animate([
        {transform:base(i)+' scale(1)'},
        {transform:base(i)+' scale(1.07,1.1)'},
        {transform:base(i)+' scale(.96,.93)'},
        {transform:base(i)+' scale(1.03,1.05)'},
        {transform:base(i)+' scale(1)'}
      ],{duration:1050,easing:'ease-in-out',fill:'forwards'}));
    },930);
    // 标题放到卡片上方，且等前两次大跳过去、卡片不再冲那么高之后再出现，
    // 否则卡片弹到最高点会撞上字（字 z-index 比卡片高，会盖住卡面）
    let w=null;
    setTimeout(()=>{if(skip)return;
      w=showWord('羽翼降临','cute');w.style.color='#B23A6E';w.style.top='13%';
    },1080);
    // 之后每次触地，标题跟着一起蹦
    [[1204,.5],[1435,.34],[1584,.22]].forEach(([t,pw])=>setTimeout(()=>{if(skip||!w)return;
      w.animate([
        {transform:'translate(-50%,-50%) scale(1) rotate(0)'},
        {transform:'translate(-50%,calc(-50% - '+(15*pw).toFixed(1)+'px)) scale('+(1+.1*pw).toFixed(3)+','+(1-.08*pw).toFixed(3)+') rotate('+(-3*pw).toFixed(1)+'deg)',offset:.35},
        {transform:'translate(-50%,calc(-50% + '+(5*pw).toFixed(1)+'px)) scale('+(1-.06*pw).toFixed(3)+','+(1+.06*pw).toFixed(3)+') rotate('+(2*pw).toFixed(1)+'deg)',offset:.68},
        {transform:'translate(-50%,-50%) scale(1) rotate(0)'}
      ],{duration:400,easing:'cubic-bezier(.34,1.56,.64,1)'});
    },t));
    await wait(1750);if(skip)return;
    if(w)w.animate([{opacity:1},{opacity:0}],{duration:350,fill:'forwards'});
    sky.animate([{opacity:1},{opacity:.7}],{duration:500,fill:'forwards'});
    wingL.animate([{opacity:.95},{opacity:.35}],{duration:600,fill:'forwards'});wingR.animate([{opacity:.95},{opacity:.35}],{duration:600,fill:'forwards'});
    await wait(300);if(skip)return;}

  /* 拓人 Takuto · 死神使者：满月升起 → 月蚀爬过 → 钻石环全食 → 一刀劈开 → 月轮碎裂，
     碎片先炸开、再反方向向卡片中心收拢汇聚（全文件唯一的"向内收束"揭示，跟其它所有卡的向外爆发相反） */
  async function playTakuto(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#5C7CE0';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    card.style.transition='none';card.style.transform='rotateY(0deg)';
    cardwrap.style.transition='none';cardwrap.style.opacity='0';cardwrap.style.transform='translateY(0) scale(1)';
    glow.style.opacity='0';
    const sky=tint('radial-gradient(circle at 50% 40%,#0f1638,#070a1c 55%,#020208)',1);sky.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    for(let i=0;i<30;i++)P.push({x:Math.random()*W,y:H+Math.random()*100,vx:(Math.random()-.5)*.3,vy:-(.3+Math.random()*.5),g:0,life:1,dec:.0018,size:.8+Math.random()*1.6,col:'#8CA6FF',rot:0,vr:0,shape:'c'});
    osc(140,90,2.6,'sine',.11,0,true);noiseHit(2.2,.07,0,120,40,true,true);
    // 幕一：夜色渐深，星尘自下而上升起
    barT.style.height='9%';barB.style.height='9%';
    await wait(450);if(skip)return;
    // 月轮 / 蚀影 / 钻石环 / 碎片汇聚，全部锚定在卡片将要出现的正中心，
    // 这样"劈开月轮 → 碎片聚成卡"才是同一个位置发生的一件事
    const moonR='min(30vw,158px)';
    const moon=document.createElement('div');moon.className='rwd-fx2';
    moon.style.cssText='top:74%;left:50%;width:'+moonR+';height:'+moonR+';border-radius:50%;transform:translate(-50%,-50%) scale(.3);opacity:0;background:radial-gradient(circle at 38% 34%,#eaf1ff,'+acc+' 60%,#2c3d80 100%);box-shadow:0 0 40px '+acc+',0 0 90px rgba(92,124,224,.5)';
    cine.appendChild(moon);
    moon.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.3)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:1200,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    moon.animate([{top:'74%'},{top:'50%'}],{duration:2600,easing:'ease-out',fill:'forwards'});
    sfx2('riseb');
    // 幕二：月轮升起时，周身浮现两层缓慢旋转的星轨符环
    await wait(500);if(skip)return;
    const halo=magicCircle('#5C7CE0','#cfe0ff');cine.appendChild(halo);
    halo.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.35) rotate(-40deg)'},{opacity:.75,transform:'translate(-50%,-50%) scale(1) rotate(0deg)'}],{duration:1500,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    const halo2=magicCircle('#2c3d80','#8CA6FF');halo2.querySelectorAll('text').forEach(t=>t.remove());cine.appendChild(halo2);
    halo2.animate([{opacity:0,transform:'translate(-50%,-50%) scale(1.5) rotate(30deg)'},{opacity:.5,transform:'translate(-50%,-50%) scale(1.28) rotate(0deg)'}],{duration:1500,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    // 星尘被月轮吸附，向中心缓缓汇聚
    const gather=setInterval(()=>{const a=Math.random()*6.283,rad=300+Math.random()*260;
      pop(W/2+Math.cos(a)*rad,H*.5+Math.sin(a)*rad,{n:1,dir:a+Math.PI,spread:.12,cols:['#cfe0ff','#8CA6FF','#fff'],shape:'c',sp:3.4,g:0,size:1.8,dec:.011});},55);
    skipRes.push(()=>clearInterval(gather));
    await wait(900);if(skip){clearInterval(gather);return;}
    sfx2('gong');shockwave('rgba(140,166,255,.4)',8,1100,2);
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),300);
    await wait(700);if(skip){clearInterval(gather);return;}
    // 幕三：月蚀阴影自左侧缓缓爬过月面，天地随之一寸寸暗下去
    const eclipse=document.createElement('div');eclipse.className='rwd-fx2';
    eclipse.style.cssText='top:50%;left:12%;width:'+moonR+';height:'+moonR+';border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 62% 66%,#1a0d10,#000 70%);box-shadow:0 0 30px rgba(0,0,0,.8)';
    cine.appendChild(eclipse);sfx2('poof');
    eclipse.animate([{left:'12%'},{left:'50%'}],{duration:1500,easing:'cubic-bezier(.45,0,.4,1)',fill:'forwards'});
    const dark=tint('radial-gradient(circle at 50% 50%,rgba(0,0,0,.2),rgba(0,0,0,.8) 70%)',4);
    dark.animate([{opacity:0},{opacity:1}],{duration:1500,easing:'ease-in',fill:'forwards'});
    halo.animate([{opacity:.75},{opacity:.3}],{duration:1500,fill:'forwards'});
    halo2.animate([{opacity:.5},{opacity:.16}],{duration:1500,fill:'forwards'});
    osc(200,70,1.5,'sine',.18,0,true);
    // 全食逼近时的三次心跳低频
    [0,520,980].forEach((t,i)=>setTimeout(()=>{if(skip)return;osc(60,42,.4,'sine',.3+i*.08,0);cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),180);},t+320));
    await wait(1440);if(skip){clearInterval(gather);return;}
    clearInterval(gather);
    // 幕四：完全食 —— 全场几乎全黑，只剩一圈钻石环，向外迸出日冕光针
    flash.style.transition='none';flash.style.background='radial-gradient(circle,rgba(0,0,0,0) 0%,rgba(0,0,0,.72) 60%)';flash.style.opacity='1';
    const ring=document.createElement('div');ring.className='rwd-fx2';
    ring.style.cssText='top:50%;left:50%;width:'+moonR+';height:'+moonR+';border-radius:50%;transform:translate(-50%,-50%) scale(.9);border:2px solid #cfe0ff;box-shadow:0 0 24px #cfe0ff,0 0 70px rgba(92,124,224,.9),inset 0 0 30px rgba(207,224,255,.5);opacity:0;z-index:7';
    cine.appendChild(ring);
    ring.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.9)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.06)'},{opacity:.9,transform:'translate(-50%,-50%) scale(1.02)'}],{duration:700,fill:'forwards'});
    // 钻石环上的那一点爆闪：做成环的子元素，落在圆周 45° 位置上，不会因为尺寸变化而跑位
    const spark=document.createElement('div');
    spark.style.cssText='position:absolute;top:14.6%;left:85.4%;width:18px;height:18px;border-radius:50%;transform:translate(-50%,-50%) scale(.3);background:#fff;box-shadow:0 0 26px #fff,0 0 60px #cfe0ff,0 0 120px #5C7CE0;opacity:0';
    ring.appendChild(spark);
    spark.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.3)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.6)'},{opacity:.9,transform:'translate(-50%,-50%) scale(1)'}],{duration:420,delay:180,fill:'forwards'});
    sfx2('chime');sparkle(7,1500,.15);
    for(let i=0;i<28;i++){const a=i/28*6.283;pop(W/2,H*.5,{n:1,dir:a,spread:.03,cols:['#cfe0ff','#fff'],shape:'r',sp:14,g:0,size:1.6,dec:.016});}
    cine.classList.add('rwd-shaking');setTimeout(()=>cine.classList.remove('rwd-shaking'),300);
    await wait(900);if(skip)return;
    ring.animate([{opacity:.9},{opacity:0}],{duration:300,fill:'forwards'});
    spark.animate([{opacity:.85},{opacity:0}],{duration:300,fill:'forwards'});
    dark.animate([{opacity:1},{opacity:.5}],{duration:400,fill:'forwards'});
    flash.style.transition='opacity .3s';flash.style.opacity='0';
    // 幕五：一刀自上而下劈开月轮
    const blade=document.createElement('div');blade.className='rwd-fx2';
    blade.style.cssText='top:8%;left:50%;width:3px;height:84%;z-index:6;background:linear-gradient(180deg,transparent,#cfe0ff,#fff,#cfe0ff,transparent);filter:blur(.4px) drop-shadow(0 0 16px #cfe0ff);transform:translateX(-50%) scaleY(.2);opacity:0';
    cine.appendChild(blade);
    sfx2('draw');noiseHit(.3,.2,0,3400,700,true);
    blade.animate([{opacity:0,transform:'translateX(-50%) scaleY(.2)'},{opacity:1,transform:'translateX(-50%) scaleY(1)'},{opacity:0,transform:'translateX(-50%) scaleY(1)'}],{duration:340,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards'});
    boom();sfx2('clang');cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),560);
    shockwave('rgba(207,224,255,.85)',12,760,4);setTimeout(()=>shockwave('rgba(92,124,224,.7)',16,940,3),120);
    // 月轮被劈成左右两半，向两侧滑开坠落
    // 注意 transform 顺序：位移写进 translate 里、rotate 放最后，
    // 否则旋转会把后面的位移方向一起转掉，碎片就会朝奇怪的角度飞出去
    [-1,1].forEach(s=>{const half=document.createElement('div');half.className='rwd-fx2';
      half.style.cssText='top:50%;left:50%;width:'+moonR+';height:'+moonR+';border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 38% 34%,#eaf1ff,'+acc+' 60%,#2c3d80 100%);box-shadow:0 0 30px '+acc+';clip-path:inset(0 '+(s<0?'50% 0 0':'0 0 50%')+');z-index:5';
      cine.appendChild(half);
      half.animate([
        {transform:'translate(-50%,-50%) rotate(0deg)',opacity:1},
        {transform:'translate(calc(-50% + '+(s*7)+'vw),-50%) rotate('+(s*10)+'deg)',opacity:1,offset:.28},
        {transform:'translate(calc(-50% + '+(s*30)+'vw),calc(-50% + 34vh)) rotate('+(s*42)+'deg)',opacity:0}
      ],{duration:900,easing:'cubic-bezier(.3,.05,.7,1)',fill:'forwards'});});
    moon.animate([{opacity:1},{opacity:0}],{duration:180,fill:'forwards'});
    eclipse.animate([{opacity:1},{opacity:0}],{duration:180,fill:'forwards'});
    halo.animate([{opacity:.3},{opacity:0}],{duration:400,fill:'forwards'});
    halo2.animate([{opacity:.16},{opacity:0}],{duration:400,fill:'forwards'});
    pop(W/2,H*.5,{n:90,cols:['#cfe0ff','#5C7CE0','#1c2c66','#fff'],shape:'r',sp:12,size:2.8,g:.1,dec:.012});
    await wait(420);if(skip)return;
    // 幕六：碎片反向收拢，在中心聚成卡（全文件唯一的"向内收束"揭示）
    const kj=kanjiSlam('蚀',acc);kj.style.textShadow='0 0 20px #5C7CE0,0 0 60px #3E58B8,0 4px 18px rgba(0,0,0,.5)';
    const converge=setInterval(()=>{const a=Math.random()*6.283,rad=220+Math.random()*260;pop(W/2+Math.cos(a)*rad,H*.5+Math.sin(a)*rad,{n:3,dir:a+Math.PI,spread:.07,cols:['#cfe0ff','#5C7CE0','#fff'],shape:'r',sp:12,g:0,size:2.4,dec:.018});},22);
    skipRes.push(()=>clearInterval(converge));
    osc(90,1200,.9,'sine',.07,0,true);
    await wait(760);if(skip){clearInterval(converge);return;}
    clearInterval(converge);
    // 「蚀」字必须在卡片露出之前散掉，否则会盖在卡面上
    kj.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.18)'}],{duration:300,fill:'forwards'});
    flash.style.transition='none';flash.style.background='radial-gradient(circle,#eaf1ff,#5C7CE0 42%,transparent 72%)';flash.style.opacity='.95';await raf();flash.style.transition='opacity .7s';flash.style.opacity='0';
    dark.animate([{opacity:.5},{opacity:0}],{duration:500,fill:'forwards'});   // 暗幕在卡片之上，揭卡前必须完全散去
    cardwrap.style.transition='opacity .16s linear';showCard();cardwrap.style.opacity='1';
    glow.style.transition='opacity .5s';glow.style.opacity='.9';
    shine.style.transition='transform .8s ease-out';shine.style.transform='translateX(130%)';
    sfx2('chime');chordSSR();
    cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),520);
    pop(W/2,H*.5,{n:70,cols:['#cfe0ff','#5C7CE0','#fff'],shape:'star',sp:7,size:3.4,g:.04});
    stormRar='s';storm=90;
    sky.animate([{opacity:1},{opacity:.6}],{duration:500,fill:'forwards'});
    await wait(950);if(skip)return;}

  /* ===== 英雄联盟 · 野兽三兽 =====
     共同点：卡片一开始就在场，只是被一层「幕」挡着；三只野兽用三种不同的方式把这层幕破坏掉。
     这是本文件里唯一一组「先挡住、再破坏挡板露出卡」的揭示方式，跟其它卡的淡入/翻面/收束都不同。 */
  function growl(dur,peak){const a=ac();if(!a)return;const now=a.currentTime;
    [46,58,71].forEach((f,i)=>{const o=a.createOscillator(),g2=a.createGain();o.type='sawtooth';
      o.frequency.setValueAtTime(f*1.25,now);o.frequency.exponentialRampToValueAtTime(f*.72,now+dur);
      const lfo=a.createOscillator(),lg=a.createGain();lfo.type='sine';lfo.frequency.value=17+i*6;lg.gain.value=f*.22;
      lfo.connect(lg).connect(o.frequency);lfo.start(now);lfo.stop(now+dur+.1);
      env(g2,now,.05,(peak||.3)*(1-i*.22),dur);o.connect(g2).connect(DEST);g2.connect(REV);o.start(now);o.stop(now+dur+.1);});
    noiseHit(dur*.8,.16,0,420,110,true,true);}
  function beastEyes(color,topPct,gap){const wrap=document.createElement('div');wrap.className='rwd-fx2';
    wrap.style.cssText='top:'+topPct+'%;left:50%;transform:translate(-50%,-50%);z-index:5;display:flex;gap:'+(gap||54)+'px;opacity:0';
    [-1,1].forEach(s=>{const e=document.createElement('div');
      e.style.cssText='width:46px;height:19px;border-radius:50%;background:radial-gradient(circle at 50% 45%,#fff,'+color+' 52%,#280000 100%);'
        +'box-shadow:0 0 18px '+color+',0 0 48px '+color+';transform:rotate('+(s*-9)+'deg)';
      wrap.appendChild(e);});
    cine.appendChild(wrap);return wrap;}
  // 三道平行爪痕
  function clawSet(color,baseAng,delay,spread){const marks=[];
    for(let i=0;i<3;i++){const d=document.createElement('div');d.className='rwd-fx2';
      const off=(i-1)*(spread||13);
      d.style.cssText='top:'+(50+off)+'%;left:50%;width:190vmax;height:'+(9-i*1.6)+'px;z-index:7;transform-origin:center;'
        +'transform:translate(-50%,-50%) rotate('+baseAng+'deg) scaleX(0);opacity:0;'
        +'background:linear-gradient(90deg,transparent 2%,'+color+' 16%,#fff 50%,'+color+' 84%,transparent 98%);'
        +'filter:blur(.5px) drop-shadow(0 0 16px '+color+')';
      cine.appendChild(d);marks.push(d);
      setTimeout(()=>{d.animate([
        {transform:'translate(-50%,-50%) rotate('+baseAng+'deg) scaleX(0)',opacity:1},
        {transform:'translate(-50%,-50%) rotate('+baseAng+'deg) scaleX(1)',opacity:1,offset:.45},
        {transform:'translate(-50%,-50%) rotate('+baseAng+'deg) scaleX(1)',opacity:0}
      ],{duration:520,easing:'cubic-bezier(.1,.9,.2,1)',fill:'forwards'});},delay+i*45);}
    return marks;}
  /* 分叉闪电：主干抖动下劈，沿途随机分出多级支链，
     三层叠画（外层大范围辉光 / 中层色芯 / 内层白热核），比单根折线厚重得多 */
  function boltPath(x0,y0,x1,y1,jag,segs){
    let d='M'+x0.toFixed(1)+' '+y0.toFixed(1),px=x0,py=y0;
    for(let i=1;i<=segs;i++){const p=i/segs;
      const nx=x0+(x1-x0)*p+(Math.random()-.5)*jag*(1-p*.35);
      const ny=y0+(y1-y0)*p;
      d+=' L'+nx.toFixed(1)+' '+ny.toFixed(1);px=nx;py=ny;}
    return {d:d,ex:px,ey:py};}
  function forkedBolt(color,leftPct,widthVmax,intensity){
    const W0=100,H0=300,paths=[];
    const main=boltPath(50,0,50+(Math.random()-.5)*22,H0,26,9);
    paths.push({d:main.d,w:1});
    // 一级分叉
    const forks=3+((Math.random()*2)|0);
    for(let f=0;f<forks;f++){
      const t=.22+Math.random()*.6, sy=t*H0, sx=50+(Math.random()-.5)*20;
      const br=boltPath(sx,sy,sx+(Math.random()<.5?-1:1)*(20+Math.random()*26),sy+40+Math.random()*70,15,4);
      paths.push({d:br.d,w:.55});
      // 二级分叉
      if(Math.random()<.6){const b2=boltPath(br.ex,br.ey,br.ex+(Math.random()-.5)*26,br.ey+22+Math.random()*34,9,3);
        paths.push({d:b2.d,w:.3});}
    }
    const layer=(sw,col,op,blur)=>paths.map(p=>'<path d="'+p.d+'" fill="none" stroke="'+col+'" stroke-width="'+(sw*p.w).toFixed(2)
      +'" stroke-linecap="round" stroke-linejoin="round" opacity="'+op+'"'+(blur?' style="filter:blur('+blur+'px)"':'')+'/>').join('');
    return svgEl('<svg class="rwd-fx2" viewBox="0 0 '+W0+' '+H0+'" preserveAspectRatio="none" '
      +'style="top:0;left:'+leftPct+'%;width:'+(widthVmax||34)+'vmax;height:100%;transform:translateX(-50%);z-index:7;opacity:0">'
      +layer(16,color,.30*(intensity||1),7)
      +layer(7,color,.75*(intensity||1),2)
      +layer(2.6,'#ffffff',1,0)
      +'</svg>');}
  function boltSVG(color,leftPct){return forkedBolt(color,leftPct,30,1);}

  /* —— LoL 专用视觉语言：地面技能指示圈 / 六边形锁定 / 升级金环 / 播报横幅 —— */
  // 地面技能指示圈：带透视压平铺在卡片脚下，这是 LoL 辨识度最高的一个视觉
  function groundRune(color,color2){color2=color2||color;
    let ticks='';for(let i=0;i<48;i++){const a=i/48*360,rad=a*Math.PI/180,r1=i%4?176:168,r2=190;
      ticks+='<line x1="'+(200+Math.cos(rad)*r1).toFixed(1)+'" y1="'+(200+Math.sin(rad)*r1).toFixed(1)
        +'" x2="'+(200+Math.cos(rad)*r2).toFixed(1)+'" y2="'+(200+Math.sin(rad)*r2).toFixed(1)
        +'" stroke="'+color+'" stroke-width="'+(i%4?1.4:2.6)+'" opacity="'+(i%4?.55:.95)+'"/>';}
    let dash='';for(let i=0;i<12;i++){const a=i/12*360;
      dash+='<path d="M200 200 m0 -128 a128 128 0 0 1 0 0" transform="rotate('+a+' 200 200)" stroke="'+color2+'" stroke-width="3" fill="none" opacity=".5"/>';}
    const d=document.createElement('div');d.className='rwd-fx2';
    // 起手 z=7 压在幕布之上（否则整段蓄力都被幕挡住看不见），
    // 等幕被破坏、卡片露出时再调回 z=2 沉到卡片脚下
    d.style.cssText='top:66%;left:50%;width:min(86vw,520px);aspect-ratio:1;z-index:7;opacity:0;'
      +'transform:translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(.55);'
      +'filter:drop-shadow(0 0 14px '+color+')';
    d.innerHTML='<svg viewBox="0 0 400 400" style="width:100%;height:100%;overflow:visible">'
      +'<circle cx="200" cy="200" r="192" fill="none" stroke="'+color+'" stroke-width="2.4" opacity=".85"/>'
      +'<circle cx="200" cy="200" r="150" fill="none" stroke="'+color2+'" stroke-width="1.6" opacity=".6" stroke-dasharray="14 9"/>'
      +'<circle cx="200" cy="200" r="112" fill="none" stroke="'+color+'" stroke-width="1.2" opacity=".45"/>'
      +'<circle cx="200" cy="200" r="192" fill="'+color+'" opacity=".07"/>'
      +ticks+dash+'</svg>';
    cine.appendChild(d);return d;}
  // 升级金环：LoL 升级时脚下炸开的那一圈
  function levelRing(color){const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:62%;left:50%;width:min(70vw,420px);aspect-ratio:1;z-index:3;opacity:0;'
      +'transform:translate(-50%,-50%) perspective(520px) rotateX(72deg) scale(.3);'
      +'border-radius:50%;border:5px solid '+color+';box-shadow:0 0 30px '+color+',inset 0 0 40px '+color;
    cine.appendChild(d);
    d.animate([{opacity:0,transform:'translate(-50%,-50%) perspective(520px) rotateX(72deg) scale(.3)'},
      {opacity:1,transform:'translate(-50%,-50%) perspective(520px) rotateX(72deg) scale(1)',offset:.5},
      {opacity:0,transform:'translate(-50%,-50%) perspective(520px) rotateX(72deg) scale(1.5)'}],
      {duration:900,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    return d;}
  // 播报横幅：仿 LoL 击杀播报那条带斜切的深色条 + 烫金字
  function lolBanner(text,color){const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:21%;left:50%;transform:translate(-50%,-50%);z-index:9;opacity:0;padding:11px 46px;white-space:nowrap;'
      +'background:linear-gradient(90deg,rgba(6,8,14,0),rgba(6,8,14,.94) 12%,rgba(6,8,14,.94) 88%,rgba(6,8,14,0));'
      +'clip-path:polygon(3% 0,97% 0,100% 50%,97% 100%,3% 100%,0 50%);'
      +'border-top:1px solid '+color+';border-bottom:1px solid '+color;
    d.innerHTML='<div style="font:700 clamp(19px,5vw,40px)/1 \'Songti SC\',\'STSong\',\'Noto Serif SC\',serif;letter-spacing:.24em;text-indent:.24em;'
      +'background:linear-gradient(180deg,#F8ECCB 8%,'+color+' 55%,#7A5C22 98%);-webkit-background-clip:text;background-clip:text;color:transparent;'
      +'filter:drop-shadow(0 2px 3px rgba(0,0,0,.9))">'+text+'</div>';
    cine.appendChild(d);
    d.animate([{opacity:0,transform:'translate(-50%,-50%) scaleX(.55)'},
      {opacity:1,transform:'translate(-50%,-50%) scaleX(1)'}],{duration:380,easing:'cubic-bezier(.15,1.4,.3,1)',fill:'forwards'});
    return d;}
  function riftBg(){return tint('radial-gradient(ellipse at 50% 108%,#12331f 0%,#0a1a14 34%,#050a10 62%,#02040a 100%)',1);}
  /* 雷暴中的巨兽剪影：平时黑得看不见，只在闪电打下来的一瞬间被背光勾出轮廓 */
  function beastSilhouette(color){
    /* 剪影用几块叠起来的形体拼（身躯/驼峰/头/吻/耳/角），
       比描一条外轮廓好认得多——一条曲线画出来只会是个钟形罩子 */
    const d=document.createElement('div');d.className='rwd-fx2';
    // 压到横幅下方，底部用遮罩化进黑暗里，免得身子被切出一条硬边
    d.style.cssText='top:26%;left:50%;transform:translateX(-50%);width:min(108vw,720px);height:54%;z-index:2;opacity:0;'
      +'-webkit-mask-image:linear-gradient(180deg,#000 58%,transparent 94%);mask-image:linear-gradient(180deg,#000 58%,transparent 94%)';
    d.innerHTML='<svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet" style="width:100%;height:100%">'
      /* 只用一层很窄的外发光勾边：13px 的大发光会把轮廓糊成一团雾；
         而给每块形体描边会把头/吻/驼峰的接缝全画出来，变成拼贴的玩具熊。
         实心填充 + 紧贴的辉光，整体才是一个不透光的黑影 */
      +'<g fill="#020106" style="filter:drop-shadow(0 0 5px '+color+') drop-shadow(0 0 2px '+color+')">'
        +'<path d="M12 120 C 16 86, 34 64, 62 58 L138 58 C 166 64, 184 86, 188 120 Z"/>'   // 厚实的肩背
        +'<ellipse cx="100" cy="64" rx="52" ry="17"/>'                                      // 驼峰
        +'<ellipse cx="100" cy="44" rx="29" ry="20"/>'                                      // 头：宽而扁
        +'<ellipse cx="100" cy="56" rx="15" ry="10"/>'                                      // 吻部
        +'<circle cx="79" cy="30" r="7.5"/><circle cx="121" cy="30" r="7.5"/>'              // 圆耳，熊最好认的特征
      +'</g>'
      +'<ellipse cx="90" cy="42" rx="4.8" ry="2.1" transform="rotate(-13 90 42)" fill="#fff" opacity=".95" style="filter:drop-shadow(0 0 9px '+color+')"/>'
      +'<ellipse cx="110" cy="42" rx="4.8" ry="2.1" transform="rotate(13 110 42)" fill="#fff" opacity=".95" style="filter:drop-shadow(0 0 9px '+color+')"/>'
      +'</svg>';
    cine.appendChild(d);return d;}
  // 爬电弧：在卡片四周乱窜的细电流，落地之后还在噼啪响
  function arcCrawl(color,n){const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:50%;left:50%;width:min(78vw,360px);height:min(104vh,470px);z-index:4;opacity:0;transform:translate(-50%,-50%)';
    let p='';for(let i=0;i<(n||7);i++){
      const side=i%2?1:-1,y0=14+Math.random()*72;
      const b=boltPath(50+side*46,y0,50+side*(16+Math.random()*22),y0+(Math.random()-.5)*36,11,4);
      p+='<path d="'+b.d+'" fill="none" stroke="'+color+'" stroke-width="1.6" stroke-linecap="round" opacity=".9"'
        +' style="filter:drop-shadow(0 0 5px '+color+');animation:rwd-arc .9s steps(1,end) '+(i*110)+'ms infinite"/>';}
    d.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible">'+p+'</svg>';
    cine.appendChild(d);return d;}

  /* —— 三只各自的舞台构件 —— */
  // 放射速度线：向中心收拢，配合"从纵深扑来"
  function speedLines(color,n){const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='inset:0;z-index:8;opacity:0';
    let s='';for(let i=0;i<(n||34);i++){const a=i/(n||34)*360,len=14+Math.random()*26;
      s+='<line x1="50" y1="50" x2="'+(50+Math.cos(a*Math.PI/180)*len).toFixed(1)+'" y2="'+(50+Math.sin(a*Math.PI/180)*len).toFixed(1)
        +'" stroke="'+color+'" stroke-width="'+(.35+Math.random()*.7).toFixed(2)+'" opacity="'+(.4+Math.random()*.6).toFixed(2)+'"/>';}
    d.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">'+s+'</svg>';
    cine.appendChild(d);return d;}
  // 地裂：从落点向外炸开的裂纹，压在地面透视上
  function crackSVG(color){let p='';
    for(let i=0;i<11;i++){const a=i/11*360+Math.random()*16,rad=a*Math.PI/180;
      let d='M200 200',x=200,y=200;
      for(let k=1;k<=4;k++){const r=k*46+Math.random()*22;
        x=200+Math.cos(rad+(Math.random()-.5)*.34)*r;y=200+Math.sin(rad+(Math.random()-.5)*.34)*r;
        d+=' L'+x.toFixed(1)+' '+y.toFixed(1);}
      p+='<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="'+(3.4-i%3).toFixed(1)+'" stroke-linecap="round" opacity=".9"/>';}
    const el=document.createElement('div');el.className='rwd-fx2';
    el.style.cssText='top:70%;left:50%;width:min(96vw,600px);aspect-ratio:1;z-index:3;opacity:0;'
      +'transform:translate(-50%,-50%) perspective(520px) rotateX(74deg) scale(.4);filter:drop-shadow(0 0 12px '+color+')';
    el.innerHTML='<svg viewBox="0 0 400 400" style="width:100%;height:100%;overflow:visible">'+p+'</svg>';
    cine.appendChild(el);return el;}
  /* 血迹追踪：一条蜿蜒的曲线，用 stroke-dashoffset 让虚线段持续朝卡片方向流动，
     外层粗描边做血雾辉光、内层细亮线做流动感，末端一颗脉动的标记点。
     取代原来那条直挺挺的渐变色条 */
  /* 血迹追踪：不是一条虚线，而是一路滴下来的血。
     沿着曲线撒血泊——每滩都是不规则的椭圆 + 被拖出来的尾巴 + 周围的溅射点，
     越靠近卡片血越新越大，按次序一滩一滩地落下，读起来才像"顺着血追过来" */
  function scentTrail(color,glow){
    const d1='M-40 250 C 120 170, 200 320, 340 236 S 560 150, 700 214';
    // 两段三次贝塞尔（第二段是 S 的展开），自己算点，不依赖 getPointAtLength
    const segs=[[[-40,250],[120,170],[200,320],[340,236]],[[340,236],[480,152],[560,150],[700,214]]];
    const cub=(p,t)=>{const u=1-t,a=u*u*u,b=3*u*u*t,c=3*u*t*t,e=t*t*t;
      return [a*p[0][0]+b*p[1][0]+c*p[2][0]+e*p[3][0],a*p[0][1]+b*p[1][1]+c*p[2][1]+e*p[3][1]];};
    const tanA=(p,t)=>{const u=1-t,a=3*u*u,b=6*u*t,c=3*t*t;
      return Math.atan2(a*(p[1][1]-p[0][1])+b*(p[2][1]-p[1][1])+c*(p[3][1]-p[2][1]),
                        a*(p[1][0]-p[0][0])+b*(p[2][0]-p[1][0])+c*(p[3][0]-p[2][0]))*180/Math.PI;};
    const at=s=>{const i=s<.5?0:1,t=s<.5?s*2:(s-.5)*2;return{p:cub(segs[i],t),a:tanA(segs[i],t)};};
    // 定死的伪随机：血迹形状每次一样，不会某一次抽出个难看的
    let sd=20250812;const rnd=()=>{sd=(sd*1103515245+12345)&0x7fffffff;return sd/0x7fffffff;};
    // 不规则血泊：极坐标上取点再抖动，边缘坑坑洼洼，不是干净的椭圆
    const blob=(rx,ry)=>{const n=11;let d='';
      for(let i=0;i<n;i++){const a=i/n*6.283,w=.62+rnd()*.62;
        const x=Math.cos(a)*rx*w,y=Math.sin(a)*ry*w;
        d+=(i?' L':'M')+x.toFixed(1)+' '+y.toFixed(1);}
      return d+' Z';};
    const N=15;let blots='';
    for(let i=0;i<N;i++){
      const s=.03+i/(N-1)*.95,q=at(s),k=.55+s*.7;               // k：越往前血越新越大
      const rx=(3.8+rnd()*3.8)*k,ry=(2.4+rnd()*2.4)*k;
      // 深色的血底 + 中心稍亮的一点，看着是湿的而不是一块红塑料
      let g='<path d="'+blob(rx*1.12,ry*1.12)+'" fill="'+glow+'" opacity=".82"/>'
        +'<path d="'+blob(rx*.62,ry*.62)+'" fill="'+color+'" opacity=".62"/>'
        // 拖尾：血滴落地后往后甩出去的那一道，细而尖
        +'<path d="M'+(rx*.3).toFixed(1)+' 0 L-'+(rx*3.2).toFixed(1)+' '+(ry*.3).toFixed(1)
        +' Q-'+(rx*3.9).toFixed(1)+' 0 -'+(rx*3).toFixed(1)+' -'+(ry*.34).toFixed(1)+' Z" fill="'+glow+'" opacity=".4"/>';
      const sp=3+((rnd()*4)|0);
      for(let j=0;j<sp;j++){const ang=rnd()*6.283,dd=rx*(1.6+rnd()*3.4);
        g+='<circle cx="'+(Math.cos(ang)*dd).toFixed(1)+'" cy="'+(Math.sin(ang)*dd*.5).toFixed(1)
          +'" r="'+(.45+rnd()*1).toFixed(1)+'" fill="'+(rnd()<.45?color:glow)+'" opacity="'+(.35+rnd()*.35).toFixed(2)+'"/>';}
      blots+='<g transform="translate('+q.p[0].toFixed(1)+','+q.p[1].toFixed(1)+') rotate('+q.a.toFixed(1)+')">'
        +'<g class="rwd-blot" style="animation-delay:'+(i*58)+'ms">'+g+'</g></g>';
    }
    const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:0;left:0;right:0;bottom:0;z-index:6;opacity:0';
    d.innerHTML='<svg viewBox="0 0 700 460" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;overflow:visible">'
      +'<defs><filter id="stG" x="-40%" y="-40%" width="180%" height="180%">'
        +'<feGaussianBlur stdDeviation="9"/></filter></defs>'
      // 底下一层很淡的暗红晕，让血迹陷进地面里而不是浮在上面
      +'<path d="'+d1+'" fill="none" stroke="'+glow+'" stroke-width="26" opacity=".16" filter="url(#stG)"/>'
      +blots+'</svg>';
    cine.appendChild(d);return d;}
  /* 矩形线性技能指示器（沃里克的冲锋路径）
     原来是一整块红 + 一排垂直刻度，压平之后就成了一条粗红斜纹带子，很廉价。
     改成 LoL 里真正的样子：几乎透明的通道、只留细边框，纵深方向由暗到亮，
     末端三个渐亮的箭头指着卡片，再有一道白光顺着通道往前扫 */
  function runeLine(color){const d=document.createElement('div');d.className='rwd-fx2';
    const u='rl'+((Math.random()*1e6)|0);
    d.style.cssText='top:63%;left:50%;width:min(150vw,900px);height:min(26vw,164px);z-index:7;opacity:0;'
      +'transform:translate(-50%,-50%) perspective(560px) rotateX(70deg);filter:drop-shadow(0 0 9px '+color+')';
    let chev='';for(let i=0;i<3;i++){const x=79+i*6.5;
      chev+='<path d="M'+x+' 10 L'+(x+5)+' 20 L'+x+' 30" fill="none" stroke="'+color+'" stroke-width="2.2"'
        +' stroke-linecap="round" stroke-linejoin="round" opacity="'+(.42+i*.28)+'" vector-effect="non-scaling-stroke"/>';}
    let rails='';for(let i=1;i<4;i++){rails+='<line x1="0" y1="'+(i*10)+'" x2="100" y2="'+(i*10)
      +'" stroke="'+color+'" stroke-width=".7" opacity=".14" vector-effect="non-scaling-stroke"/>';}
    d.innerHTML='<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="width:100%;height:100%;overflow:hidden">'
      +'<defs><linearGradient id="'+u+'" x1="0" x2="1">'
        +'<stop offset="0" stop-color="'+color+'" stop-opacity=".02"/>'
        +'<stop offset=".6" stop-color="'+color+'" stop-opacity=".13"/>'
        +'<stop offset="1" stop-color="'+color+'" stop-opacity=".3"/></linearGradient>'
      +'<linearGradient id="'+u+'s" x1="0" x2="1">'
        +'<stop offset="0" stop-color="#fff" stop-opacity="0"/>'
        +'<stop offset=".5" stop-color="#fff" stop-opacity=".24"/>'
        +'<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
      +'<rect width="100" height="40" fill="url(#'+u+')"/>'+rails
      +'<line x1="0" y1="0" x2="100" y2="0" stroke="'+color+'" stroke-width="1.3" vector-effect="non-scaling-stroke"/>'
      +'<line x1="0" y1="40" x2="100" y2="40" stroke="'+color+'" stroke-width="1.3" vector-effect="non-scaling-stroke"/>'
      +'<line x1="100" y1="0" x2="100" y2="40" stroke="'+color+'" stroke-width="1.3" opacity=".8" vector-effect="non-scaling-stroke"/>'
      +chev
      +'<rect width="24" height="40" fill="url(#'+u+'s)" style="animation:rwd-lane 1.2s linear infinite"/>'
      +'</svg>';
    cine.appendChild(d);return d;}
  /* 猎杀标记：细金线的瞄准环——外圈刻度、两段反向自转的弧、四角内收的括弧、中心十字，
     全部走细线不填色，比原来那块半透明扇形克制也精致得多 */
  function hunterMark(color){
    let ticks='';for(let i=0;i<60;i++){const a=i/60*360,rad=a*Math.PI/180,big=i%5===0,r1=big?150:158,r2=166;
      ticks+='<line x1="'+(200+Math.cos(rad)*r1).toFixed(1)+'" y1="'+(200+Math.sin(rad)*r1).toFixed(1)
        +'" x2="'+(200+Math.cos(rad)*r2).toFixed(1)+'" y2="'+(200+Math.sin(rad)*r2).toFixed(1)
        +'" stroke="'+color+'" stroke-width="'+(big?1.8:.9)+'" opacity="'+(big?.95:.5)+'"/>';}
    const arc=(r,a0,a1,w,op)=>{const p=(a)=>[200+Math.cos(a*Math.PI/180)*r,200+Math.sin(a*Math.PI/180)*r];
      const s=p(a0),e=p(a1);return '<path d="M'+s[0].toFixed(1)+' '+s[1].toFixed(1)+' A'+r+' '+r+' 0 '+((a1-a0)>180?1:0)+' 1 '+e[0].toFixed(1)+' '+e[1].toFixed(1)
        +'" fill="none" stroke="'+color+'" stroke-width="'+w+'" opacity="'+op+'" stroke-linecap="round"/>';};
    const brk=(cx,cy,sx,sy)=>'<path d="M'+(cx+28*sx)+' '+cy+' L'+cx+' '+cy+' L'+cx+' '+(cy+28*sy)+'" fill="none" stroke="'+color+'" stroke-width="3.4" stroke-linecap="square"/>';
    const d=document.createElement('div');d.className='rwd-fx2';
    d.style.cssText='top:50%;left:50%;width:min(76vw,392px);aspect-ratio:1;z-index:7;opacity:0;'
      +'transform:translate(-50%,-50%) scale(1.6);filter:drop-shadow(0 0 9px '+color+')';
    d.innerHTML='<svg viewBox="0 0 400 400" style="width:100%;height:100%;overflow:visible">'
      +'<g class="hm-spin" style="transform-box:fill-box;transform-origin:center;animation:rwd-spin 14s linear infinite">'+ticks+'</g>'
      +'<g class="hm-a" style="transform-box:fill-box;transform-origin:center;animation:rwd-spin 6s linear infinite">'
        +arc(128,-64,64,3.2,.95)+arc(128,116,244,3.2,.95)+'</g>'
      +'<g class="hm-b" style="transform-box:fill-box;transform-origin:center;animation:rwd-spin 9s linear infinite reverse">'
        +arc(104,30,130,1.8,.6)+arc(104,210,310,1.8,.6)+'</g>'
      +'<g class="hm-c">'+brk(44,44,1,1)+brk(356,44,-1,1)+brk(44,356,1,-1)+brk(356,356,-1,-1)+'</g>'
      +'<line x1="200" y1="176" x2="200" y2="196" stroke="'+color+'" stroke-width="2"/>'
      +'<line x1="200" y1="204" x2="200" y2="224" stroke="'+color+'" stroke-width="2"/>'
      +'<line x1="176" y1="200" x2="196" y2="200" stroke="'+color+'" stroke-width="2"/>'
      +'<line x1="204" y1="200" x2="224" y2="200" stroke="'+color+'" stroke-width="2"/>'
      +'<circle cx="200" cy="200" r="3" fill="'+color+'"/></svg>';
    cine.appendChild(d);return d;}

  /* 雷恩加尔 · Z 轴：猎人视界里三次瞬闪逼近，最后从纵深扑向镜头 */
  async function playRengar(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#E8C24A';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    card.style.transition='none';card.style.transform='rotateY(0deg)';
    cardwrap.style.transition='none';cardwrap.style.opacity='0';cardwrap.style.transform='translateY(0) scale(.12)';
    glow.style.opacity='0';shine.style.transition='none';shine.style.transform='translateX(-130%)';
    const sky=riftBg();sky.animate([{opacity:0},{opacity:1}],{duration:450,fill:'forwards'});
    // 猎人视界：整个画面褪色压暗
    const vision=tint('radial-gradient(ellipse at 50% 50%,rgba(20,40,30,.25),rgba(0,0,0,.88) 72%)',4);
    vision.style.backdropFilter='saturate(.35) contrast(1.15)';vision.style.webkitBackdropFilter='saturate(.35) contrast(1.15)';
    vision.animate([{opacity:0},{opacity:1}],{duration:600,fill:'forwards'});
    barT.style.height='11%';barB.style.height='11%';
    osc(70,52,2.4,'sine',.14,0,true);noiseHit(2.2,.06,0,300,90,true,true);
    // 前景草丛剪影，左右插入形成景深
    [-1,1].forEach(s=>{const b=document.createElement('div');b.className='rwd-fx2';
      b.style.cssText='bottom:-6%;'+(s<0?'left:-4%':'right:-4%')+';width:44%;height:46%;z-index:8;opacity:0;'
        +'background:radial-gradient(ellipse at 50% 100%,#0a1d14 38%,transparent 72%);filter:blur(2px)';
      cine.appendChild(b);
      b.animate([{opacity:0,transform:'translateY(26%)'},{opacity:1,transform:'translateY(0)'}],{duration:620,easing:'ease-out',fill:'forwards'});});
    await wait(560);if(skip)return;
    // 三次瞬闪逼近：一团扭曲在不同位置闪现，一次比一次近、一次比一次响
    for(let i=0;i<3;i++){
      const px=[18,76,50][i],py=[40,44,48][i],sz=[16,22,30][i];
      const sh=document.createElement('div');sh.className='rwd-fx2';
      sh.style.cssText='top:'+py+'%;left:'+px+'%;width:'+sz+'vmax;height:'+(sz*1.15)+'vmax;z-index:9;border-radius:50%;'
        +'transform:translate(-50%,-50%);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);'
        +'background:radial-gradient(circle,rgba(232,194,74,.14),transparent 68%);opacity:0';
      cine.appendChild(sh);
      sh.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.7)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.35},
        {opacity:0,transform:'translate(-50%,-50%) scale(1.25)'}],{duration:380,fill:'forwards'});
      whoosh(.26,700+i*500,180,.16+i*.06);sfx2('tick');
      await wait(290);if(skip)return;
    }
    // —— 对视：眼睛慢慢亮起，停住，眨一次，瞳孔收紧，全程约 1.9 秒 ——
    const eyes=beastEyes('#E8C24A',47,56);
    eyes.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.45)'},
      {opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:620,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    growl(1.5,.3);
    // 猎杀标记同时从外圈收拢并锁定
    const mark=hunterMark('#E8C24A');
    mark.animate([{opacity:0,transform:'translate(-50%,-50%) scale(1.6) rotate(-10deg)'},
      {opacity:.95,transform:'translate(-50%,-50%) scale(1) rotate(0deg)'}],{duration:700,easing:'cubic-bezier(.2,.9,.25,1)',fill:'forwards'});
    sfx2('tick');setTimeout(()=>sfx2('tick'),220);setTimeout(()=>sfx2('tick'),400);
    await wait(760);if(skip)return;
    // 停住对视（瞳孔轻微呼吸）
    eyes.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.045)'},
      {transform:'translate(-50%,-50%) scale(1)'}],{duration:900,easing:'ease-in-out'});
    await wait(560);if(skip)return;
    // 眨一次
    eyes.animate([{opacity:1},{opacity:.06,offset:.5},{opacity:1}],{duration:190});
    await wait(330);if(skip)return;
    // 瞳孔收紧 —— 要扑了
    eyes.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(.88,.62)'}],{duration:230,easing:'ease-in',fill:'forwards'});
    mark.animate([{opacity:.95,transform:'translate(-50%,-50%) scale(1)'},{opacity:1,transform:'translate(-50%,-50%) scale(.9)'}],{duration:230,easing:'ease-in',fill:'forwards'});
    osc(320,90,.3,'sawtooth',.16,0,true);
    await wait(300);if(skip)return;
    // 扑击：速度线收拢 + 卡片从纵深冲到镜头前
    eyes.animate([{opacity:1,transform:'translate(-50%,-50%) scale(.88,.62)'},{opacity:0,transform:'translate(-50%,-50%) scale(3.6)'}],{duration:240,fill:'forwards'});
    mark.animate([{opacity:1,transform:'translate(-50%,-50%) scale(.9)'},{opacity:0,transform:'translate(-50%,-50%) scale(2.4)'}],{duration:280,fill:'forwards'});
    vision.animate([{opacity:1},{opacity:.35}],{duration:300,fill:'forwards'});
    const sl=speedLines('#F6E7BF',40);
    sl.animate([{opacity:0,transform:'scale(2.6)'},{opacity:.95,transform:'scale(1)'},{opacity:0,transform:'scale(.5)'}],{duration:480,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    showCard();cardwrap.animate([
      {transform:'translateY(0) scale(.12)',opacity:0,filter:'blur(7px)'},
      {transform:'translateY(0) scale(1.2)',opacity:1,filter:'blur(0px)',offset:.6},
      {transform:'translateY(0) scale(.95)',opacity:1,filter:'blur(0px)',offset:.8},
      {transform:'translateY(0) scale(1)',opacity:1,filter:'blur(0px)',offset:1}
    ],{duration:540,easing:'cubic-bezier(.15,.85,.25,1)',fill:'forwards'});
    setTimeout(()=>{if(skip)return;
      clawSet('#F6E7BF',-27,0,15);clawSet('#E8C24A',31,70,15);
      boom();sfx2('clang');noiseHit(.3,.32,0,5400,900,false);
      cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),540);
      shockwave('rgba(246,231,191,.85)',12,720,4);
      pop(W/2,H*.5,{n:90,cols:['#E8C24A','#F6E7BF','#fff'],shape:'r',sp:13,size:2.6,g:.18,dec:.014});
      const cr=crackSVG('#E8C24A');cr.animate([{opacity:0,transform:'translate(-50%,-50%) perspective(520px) rotateX(74deg) scale(.4)'},
        {opacity:.9,transform:'translate(-50%,-50%) perspective(520px) rotateX(74deg) scale(1)'}],{duration:420,easing:'cubic-bezier(.1,.9,.2,1)',fill:'forwards'});
      setTimeout(()=>cr.animate([{opacity:.9},{opacity:.25}],{duration:700,fill:'forwards'}),500);
      glow.style.transition='opacity .5s';glow.style.opacity='.9';
      shine.style.transition='transform .7s ease-out';shine.style.transform='translateX(130%)';
      levelRing('#E8C24A');lolBanner('猎 物 已 现','#C8AA6E');
    },330);
    await wait(1250);if(skip)return;
    sky.animate([{opacity:1},{opacity:.5}],{duration:500,fill:'forwards'});
    await wait(360);if(skip)return;}

  /* 沃里克 · X 轴：矩形冲锋指示器画出路径，然后横向高速撞入 */
  async function playWarwick(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#7CE06A';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    card.style.transition='none';card.style.transform='rotateY(0deg)';
    cardwrap.style.transition='none';cardwrap.style.opacity='0';cardwrap.style.transform='translateX(-125vw) scale(1.06)';
    glow.style.opacity='0';shine.style.transition='none';shine.style.transform='translateX(-130%)';
    const sky=riftBg();sky.animate([{opacity:0},{opacity:1}],{duration:450,fill:'forwards'});
    barT.style.height='11%';barB.style.height='11%';
    // 残血红边：像 LoL 里血量过低时的屏幕红晕，一下一下地跳
    const hurt=tint('radial-gradient(ellipse at 50% 50%,transparent 42%,rgba(150,10,10,.55) 88%)',5);
    hurt.animate([{opacity:0},{opacity:.85}],{duration:500,fill:'forwards'});
    hurt.animate([{opacity:.5},{opacity:.95}],{duration:620,direction:'alternate',iterations:Infinity});
    osc(58,40,2.4,'sine',.16,0,true);
    const fog=setInterval(()=>{pop(Math.random()*W,H+12,{n:2,dir:-1.5708,spread:.7,cols:['#7CE06A','#2b7a3a','#8a1414'],shape:'c',sp:2.2,up:-1.5,g:-.01,size:6,dec:.005});},80);
    skipRes.push(()=>clearInterval(fog));
    await wait(520);if(skip){clearInterval(fog);return;}
    // 血迹追踪：蜿蜒的血痕曲线，虚线朝卡片方向持续流动
    const scent=scentTrail('#FF4B3E','#8a1414');
    scent.animate([{opacity:0},{opacity:1}],{duration:700,easing:'ease-out',fill:'forwards'});
    sfx2('blip');noiseHit(.5,.12,0,1400,300,true);
    // 沿着血痕往前飘的血雾颗粒
    const drip=setInterval(()=>{const p=Math.random();
      pop(W*(.05+p*.9),H*(.52+Math.sin(p*3.1)*.11),{n:1,dir:-0.3,spread:.5,cols:['#FF4B3E','#8a1414','#ffb0a8'],shape:'c',sp:1.4,g:.02,size:3.4,dec:.012});},70);
    skipRes.push(()=>clearInterval(drip));
    await wait(620);if(skip){clearInterval(fog);clearInterval(drip);return;}
    // 矩形冲锋路径指示器：从左边一路铺到中心
    const lane=runeLine('#FF4B3E');
    lane.animate([{opacity:0,transform:'translate(-50%,-50%) perspective(560px) rotateX(70deg) scaleX(.05)'},
      {opacity:.95,transform:'translate(-50%,-50%) perspective(560px) rotateX(70deg) scaleX(1)'}],{duration:520,easing:'cubic-bezier(.2,.9,.2,1)',fill:'forwards'});
    await wait(430);if(skip){clearInterval(fog);clearInterval(drip);return;}
    // —— 对视：血色兽瞳缓缓睁开、停住、眨眼、瞳孔收紧 ——
    const eyes=beastEyes('#FF3B2F',44,50);
    eyes.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.5)'},
      {opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:640,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    growl(1.6,.34);
    lolBanner('血 之 狩 猎','#B9C87E');
    await wait(720);if(skip){clearInterval(fog);clearInterval(drip);return;}
    eyes.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.05)'},
      {transform:'translate(-50%,-50%) scale(1)'}],{duration:880,easing:'ease-in-out'});
    await wait(540);if(skip){clearInterval(fog);clearInterval(drip);return;}
    eyes.animate([{opacity:1},{opacity:.05,offset:.5},{opacity:1}],{duration:180});
    await wait(320);if(skip){clearInterval(fog);clearInterval(drip);return;}
    eyes.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(.9,.58)'}],{duration:220,easing:'ease-in',fill:'forwards'});
    osc(300,80,.3,'sawtooth',.18,0,true);
    clearInterval(drip);
    scent.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'});
    await wait(290);if(skip){clearInterval(fog);return;}
    // 冲锋：卡片带着横向拖影从左侧撞进来
    eyes.animate([{opacity:1,transform:'translate(-50%,-50%) scale(.9,.58)'},{opacity:0,transform:'translate(-50%,-50%) scale(2.4)'}],{duration:200,fill:'forwards'});
    lane.animate([{opacity:.95},{opacity:0}],{duration:260,fill:'forwards'});
    for(let i=0;i<7;i++){const st=document.createElement('div');st.className='rwd-fx2';
      st.style.cssText='top:'+(30+i*6)+'%;left:0;width:100%;height:'+(2+Math.random()*4)+'px;z-index:8;opacity:0;'
        +'background:linear-gradient(90deg,transparent,#FF4B3E 30%,#fff 55%,transparent);filter:blur(1px)';
      cine.appendChild(st);
      st.animate([{opacity:0,transform:'translateX(-110%)'},{opacity:.9,transform:'translateX(-10%)',offset:.4},{opacity:0,transform:'translateX(110%)'}],
        {duration:420,delay:i*26,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});}
    whoosh(.5,220,2400,.3);
    showCard();cardwrap.animate([
      {transform:'translateX(-125vw) scale(1.06) skewX(-16deg)',opacity:0,filter:'blur(9px)'},
      {transform:'translateX(14vw) scale(1.03) skewX(-7deg)',opacity:1,filter:'blur(2px)',offset:.5},
      {transform:'translateX(-5vw) scale(1) skewX(3deg)',filter:'blur(0px)',offset:.74},
      {transform:'translateX(1.5vw) scale(1) skewX(-1deg)',opacity:1,filter:'blur(0px)',offset:.88},
      {transform:'translateX(0) scale(1) skewX(0deg)',opacity:1,filter:'blur(0px)',offset:1}
    ],{duration:640,easing:'cubic-bezier(.16,.9,.24,1)',fill:'forwards'});
    setTimeout(()=>{if(skip)return;
      boom();sfx2('clang');
      cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),560);
      // 血溅：向右侧甩出
      pop(W*.42,H*.5,{n:80,dir:0,spread:1.5,cols:['#FF4B3E','#8a1414','#fff','#7CE06A'],shape:'c',sp:14,size:3.2,g:.3,dec:.014});
      pop(W*.42,H*.5,{n:40,dir:0,spread:.7,cols:['#FF4B3E','#c02020'],shape:'petal',sp:16,size:5,g:.34,dec:.012});
      shockwave('rgba(255,75,62,.8)',12,700,4);
      glow.style.transition='opacity .5s';glow.style.opacity='.9';
      shine.style.transition='transform .7s ease-out';shine.style.transform='translateX(130%)';
      levelRing('#7CE06A');
      hurt.animate([{opacity:.9},{opacity:.18}],{duration:700,fill:'forwards'});
    },380);
    await wait(1200);if(skip){clearInterval(fog);return;}
    clearInterval(fog);
    sky.animate([{opacity:1},{opacity:.5}],{duration:500,fill:'forwards'});
    sfx2('chime');
    await wait(380);if(skip)return;}

  /* 沃利贝尔 · Y 轴：圆形范围预警 + 地面影子放大，然后连人带雷从天上砸下来 */
  async function playVolibear(){cine.classList.add('on');resetStage();clearFx();await raf();
    const acc='#A46BFF';[front,cardwrap,glow,card].forEach(el=>el.style.setProperty('--rwacc',acc));
    card.style.transition='none';card.style.transform='rotateY(0deg)';
    cardwrap.style.transition='none';cardwrap.style.opacity='0';cardwrap.style.transform='translateY(-120vh) scale(1.12)';
    glow.style.opacity='0';shine.style.transition='none';shine.style.transform='translateX(-130%)';
    // 底色压到接近全黑：之前整屏发紫发白，气势全被冲淡了
    const sky=tint('radial-gradient(ellipse at 50% 110%,#1a1030 0%,#0c0720 30%,#050310 58%,#010007 100%)',1);
    sky.animate([{opacity:0},{opacity:1}],{duration:450,fill:'forwards'});
    barT.style.height='11%';barB.style.height='11%';
    // 头顶积聚的雷暴云
    const stormSky=tint('linear-gradient(180deg,rgba(26,14,54,.98),rgba(12,7,30,.72) 30%,transparent 60%)',4);
    stormSky.animate([{opacity:0},{opacity:1}],{duration:700,fill:'forwards'});
    osc(52,38,3.4,'sine',.2,0,true);noiseHit(3.2,.09,0,240,70,true,true);
    // 云里的巨兽剪影：一次浮出来就压在那儿不动了。
    // 之前跟着每道雷一闪一闪，看着像信号不好，压不住场
    const beast=beastSilhouette('#C79BFF');
    beast.animate([{opacity:0},{opacity:.72}],{duration:1100,easing:'ease-out',fill:'forwards'});
    // 远处闷雷：三次由远及近的云层放电，只让剪影更实一点，不做明暗跳变
    [0,760,1340].forEach((t,i)=>setTimeout(()=>{if(skip)return;
      beast.animate([{opacity:.72+i*.06},{opacity:.84+i*.05}],{duration:300+i*90,easing:'ease-out',fill:'forwards'});
      stormSky.animate([{filter:'brightness(1)'},{filter:'brightness('+(1.9+i*.7)+')',offset:.1},{filter:'brightness(1)'}],{duration:260+i*70});
      noiseHit(.9+i*.3,.06+i*.05,0,180,50,true,true);osc(44+i*8,30,.5,'sine',.12+i*.05,0,true);
    },t));
    await wait(1500);if(skip)return;
    // 圆形范围预警，三次收缩脉冲（LoL 里砸落技能的落点提示）
    const rune=groundRune('#A46BFF','#E0D0FF');
    rune.animate([{opacity:0,transform:'translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(.4)'},
      {opacity:.95,transform:'translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(1)'}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    sfx2('blip');
    for(let k=0;k<2;k++)setTimeout(()=>{if(skip)return;
      const warn=document.createElement('div');warn.className='rwd-fx2';
      warn.style.cssText='top:66%;left:50%;width:min(86vw,520px);aspect-ratio:1;z-index:7;border-radius:50%;'
        +'border:3px solid #C79BFF;box-shadow:0 0 22px #A46BFF;opacity:0;'
        +'transform:translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(1.5)';
      cine.appendChild(warn);
      warn.animate([{opacity:.9,transform:'translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(1.5)'},
        {opacity:.2,transform:'translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(.42)'}],{duration:520,easing:'ease-in',fill:'forwards'});
      osc(300+k*140,140,.3,'triangle',.1,0,true);},360+k*380);
    // 地面影子越来越大 —— 有东西正在砸下来
    const shd=document.createElement('div');shd.className='rwd-fx2';
    shd.style.cssText='top:70%;left:50%;width:min(52vw,300px);height:min(18vw,110px);z-index:6;border-radius:50%;'
      +'background:radial-gradient(ellipse,rgba(0,0,0,.85),transparent 72%);opacity:0;transform:translate(-50%,-50%) scale(.16)';
    cine.appendChild(shd);
    shd.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.16)'},{opacity:.95,transform:'translate(-50%,-50%) scale(1)'}],
      {duration:1300,delay:340,easing:'cubic-bezier(.5,0,.85,.5)',fill:'forwards'});
    lolBanner('雷 霆 天 罚','#C0A8E0');
    await wait(1240);if(skip)return;
    // 蓄力：地面符文越收越紧，电弧顺着地面往中心爬，声音一路推上去
    rune.animate([{transform:'translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(1)'},
      {transform:'translate(-50%,-50%) perspective(560px) rotateX(72deg) scale(.86)'}],
      {duration:620,easing:'cubic-bezier(.6,0,.9,.4)',fill:'forwards'});
    const chargeArc=arcCrawl('#C79BFF',9);
    chargeArc.style.zIndex='6';chargeArc.animate([{opacity:0},{opacity:.85}],{duration:420,fill:'forwards'});
    osc(90,420,.62,'sawtooth',.1,0,true);noiseHit(.62,.1,0,900,220,true,true);
    // 剪影被自身的电压照亮，抬起来准备砸下
    beast.animate([{opacity:.94,transform:'translateX(-50%) scale(1)'},
      {opacity:1,transform:'translateX(-50%) scale(1.07)'}],{duration:620,easing:'ease-in',fill:'forwards'});
    await wait(600);if(skip)return;
    // 天罚落下：两道侧雷抢拍，再一道巨型主雷贯穿全屏，然后卡片砸地
    [[24,.8,26],[76,.8,26],[50,1,62]].forEach((cfg,i)=>setTimeout(()=>{if(skip)return;
      const b=forkedBolt('#C79BFF',cfg[0],cfg[2],cfg[1]);cine.appendChild(b);
      const isMain=i===2;
      b.animate([{opacity:0,transform:'translateX(-50%) scaleY(.12)'},
        {opacity:1,transform:'translateX(-50%) scaleY(1)',offset:.18},
        {opacity:isMain?1:.5,transform:'translateX(-50%) scaleY(1)',offset:.34},
        {opacity:1,transform:'translateX(-50%) scaleY(1)',offset:.46},
        {opacity:0,transform:'translateX(-50%) scaleY(1)'}],
        {duration:isMain?680:420,easing:'cubic-bezier(.2,0,.3,1)',fill:'forwards'});
      // 闪不再是糊满全屏的白幕，改成从天而降的一道光柱：亮得住、但不把画面冲平
      flash.style.transition='none';
      flash.style.background=isMain
        ? 'linear-gradient(180deg,rgba(255,255,255,.92),rgba(199,155,255,.5) 40%,transparent 78%)'
        : 'linear-gradient(180deg,rgba(199,155,255,.5),transparent 55%)';
      flash.style.opacity='1';
      requestAnimationFrame(()=>{flash.style.transition='opacity '+(isMain?.34:.22)+'s';flash.style.opacity='0';});
      noiseHit(isMain?.9:.45,isMain?.4:.22,0,isMain?240:420,55,true,true);
      osc(isMain?46:82,30,isMain?.9:.45,'sine',isMain?.36:.2,0);
      shockwave('rgba(199,155,255,'+(isMain?.8:.45)+')',isMain?10:6,isMain?700:520,isMain?4:2);
      pop(W*(cfg[0]/100),H*.62,{n:isMain?46:20,dir:-1.5708,spread:1.5,cols:['#C79BFF','#fff','#A46BFF'],shape:'r',sp:isMain?12:8,g:.2,size:2.6,dec:.016});
      cine.classList.add(isMain?'rwd-shakingbig':'rwd-shaking');
      setTimeout(()=>cine.classList.remove(isMain?'rwd-shakingbig':'rwd-shaking'),isMain?420:200);
    },i*130));
    whoosh(.5,180,1800,.3);
    await wait(300);if(skip)return;
    showCard();cardwrap.animate([
      {transform:'translateY(-120vh) scale(1.12)',opacity:0,filter:'blur(6px)'},
      {transform:'translateY(0) scale(1)',opacity:1,filter:'blur(0px)',offset:.4},
      {transform:'translateY(0) scale(1.16,.82)',offset:.48},
      {transform:'translateY(-4vh) scale(.94,1.08)',offset:.62},
      {transform:'translateY(0) scale(1.04,.97)',opacity:1,filter:'blur(0px)',offset:.78},
      {transform:'translateY(0) scale(1)',opacity:1,filter:'blur(0px)',offset:1}
    ],{duration:740,easing:'cubic-bezier(.4,0,.7,1)',fill:'forwards'});
    setTimeout(()=>{if(skip)return;
      // 落地那一下不再糊一层白：只留极短的一击，然后立刻把画面压暗——重量感来自暗，不是来自亮
      flash.style.transition='none';flash.style.background='radial-gradient(circle at 50% 62%,rgba(255,255,255,.85),rgba(199,155,255,.35) 38%,transparent 68%)';flash.style.opacity='1';
      requestAnimationFrame(()=>{flash.style.transition='opacity .26s';flash.style.opacity='0';});
      const punch=tint('radial-gradient(ellipse at 50% 58%,transparent 24%,rgba(0,0,0,.92) 82%)',9);
      punch.animate([{opacity:0},{opacity:1,offset:.14},{opacity:.45}],{duration:900,easing:'cubic-bezier(.1,.8,.3,1)',fill:'forwards'});
      boom();boom();noiseHit(1.4,.42,0,180,42,true,true);osc(38,24,1.5,'sine',.4,0,true);
      cine.classList.add('rwd-shakingbig');setTimeout(()=>cine.classList.remove('rwd-shakingbig'),900);
      shd.animate([{opacity:.95},{opacity:0}],{duration:220,fill:'forwards'});
      // 剪影随着本尊落地散进云里
      beast.animate([{opacity:1},{opacity:0}],{duration:420,fill:'forwards'});
      chargeArc.animate([{opacity:.85},{opacity:0}],{duration:260,fill:'forwards'});
      const cr=crackSVG('#C79BFF');
      cr.animate([{opacity:0,transform:'translate(-50%,-50%) perspective(520px) rotateX(74deg) scale(.3)'},
        {opacity:1,transform:'translate(-50%,-50%) perspective(520px) rotateX(74deg) scale(1.12)'}],{duration:380,easing:'cubic-bezier(.1,.9,.2,1)',fill:'forwards'});
      setTimeout(()=>cr.animate([{opacity:1},{opacity:.3}],{duration:800,fill:'forwards'}),480);
      // 落地掀起的是土块和焦屑，不是彩带
      for(let t=0;t<34;t++){const a=t/34*6.283;
        pop(W/2,H*.62,{n:3,dir:a,spread:.06,cols:['#2a1c48','#4a3a72','#C79BFF','#1a1230'],shape:'r',sp:16,g:.34,size:3.4,dec:.012});}
      shockwave('rgba(199,155,255,.9)',14,760,5);setTimeout(()=>shockwave('rgba(164,107,255,.55)',22,1020,3),140);
      rune.style.zIndex='2';rune.animate([{opacity:.95},{opacity:.4}],{duration:600,fill:'forwards'});
      glow.style.transition='opacity .5s';glow.style.opacity='.95';
      shine.style.transition='transform .8s ease-out';shine.style.transform='translateX(130%)';
      levelRing('#A46BFF');
      // 落地之后卡片周身还在放电，噼啪不停 —— 不灭狂雷
      setTimeout(()=>{if(skip)return;const ca=arcCrawl('#D7BEFF',8);
        ca.animate([{opacity:0},{opacity:1}],{duration:260,fill:'forwards'});
        setTimeout(()=>ca.animate([{opacity:1},{opacity:.35}],{duration:900,fill:'forwards'}),700);},260);
    },300);
    await wait(1500);if(skip)return;
    // 收尾用一记远去的闷雷，不用清脆的和弦
    osc(34,22,2.2,'sine',.26,0,true);noiseHit(2,.12,0,160,44,true,true);
    stormSky.animate([{opacity:1},{opacity:.55}],{duration:700,fill:'forwards'});
    sky.animate([{opacity:1},{opacity:.7}],{duration:600,fill:'forwards'});
    await wait(420);if(skip)return;}

  /* 柴龙恩 · 迟疑入场：描边先到，暗部先动，卡面慢半拍跟上。 */
  function hesitantSfx(){
    // 极短、极轻的气声和被截去尾巴的机械触点；比其他卡的音量低一个数量级。
    noiseHit(.045,.012,0,1150,520,false,true);osc(148,86,.052,'triangle',.007,0,false);
  }
  async function playHesitant(){
    cine.classList.add('on');resetStage();clearFx();await raf();
    const back=document.createElement('div');back.className='rwd-fx2 rwd-hes-backlight';cine.appendChild(back);
    const edge=document.createElement('div');edge.className='rwd-fx2 rwd-hes-edge';cine.appendChild(edge);
    back.animate([{opacity:0},{opacity:.72,offset:.42},{opacity:.46}],{duration:reduce?180:980,easing:'cubic-bezier(.08,.78,.18,1)',fill:'forwards'});
    edge.animate([{opacity:0,transform:'translate(-50%,-50%) translateX(-24px)'},{opacity:.46,offset:.28},{opacity:.15,transform:'translate(-50%,-50%) translateX(-17px)'}],{duration:reduce?180:650,easing:'cubic-bezier(.06,.82,.16,1)',fill:'forwards'});
    await wait(reduce?30:145);if(skip)return;
    if(!reduce)hesitantSfx();
    showCard();card.style.transform='rotateY(0deg)';cardwrap.style.transform='translateX(-23px) translateY(2px) scale(.986)';front.style.opacity='0';front.style.filter='blur(2.2px) brightness(.62)';glow.style.opacity='.08';
    cardwrap.animate([{opacity:0,transform:'translateX(-23px) translateY(2px) scale(.986)'},{opacity:.76,offset:.34},{opacity:.70,offset:.49},{opacity:1,transform:'translateX(0) translateY(0) scale(1)'}],{duration:reduce?220:920,easing:'cubic-bezier(.055,.78,.15,1)',fill:'forwards'});
    front.animate([{opacity:0,filter:'blur(2.2px) brightness(.62)'},{opacity:.48,filter:'blur(1.1px) brightness(.69)',offset:.34},{opacity:.44,filter:'blur(.8px) brightness(.72)',offset:.51},{opacity:1,filter:'blur(0) brightness(1)'}],{duration:reduce?220:1080,delay:reduce?0:90,easing:'cubic-bezier(.08,.74,.16,1)',fill:'forwards'});
    glow.animate([{opacity:.04},{opacity:.115,offset:.38},{opacity:.065}],{duration:reduce?220:1120,easing:'ease-out',fill:'forwards'});
    await wait(reduce?180:410);if(skip)return;
    if(!reduce)cine.animate([{transform:'translateX(0)'},{transform:'translateX(.5px)'},{transform:'translateX(0)'}],{duration:34,easing:'steps(2,end)'});
    await wait(reduce?90:720);if(skip)return;
    edge.animate([{opacity:.15},{opacity:0}],{duration:320,fill:'forwards'});
  }

  const ANIMS={ink:playInk,blueprint:playBlueprint,cosmic:playCosmic,magic:playMagic,dessert:playDessert,sticker:playSticker,hesitant:playHesitant,
    water:playWater,wind:playWind,king:playKing,sword:playSword,
    mitsuki:playMitsuki,meroko:playMeroko,takuto:playTakuto,
    rengar:playRengar,warwick:playWarwick,volibear:playVolibear};

  let _resolve=null;
  function finish(){busy=false;skipRes=[];storm=Math.min(storm,24);cine.classList.remove('on');root.classList.remove('on');cine.querySelectorAll('.rwd-heaven,.rwd-void,.rwd-fx2').forEach(e=>e.remove());
    // 收场时一并清掉 fill:'forwards' 残留的动画：否则它会一直把上一张卡的
    // opacity/transform 钉在元素上，压过下一张卡开场设的内联样式，导致卡片一开场就露出来
    [cardwrap,card,glow,front,shine].forEach(el=>{
      if(el&&el.getAnimations)el.getAnimations().forEach(a=>{try{a.cancel();}catch(e){}});});
    cardwrap.style.opacity='0';
    if(_resolve){const r=_resolve;_resolve=null;r();}}
  async function run(cardObj,{shiny:shinyOn=false,first=false,anim=null}={}){
    // 正在播时又来一张：打断当前这张，直接改播新的（否则新调用会被静默吞掉，看起来像"动画没做出来"）
    if(busy){skip=true;skipRes.forEach(f=>f());skipRes=[];finish();await new Promise(r=>setTimeout(r,80));}
    clearTimeout(run._t);busy=true;skip=false;resize();root.classList.add('on');ac();
    const rar=cardObj.rarity||'n';setCard(cardObj,shinyOn);
    if(!anim&&cardObj.style&&ANIMS[cardObj.style])anim=cardObj.style;
    if(anim&&ANIMS[anim])await ANIMS[anim](); else if(rar==='h')await playHidden(); else if(rar==='s')await playMega(); else await playStd(rar,first);
    if(!skip){settleShiny(shinyOn);tapHint.style.opacity='1';}
    // auto-dismiss after a beat; user can click to close sooner
    busy=false;
    return new Promise(res=>{_resolve=res;clearTimeout(run._t);run._t=setTimeout(()=>{if(_resolve)finish();},3200);});
  }

  function playExternalCard(cardObj){
    return new Promise(resolve=>{
      const old=document.getElementById('rwd-external-card');if(old)old.remove();
      const host=document.createElement('div');host.id='rwd-external-card';
      host.style.cssText='position:fixed;inset:0;z-index:100500;background:#02040a;';
      const externalPath=cardObj.external||'cards/xujiahao-ssr.html';
      host.innerHTML=`<iframe title="${cardObj.cn||'互动'} 卡牌过场" src="/${externalPath}?v=20260909-1" allow="autoplay; fullscreen" style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#02040a"></iframe><button type="button" aria-label="关闭卡牌过场" style="position:absolute;right:18px;top:18px;z-index:2;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,220,140,.65);background:rgba(0,0,0,.68);color:#fff4cf;font-size:24px;line-height:38px;cursor:pointer;box-shadow:0 0 24px rgba(255,190,60,.3)">×</button>`;
      const close=()=>{host.remove();resolve();};
      host.querySelector('button').addEventListener('click',close);
      document.body.appendChild(host);
    });
  }

  /* ---------- public API ---------- */
  window.NEBSReward={
    play:function(payload){ // payload: {card, shiny, isFirst}
      if(!payload||!payload.card)return Promise.resolve();
      if(payload.card.external||payload.card.id==='xujiahao_ssr')return playExternalCard(payload.card);
      const go=()=>run(payload.card,{shiny:!!payload.shiny,first:!!payload.isFirst});
      if(document.body&&cine)return go();
      return new Promise(r=>{const t=setInterval(()=>{if(cine){clearInterval(t);go().then(r);}},50);});
    },
    preview:function(card,opts){opts=opts||{};if(card&&(card.external||card.id==='xujiahao_ssr'))return playExternalCard(card);return run(card,{shiny:!!opts.shiny,first:!!opts.first});},
    demo:function(name,card){return run(card,{anim:name});},
    cardHTML:function(card,owned,shinyCount){
      const rar=(card&&card.rarity)||'n',c=RAR[rar];
      if(!owned){if(rar==='h'||rar==='L'){const lbl=rar==='L'?'传奇 · 传说角色':'??? · 隐藏';const t=rar==='L'?'神秘传说':'神秘师生';return `<div class="rwd-mini locked hidden" style="--rwacc:${c.acc}"><div class="rwd-ctop" style="width:100%;"><span class="rwd-no">NO.??</span><span class="rwd-rarity" style="color:${c.acc}">${lbl}</span></div><div class="rwd-lockq">${rar==='L'?'✦':'?'}</div><div class="lockt">${t}</div></div>`;}
      return `<div class="rwd-mini locked" style="--rwacc:${c.acc}"><div class="rwd-ctop" style="width:100%;"><span class="rwd-no">NO.${String(card.no).padStart(2,'0')}</span><span class="rwd-rarity" style="color:${c.acc}">${c.tag} · ${c.label}</span></div><div class="lock">🔒</div><div class="lockt">未解锁</div></div>`;}
      const badge=shinyCount>0?`<div class="rwd-shiny-badge" style="opacity:1;position:absolute;top:6px;right:6px;left:auto;transform:none;font-size:9px;padding:2px 6px;">✦×${shinyCount}</div>`:'';
      return `<div class="rwd-mini owned${(rar==='h'||!!TSTY[card.style])&&!tcute(card)&&!tflat(card)&&!tlol(card)&&!thesitant(card)?' holo':''}${tflat(card)?' flat':''}${tlol(card)?' lol':''}${thesitant(card)?' hesitant':''}" style="--rwacc:${tacc(card)||c.acc}" data-card='${encodeURIComponent(JSON.stringify(card))}'>${badge}${faceHTML(card,rar)}</div>`;
    },
    RAR:RAR
  };
  if(document.body)ready(); else document.addEventListener('DOMContentLoaded',ready);
})();
