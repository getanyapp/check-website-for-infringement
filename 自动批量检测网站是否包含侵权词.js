// ==UserScript==
// @name         自动批量检测网站是否包含侵权词（打开任何页面，点击页面右下角的“开始检测”按钮即可运行）
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  ✨ 以下必读 ✨
// @description  步骤一：修改第27行起的侵权词列表的定义。我已经定义好了，自行看有没有需要补充的
// @description  步骤二：根据自己的需求，修改第37行起的反向侵权词列表的定义，没有则忽略。
// @description  步骤三：从46行起填入你的所有网站的url。
// @description  步骤四：任意打开一个网站/页面，点击页面右下角的“开始检测”按钮即可运行脚本，比如打开www.sugardaddymeet.com。
// @description  原理：自动获取网站的sitemap文件，然后依次检测每一个页面的HTML代码是否包含侵权词。自动跳过代码中的href=""（链接）内的文本。
// @description  网站必须有/sitemap.xml文件才能检测，脚本会自动跳过没有sitemap.xml文件的网站。
// @description  ❗ 检测过程中，不要关闭浏览器，也不要停止检测，检测完毕，浏览器将会自动下载一个名为“侵权页面合集.xlsx”的表格 ❗
// @author       Musk
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[InfringementDetector] 脚本载入成功');

    // 🚩 在这里定义 侵权词 列表, 一排一个词，用英文的逗号分隔
    const infringementWords = [
        'seeking',
        'mutually beneficial relationship',
        'mutually beneficial relationships',
        'relationship on your terms and mutually beneficial',
        'relationships',
        'mutually beneficial arrangements'
    ];

    // 🚩 在这里定义 反向侵权词 列表, 一排一个词，用英文的逗号分隔。如果没有，则可以直接删除或随便设置一个无关的词
    // 反向侵权词的意义是：当侵权词列表包含这里的词的一部分，则不认定为侵权，相当于白名单
    // 通俗易懂的举例如下：
    // 侵权词列表定义：arrangement，反向侵权词列表定义arrangements。则当出现arrangements的时候，不侵权；当出现arrangement的时候，侵权
    // 侵权词列表定义：seek，反向侵权词列表定义seeks。则当出现seeks的时候，不侵权；当出现seek的时候，侵权
    const reverseInfringementWords = [
        'arrangements'
    ];

    // 🚩 在这里定义 你的网站url 合集，一排一个网站，用英文的逗号分隔
    const siteList = [
        'https://example.com',
        'https://www.example.com'
    ];

    let running = false;
    let results = [];
    let currentSiteIndex = 0;
    let currentPages = [];
    let currentPageIndex = 0;

    const ui = {
        top: document.createElement('div'),
        bottom: document.createElement('div'),
        btn: document.createElement('button'),
        update() {
            if (!document.body) {
                console.warn('[InfringementDetector] document.body 尚未就绪，无法更新 UI');
                return;
            }
            const totalPages = currentPages.length;
            const curPageNum = totalPages ? currentPageIndex + 1 : 0;
            this.top.innerText = `共 ${siteList.length} 个网站；第 ${currentSiteIndex + 1} 个；` +
                                 `当前网站 ${totalPages} 页，检测第 ${curPageNum} 页`;
        }
    };

    function initUI() {
        if (!document.body) {
            console.error('[InfringementDetector] 找不到 document.body，UI 无法添加');
            return;
        }
        console.log('[InfringementDetector] 开始初始化 UI');

        GM_addStyle(`
            #tm-infringement-top { position: fixed; top: 10px; right: 10px; padding: 8px 14px; background: #FF6666; color: #fff; z-index: 2147483647; font-size: 14px; font-weight: bold; border-radius: 6px; }
            #tm-infringement-bottom { position: fixed; bottom: 30px; right: 30px; z-index: 2147483647; }
            #tm-infringement-btn { padding: 20px 30px; font-size: 14px; font-weight: bold; background: #ff4d4f; color: #fff; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 0 6px rgba(0,0,0,0.3); }
            #tm-infringement-btn:hover { background: #ff1a1c; }
        `);

        ui.top.id = 'tm-infringement-top';
        ui.bottom.id = 'tm-infringement-bottom';
        ui.btn.id = 'tm-infringement-btn';
        ui.btn.innerText = '开始检测';

        try {
            ui.bottom.appendChild(ui.btn);
            document.body.appendChild(ui.top);
            document.body.appendChild(ui.bottom);
            console.log('[InfringementDetector] UI 添加完成');
        } catch (e) {
            console.error('[InfringementDetector] UI 添加失败：', e);
        }

        ui.btn.addEventListener('click', toggleRunning);
        ui.update();
    }

    function toggleRunning() {
        console.log('[InfringementDetector] toggleRunning: running 从', running, '变为', !running);
        running ? stop() : start();
    }

    function start() {
        console.log('[InfringementDetector] 检测开始');
        running = true;
        results = [];
        currentSiteIndex = 0;
        ui.btn.innerText = '停止检测';
        processNextSite();
    }

    function stop() {
        console.log('[InfringementDetector] 检测停止');
        running = false;
        ui.btn.innerText = '开始检测';
    }

    function processNextSite() {
        if (!running) return;
        if (currentSiteIndex >= siteList.length) {
            console.log('[InfringementDetector] 所有站点检测完毕');
            downloadResults();
            return;
        }
        const site = siteList[currentSiteIndex];
        const sitemapUrl = site.replace(/\/+$/,'') + '/sitemap.xml';
        console.log('[InfringementDetector] 请求 sitemap：', sitemapUrl);

        GM_xmlhttpRequest({
            method: 'GET',
            url: sitemapUrl,
            onload: resp => {
                console.log('[InfringementDetector] sitemap 返回 %d', resp.status);
                if (!running) return;
                if (resp.status === 200 && resp.responseText.includes('<urlset')) {
                    const parser = new DOMParser();
                    const xml = parser.parseFromString(resp.responseText, 'application/xml');
                    currentPages = Array.from(xml.getElementsByTagName('loc')).map(el => el.textContent);
                    currentPageIndex = 0;
                    ui.update();
                    processNextPage();
                } else {
                    console.warn('[InfringementDetector] 未发现 sitemap 或响应非 200');
                    results.push({ page: site, words: '', sitemap: '否' });
                    currentSiteIndex++;
                    processNextSite();
                }
            },
            onerror: err => {
                console.error('[InfringementDetector] sitemap 请求失败：', err);
                results.push({ page: site, words: '', sitemap: '否' });
                currentSiteIndex++;
                processNextSite();
            }
        });
    }

    function processNextPage() {
        if (!running) return;
        if (currentPageIndex >= currentPages.length) {
            currentSiteIndex++;
            processNextSite();
            return;
        }
        ui.update();
        const pageUrl = currentPages[currentPageIndex];
        console.log('[InfringementDetector] 请求页面：', pageUrl);

        GM_xmlhttpRequest({
            method: 'GET',
            url: pageUrl,
            onload: resp => {
                console.log('[InfringementDetector] 页面返回 %d', resp.status);
                if (!running) return;
                let html = resp.responseText.toLowerCase();
                html = html.replace(/href=\"(.*?)\"/gi, '');

                const foundRaw = infringementWords.filter(w => html.includes(w.toLowerCase()));
                const found = foundRaw.filter(w =>
                    !reverseInfringementWords.some(r =>
                        r.toLowerCase().includes(w.toLowerCase()) && html.includes(r.toLowerCase())
                    )
                );

                if (found.length) {
                    console.log('[InfringementDetector] 找到侵权词：', found);
                    results.push({
                        page: pageUrl,
                        words: found.join(', '),
                        sitemap: '是的'
                    });
                }
                currentPageIndex++;
                processNextPage();
            },
            onerror: err => {
                console.error('[InfringementDetector] 页面请求失败：', err);
                currentPageIndex++;
                processNextPage();
            }
        });
    }

    function downloadResults() {
        console.log('[InfringementDetector] 开始下载结果，共', results.length, '条记录');
        running = false;
        ui.btn.innerText = '开始检测';

        const wb = XLSX.utils.book_new();
        const wsData = [['侵权页面url', '侵权词', '是否有sitemap.xml'], ...results.map(r => [r.page, r.words, r.sitemap || ''])];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // 列宽自适应
        const colWidths = wsData[0].map((_, colIndex) => {
            const maxLen = wsData.reduce((max, row) => {
                const cell = row[colIndex] == null ? '' : row[colIndex].toString();
                return Math.max(max, cell.length);
            }, 0);
            return { wch: maxLen + 2 };
        });
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, '报告');
        XLSX.writeFile(wb, '侵权页面合集.xlsx');
        console.log('[InfringementDetector] 下载完成');
    }

    initUI();
})();
