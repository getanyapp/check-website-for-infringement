// ==UserScript==
// @name         自动批量检测网站是否包含侵权词 - 并发批量检测（打开任何页面，点击页面右下角的“开始检测”按钮即可运行）
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  ✨ 以下必读 ✨
// @description  步骤一：修改第27行起的侵权词列表的定义。我已经定义好了，自行看有没有需要补充的
// @description  步骤二：根据自己的需求，修改第44行起的反向侵权词列表的定义，没有则忽略。
// @description  步骤三：从53行起填入你的所有网站的url。
// @description  步骤四：任意打开一个网站/页面，点击页面右下角的“开始检测”按钮即可运行脚本，比如打开www.baidu.com。
// @description  原理：自动获取网站的sitemap文件，然后并行检测每一个页面的HTML代码是否包含侵权词。自动跳过代码中的href=""（链接）内的文本。
// @description  v2.2修复：添加缓存控制机制，确保每次检测都获取最新的页面内容，避免浏览器缓存影响检测结果
// @description  v2.1修复：修复HTTP fallback逻辑，确保HTTPS sitemap无法访问时正确尝试HTTP版本并处理页面链接
// @description  v2.0新功能：1) HTTPS sitemap失败时自动尝试HTTP版本 2) 支持多网站多页面并行爬取，速度大幅提升 3) 智能处理HTTP sitemap中的链接
// @description  网站必须有sitemap.xml 或 post-sitemap.xml 或 page-sitemap.xml 或 category-sitemap.xml 或 sitemap_index.xml文件才能检测，脚本会自动跳过一个sitemap文件都没有的网站。
// @description  ❗ 检测过程中，不要关闭浏览器，也不要停止检测，检测完毕，浏览器将会自动下载一个名为“侵权页面合集.xlsx”的表格 ❗
// @author       Musk
// @match        https://www.sugardaddymeet.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[InfringementDetector] 脚本载入成功');

    // 🚩 在这里定义 侵权词 列表, 一排一个词，用英文的逗号分隔 🚩
    const infringementWords = [
        "seeking",
        "arrangement",
        "arrangement dating",
        "arrangements",
        "seeking arrangement",
        "seekingarrangement.com",
        "seekingarrangement",
        "relationship on your terms",
        "seeking.com",
        "seeking millionaire",
        "mutually beneficial relationship",
        "mutually beneficial relationships",
        "mutually beneficial",
        "mutually beneficial arrangements",
        "mutually beneficial dating",
        "secret benefits",
        "secret benefit"
    ];

    // 🚩 在这里定义 反向侵权词 列表, 一排一个词，用英文的逗号分隔。如果没有，则可以直接删除或随便设置一个无关的词 🚩
    // 反向侵权词的意义是：当侵权词列表包含这里的词的一部分，则不认定为侵权，相当于白名单
    // 通俗易懂的举例如下：
    // 侵权词列表定义：arrangement，反向侵权词列表定义arrangements。则当出现arrangements的时候，不侵权；当出现arrangement的时候，侵权
    // 侵权词列表定义：seek，反向侵权词列表定义seeks。则当出现seeks的时候，不侵权；当出现seek的时候，侵权
    const reverseInfringementWords = [
    ];

    // 🚩 在这里定义 你的网站url 合集，一排一个网站，用英文的逗号分隔 🚩
    const siteList = [
        "https://www.example.com",
        "https://example.com"
    ];

    let running = false;
    let results = [];
    let processedSites = 0;
    let totalSites = 0;
    let activeTasks = 0;
    const maxConcurrentSites = 5; // 最大并发网站数
    const maxConcurrentPages = 10; // 最大并发页面数

    const ui = {
        top: document.createElement('div'),
        bottom: document.createElement('div'),
        btn: document.createElement('button'),
        update() {
            if (!document.body) {
                console.warn('[InfringementDetector] document.body 尚未就绪，无法更新 UI');
                return;
            }
            this.top.innerText = `共 ${totalSites} 个网站；已完成 ${processedSites} 个；` +
                                 `活跃任务 ${activeTasks} 个；已发现 ${results.length} 个侵权页面`;
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
        processedSites = 0;
        totalSites = siteList.length;
        activeTasks = 0;
        ui.btn.innerText = '停止检测';
        ui.update();

        // 并行处理网站
        for (let i = 0; i < Math.min(maxConcurrentSites, siteList.length); i++) {
            processSite(i);
        }
    }

    function stop() {
        console.log('[InfringementDetector] 检测停止');
        running = false;
        ui.btn.innerText = '开始检测';
    }

    function processSite(siteIndex) {
        if (!running || siteIndex >= siteList.length) return;

        activeTasks++;
        ui.update();
        const site = siteList[siteIndex];
        console.log(`[InfringementDetector] 开始处理网站 ${siteIndex + 1}/${siteList.length}: ${site}`);

        const sitemapFiles = [
            '/sitemap.xml',
            '/sitemap_index.xml',
            '/category-sitemap.xml',
            '/page-sitemap.xml',
            '/post-sitemap.xml'
        ];

        tryNextSitemap(site, sitemapFiles, 0, [], siteIndex, false);
    }

    function checkAllSitesComplete() {
        if (processedSites >= totalSites && activeTasks === 0) {
            console.log('[InfringementDetector] 所有站点检测完毕');
            downloadResults();
        }
    }

    function startNextSite() {
        const nextIndex = processedSites + activeTasks;
        if (nextIndex < siteList.length) {
            processSite(nextIndex);
        }
    }

    function tryNextSitemap(site, sitemapFiles, fileIndex, allPages, siteIndex, isHttpFallback) {
        if (!running) return;

        if (fileIndex >= sitemapFiles.length) {
            if (allPages.length > 0) {
                const uniquePages = [...new Set(allPages)];
                console.log(`[InfringementDetector] 网站 ${site} 共找到 ${uniquePages.length} 个页面`);
                processPages(uniquePages, siteIndex, isHttpFallback);
            } else {
                console.warn(`[InfringementDetector] 网站 ${site} 没有任何可用的sitemap文件`);
                results.push({ page: site, words: '', sitemap: '否' });
                completeSiteProcessing(siteIndex);
            }
            return;
        }

        const baseUrl = site.replace(/\/+$/,'');
        const sitemapUrl = baseUrl + sitemapFiles[fileIndex];
        console.log(`[InfringementDetector] 请求 sitemap：${sitemapUrl}`);

        GM_xmlhttpRequest({
            method: 'GET',
            url: sitemapUrl + '?t=' + Date.now(),
            timeout: 10000,
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            onload: resp => {
                if (!running) return;
                console.log(`[InfringementDetector] sitemap 返回 ${resp.status} for ${sitemapUrl}`);

                if (resp.status === 200) {
                    let pages = [];

                    if (resp.responseText.includes('<urlset')) {
                        const parser = new DOMParser();
                        const xml = parser.parseFromString(resp.responseText, 'application/xml');
                        pages = Array.from(xml.getElementsByTagName('loc')).map(el => el.textContent);

                        // 如果是HTTP sitemap，处理链接将https://替换为http://
                        if (isHttpFallback) {
                            pages = pages.map(url => url.replace(/^https:\/\//, 'http://'));
                        }

                        console.log(`[InfringementDetector] 从XML sitemap提取到 ${pages.length} 个页面`);
                    }
                    else if (resp.responseText.includes('id="sitemap"')) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(resp.responseText, 'text/html');
                        const sitemapTable = doc.getElementById('sitemap');

                        if (sitemapTable) {
                            const rows = sitemapTable.querySelectorAll('tbody tr');
                            pages = Array.from(rows).map(row => {
                                const link = row.querySelector('td a');
                                return link ? link.href : null;
                            }).filter(url => url);

                            // 如果是HTTP sitemap，处理链接将https://替换为http://
                            if (isHttpFallback) {
                                pages = pages.map(url => url.replace(/^https:\/\//, 'http://'));
                            }

                            console.log(`[InfringementDetector] 从HTML表格sitemap提取到 ${pages.length} 个页面`);
                        }
                    }

                    if (pages.length > 0) {
                        allPages.push(...pages);
                    }
                }

                tryNextSitemap(site, sitemapFiles, fileIndex + 1, allPages, siteIndex, isHttpFallback);
            },
            onerror: err => {
                console.error(`[InfringementDetector] sitemap 请求失败：${sitemapUrl}`, err);

                // 如果是HTTPS失败且还没尝试过HTTP，则尝试HTTP版本
                if (!isHttpFallback && sitemapUrl.startsWith('https://')) {
                    const httpUrl = sitemapUrl.replace('https://', 'http://');
                    console.log(`[InfringementDetector] 尝试HTTP版本：${httpUrl}`);

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: httpUrl + '?t=' + Date.now(),
                        timeout: 10000,
                        headers: {
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0'
                        },
                        onload: resp => {
                            if (!running) return;
                            console.log(`[InfringementDetector] HTTP sitemap 返回 ${resp.status} for ${httpUrl}`);

                            if (resp.status === 200) {
                                let pages = [];

                                if (resp.responseText.includes('<urlset')) {
                                    const parser = new DOMParser();
                                    const xml = parser.parseFromString(resp.responseText, 'application/xml');
                                    pages = Array.from(xml.getElementsByTagName('loc')).map(el => {
                                        // 去掉https://前缀，保留http://前缀
                                        return el.textContent.replace(/^https:\/\//, 'http://');
                                    });
                                    console.log(`[InfringementDetector] 从HTTP XML sitemap提取到 ${pages.length} 个页面`);
                                }
                                else if (resp.responseText.includes('id="sitemap"')) {
                                    const parser = new DOMParser();
                                    const doc = parser.parseFromString(resp.responseText, 'text/html');
                                    const sitemapTable = doc.getElementById('sitemap');

                                    if (sitemapTable) {
                                        const rows = sitemapTable.querySelectorAll('tbody tr');
                                        pages = Array.from(rows).map(row => {
                                            const link = row.querySelector('td a');
                                            // 去掉https://前缀，保留http://前缀
                                            return link ? link.href.replace(/^https:\/\//, 'http://') : null;
                                        }).filter(url => url);
                                        console.log(`[InfringementDetector] 从HTTP HTML表格sitemap提取到 ${pages.length} 个页面`);
                                    }
                                }

                                if (pages.length > 0) {
                                    allPages.push(...pages);
                                }
                            }

                            // 继续处理下一个sitemap文件，但重置isHttpFallback为false
                            tryNextSitemap(site, sitemapFiles, fileIndex + 1, allPages, siteIndex, false);
                        },
                        onerror: httpErr => {
                            console.error(`[InfringementDetector] HTTP sitemap 也请求失败：${httpUrl}`, httpErr);
                            tryNextSitemap(site, sitemapFiles, fileIndex + 1, allPages, siteIndex, false);
                        }
                    });
                } else {
                    tryNextSitemap(site, sitemapFiles, fileIndex + 1, allPages, siteIndex, isHttpFallback);
                }
            }
        });
    }

    function processPages(pages, siteIndex, isHttpFallback) {
        if (!running || pages.length === 0) {
            completeSiteProcessing(siteIndex);
            return;
        }

        let processedPages = 0;
        let activePageTasks = 0;
        const totalPages = pages.length;

        function processPage(pageIndex) {
            if (!running || pageIndex >= pages.length) return;

            activePageTasks++;
            const pageUrl = pages[pageIndex];

            // 确保URL格式正确
            const finalUrl = pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`;

            console.log(`[InfringementDetector] 请求页面 ${pageIndex + 1}/${totalPages}: ${finalUrl}`);

            GM_xmlhttpRequest({
                method: 'GET',
                url: finalUrl + (finalUrl.includes('?') ? '&' : '?') + 't=' + Date.now(),
                timeout: 15000,
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
                onload: resp => {
                    if (!running) return;

                    activePageTasks--;
                    processedPages++;

                    if (resp.status === 200) {
                        let html = resp.responseText.toLowerCase();
                        html = html.replace(/href="(.*?)"/gi, '');

                        const foundRaw = infringementWords.filter(w => {
                            const word = w.toLowerCase();
                            const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
                            return regex.test(html);
                        });

                        const found = foundRaw.filter(w => {
                            const word = w.toLowerCase();
                            return !reverseInfringementWords.some(r => {
                                const reverseWord = r.toLowerCase();
                                const reverseRegex = new RegExp('\\b' + reverseWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
                                return word.includes(reverseWord) && reverseRegex.test(html);
                            });
                        });

                        if (found.length) {
                            console.log(`[InfringementDetector] 在 ${finalUrl} 找到侵权词：`, found);
                            results.push({
                                page: finalUrl,
                                words: found.join(', '),
                                sitemap: '是的'
                            });
                            ui.update();
                        }
                    }

                    // 检查是否完成所有页面
                    if (processedPages >= totalPages && activePageTasks === 0) {
                        completeSiteProcessing(siteIndex);
                    } else {
                        // 启动下一个页面任务
                        const nextPageIndex = processedPages + activePageTasks;
                        if (nextPageIndex < totalPages && activePageTasks < maxConcurrentPages) {
                            processPage(nextPageIndex);
                        }
                    }
                },
                onerror: err => {
                    if (!running) return;

                    activePageTasks--;
                    processedPages++;
                    console.error(`[InfringementDetector] 页面请求失败：${finalUrl}`, err);

                    // 检查是否完成所有页面
                    if (processedPages >= totalPages && activePageTasks === 0) {
                        completeSiteProcessing(siteIndex);
                    } else {
                        // 启动下一个页面任务
                        const nextPageIndex = processedPages + activePageTasks;
                        if (nextPageIndex < totalPages && activePageTasks < maxConcurrentPages) {
                            processPage(nextPageIndex);
                        }
                    }
                }
            });
        }

        // 启动初始的并发页面任务
        const initialTasks = Math.min(maxConcurrentPages, totalPages);
        for (let i = 0; i < initialTasks; i++) {
            processPage(i);
        }
    }

    function completeSiteProcessing(siteIndex) {
        activeTasks--;
        processedSites++;
        console.log(`[InfringementDetector] 完成网站 ${siteIndex + 1}/${totalSites}`);
        ui.update();

        // 启动下一个网站任务
        startNextSite();

        // 检查是否所有网站都完成了
        checkAllSitesComplete();
    }

    function downloadResults() {
        console.log('[InfringementDetector] 开始下载结果，共', results.length, '条记录');
        running = false;
        ui.btn.innerText = '开始检测';

        const wb = XLSX.utils.book_new();
        const wsData = [['侵权页面url', '侵权词', '是否有sitemap.xml'], ...results.map(r => [r.page, r.words, r.sitemap || ''])];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

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
