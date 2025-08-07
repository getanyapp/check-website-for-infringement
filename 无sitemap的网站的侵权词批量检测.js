// ==UserScript==
// @name         无sitemap的网站的侵权词批量检测
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  脚本会自动爬取网站的所有内部页面链接，忽略外链，适用于没有sitemap的网站。
// @description  ❗ 检测过程中，不要关闭浏览器，也不要停止检测，检测完毕，浏览器将会自动下载一个名为"侵权页面合集-无sitemap.xlsx"的表格 ❗
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
        'seeking arrangement',
        'mutually beneficial relationships',
        'seekingarrangement.com',
        'seekingarrangement',
        'relationship on your terms and mutually beneficial relationships',
        'seeking.com',
        'seeking',
        'seeking millionaire',
        'sa',
        'relationship on your terms',
        'mutually beneficial relationship',
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
    let discoveredUrls = new Set(); // 已发现的URL集合
    let processedUrls = new Set(); // 已处理的URL集合
    let pendingUrls = []; // 待处理的URL队列

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
            const discoveredCount = discoveredUrls.size;
            this.top.innerText = `共 ${siteList.length} 个网站；当前第 ${currentSiteIndex + 1} 个；` +
                                 `已发现 ${discoveredCount} 页，检测第 ${curPageNum} 页`;
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
        console.log('[InfringementDetector] 开始处理网站：', site);

        // 重置当前网站的状态
        discoveredUrls.clear();
        processedUrls.clear();
        pendingUrls = [];
        currentPages = [];
        currentPageIndex = 0;

        // 从主页开始爬取
        const baseUrl = site.replace(/\/+$/, ''); // 移除末尾的斜杠
        addUrlToQueue(baseUrl, baseUrl);

        // 开始爬取链接
        crawlNextUrl(baseUrl);
    }

    // 添加URL到待处理队列
    function addUrlToQueue(url, baseUrl) {
        const normalizedUrl = normalizeUrl(url, baseUrl);
        if (normalizedUrl &&
            !discoveredUrls.has(normalizedUrl) &&
            !processedUrls.has(normalizedUrl) &&
            isInternalUrl(normalizedUrl, baseUrl)) {
            discoveredUrls.add(normalizedUrl);
            pendingUrls.push(normalizedUrl);
            console.log('[InfringementDetector] 发现新链接：', normalizedUrl);
        }
    }

    // URL规范化
    function normalizeUrl(url, baseUrl) {
        try {
            // 处理相对URL
            const fullUrl = new URL(url, baseUrl).href;
            // 移除fragment和一些查询参数
            const urlObj = new URL(fullUrl);
            urlObj.hash = '';
            return urlObj.href;
        } catch (e) {
            console.warn('[InfringementDetector] 无效URL：', url);
            return null;
        }
    }

    // 检查是否为内部链接
    function isInternalUrl(url, baseUrl) {
        try {
            const urlObj = new URL(url);
            const baseObj = new URL(baseUrl);
            return urlObj.hostname === baseObj.hostname;
        } catch (e) {
            return false;
        }
    }

    // 从页面提取链接
    function extractLinksFromPage(html, baseUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const links = doc.querySelectorAll('a[href]');

        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
                addUrlToQueue(href, baseUrl);
            }
        });
    }

    // 爬取下一个URL
    function crawlNextUrl(baseUrl) {
        if (!running) return;

        if (pendingUrls.length === 0) {
            // 所有链接都已爬取完毕，开始检测
            console.log('[InfringementDetector] 链接爬取完毕，共发现', discoveredUrls.size, '个页面');
            currentPages = Array.from(discoveredUrls);
            currentPageIndex = 0;
            ui.update();
            processNextPage();
            return;
        }

        const url = pendingUrls.shift();
        if (processedUrls.has(url)) {
            crawlNextUrl(baseUrl);
            return;
        }

        processedUrls.add(url);
        console.log('[InfringementDetector] 爬取页面：', url);

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: resp => {
                if (!running) return;

                if (resp.status === 200) {
                    // 提取页面中的链接
                    extractLinksFromPage(resp.responseText, baseUrl);
                }

                ui.update();
                // 继续爬取下一个URL
                setTimeout(() => crawlNextUrl(baseUrl), 100); // 添加小延迟避免过快请求
            },
            onerror: err => {
                console.error('[InfringementDetector] 页面爬取失败：', err);
                // 继续爬取下一个URL
                setTimeout(() => crawlNextUrl(baseUrl), 100);
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
                html = html.replace(/href="(.*?)"/gi, '');

                // 使用正则表达式匹配完整单词，避免部分匹配
                const foundRaw = infringementWords.filter(w => {
                    const word = w.toLowerCase();
                    // 创建单词边界正则表达式，\b确保匹配完整单词
                    const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
                    return regex.test(html);
                });

                const found = foundRaw.filter(w => {
                    const word = w.toLowerCase();
                    return !reverseInfringementWords.some(r => {
                        const reverseWord = r.toLowerCase();
                        // 对反向侵权词也使用完整单词匹配
                        const reverseRegex = new RegExp('\\b' + reverseWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
                        return word.includes(reverseWord) && reverseRegex.test(html);
                    });
                });

                if (found.length) {
                    console.log('[InfringementDetector] 找到侵权词：', found);
                    results.push({
                        page: pageUrl,
                        words: found.join(', '),
                        crawled: '是的'
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
        const wsData = [['侵权页面url', '侵权词', '是否已爬取'], ...results.map(r => [r.page, r.words, r.crawled || ''])];
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
        XLSX.writeFile(wb, '侵权页面合集-无sitemap.xlsx');
        console.log('[InfringementDetector] 下载完成');
    }

    initUI();
})();
