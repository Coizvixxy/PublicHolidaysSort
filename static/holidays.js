/* ==========================================================================
   澳門公眾假期 — 前端邏輯
   資料由後端解析後內嵌於 #bootstrap-data，年份切換走 /api/holidays。
   ========================================================================== */

(function () {
    "use strict";

    var MONTH_NAMES = [
        "1月", "2月", "3月", "4月", "5月", "6月",
        "7月", "8月", "9月", "10月", "11月", "12月"
    ];
    var MONTH_EN = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
        "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
    ];

    var state = { holidays: [], meta: null, error: null, highlight: null };

    /* ---------------------- 工具 ---------------------- */

    function $(sel) { return document.querySelector(sel); }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    function todayStr() {
        var now = new Date();
        var m = String(now.getMonth() + 1).padStart(2, "0");
        var d = String(now.getDate()).padStart(2, "0");
        return now.getFullYear() + "-" + m + "-" + d;
    }

    function formatSlash(iso) { return iso.replace(/-/g, "/"); }

    function toast(message, type, detail) {
        var box = $("#toast");
        if (!box) {
            box = document.createElement("div");
            box.id = "toast";
            box.className = "toast";
            box.setAttribute("role", "status");
            document.body.appendChild(box);
        }
        var icon = type === "error" ? "✕" : type === "warn" ? "!" : "✓";
        box.className = "toast" + (type ? " " + type : "");
        box.innerHTML =
            '<span class="toast-icon">' + icon + "</span><span>" + escapeHtml(message) + "</span>" +
            (detail ? ' <code>' + escapeHtml(detail) + "</code>" : "");
        clearTimeout(box._timer);
        // 強制重繪以重播動畫
        box.classList.remove("show");
        void box.offsetWidth;
        box.classList.add("show");
        box._timer = setTimeout(function () { box.classList.remove("show"); }, 2600);
    }

    function copyText(text) {
        // 優先用 Clipboard API；被拒絕（如無使用者手勢、權限限制）時降級 execCommand
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).catch(function () {
                return copyViaExecCommand(text);
            });
        }
        return copyViaExecCommand(text)
            ? Promise.resolve()
            : Promise.reject(new Error("copy failed"));
    }

    function copyViaExecCommand(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        document.body.removeChild(ta);
        return ok;
    }

    /* ---------------------- 渲染 ---------------------- */

    function renderStats() {
        var meta = state.meta || {};
        $("#display-year").textContent = meta.year || "—";
        $("#stat-total").textContent = meta.count || 0;
        var link = $("#source-link");
        if (meta.url) { link.href = meta.url; }
        $("#fetched-at").textContent = meta.fetched_at ? "更新於 " + meta.fetched_at : "";

        var mandatory = 0, compensate = 0, half = 0;
        state.holidays.forEach(function (h) {
            if (h.category === "half" || h.half_day) half++;
            else if (h.category === "compensate") compensate++;
            if (h.mandatory) mandatory++;
        });
        $("#stat-chips").innerHTML =
            statChip(mandatory, "強制性假日", "mandatory") +
            statChip(compensate, "補假日", "compensate") +
            statChip(half, "半天假", "half");
    }

    function statChip(value, label, cls) {
        return (
            '<div class="stat-chip' + (cls ? " " + cls : "") + '"><b>' + value +
            "</b><span>" + escapeHtml(label) + "</span></div>"
        );
    }

    function renderNextHoliday() {
        var box = $("#next-holiday");
        var today = todayStr();
        var upcoming = state.holidays.filter(function (h) { return h.date >= today; });

        if (!state.holidays.length) { box.hidden = true; return; }
        box.hidden = false;

        if (!upcoming.length) {
            box.classList.remove("is-today");
            box.querySelector(".next-label").textContent = "本年度假期";
            box.querySelector(".next-name").textContent = "已全部結束";
            box.querySelector(".next-countdown").textContent = "期待下一年吧 ✨";
            return;
        }

        var next = upcoming[0];
        var days = Math.round(
            (new Date(next.date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000
        );
        box.querySelector(".next-label").textContent = "下一個假期";
        box.querySelector(".next-name").textContent = next.name;
        box.querySelector(".next-countdown").textContent = days === 0
            ? "🎉 就是今天！"
            : "還有 " + days + " 天 · " + next.date_display + " " + next.weekday;
        box.classList.toggle("is-today", days === 0);
    }

    function itemBadges(h) {
        var out = "";
        if (h.mandatory) out += '<span class="badge badge-mandatory">強制</span>';
        if (h.category === "compensate") out += '<span class="badge badge-compensate">補假</span>';
        if (h.category === "half" || h.half_day) out += '<span class="badge badge-half">半天</span>';
        return out;
    }

    function renderGrid() {
        var today = todayStr();
        var grid = $("#month-grid");
        var html = "";

        for (var m = 1; m <= 12; m++) {
            var items = state.holidays.filter(function (h) {
                return parseInt(h.date.slice(5, 7), 10) === m;
            });
            var listHtml = items.map(function (h) {
                var day = parseInt(h.date.slice(8, 10), 10);
                var cls = ["holiday-item"];
                if (h.date < today) cls.push("past");
                if (h.date === today) cls.push("today");
                return (
                    '<li class="' + cls.join(" ") + '" data-copy="' +
                    escapeHtml(formatSlash(h.date) + " · " + h.name) + '" tabindex="0" role="button" title="點擊複製">' +
                    '<div class="date-block"><b>' + day + "</b><span>" + MONTH_NAMES[m - 1] + "</span></div>" +
                    '<div class="holiday-info">' +
                    '<p class="holiday-name">' + escapeHtml(h.name) + "</p>" +
                    '<p class="holiday-meta"><span class="weekday">' + escapeHtml(h.weekday) + "</span>" +
                    itemBadges(h) + "</p></div></li>"
                );
            }).join("");

            html +=
                '<section class="month-card' + (items.length ? "" : " empty") + '" id="month-' + m + '">' +
                '<div class="month-head"><h2 class="month-name">' + MONTH_NAMES[m - 1] +
                "<small>" + MONTH_EN[m - 1] + "</small></h2>" +
                (items.length
                    ? '<span class="month-count">' + items.length + ' 日</span>'
                    : "") +
                "</div>" +
                (items.length
                    ? '<ul class="holiday-list">' + listHtml + "</ul>"
                    : '<p class="empty-note">本月無假期</p>') +
                "</section>";
        }
        grid.innerHTML = html;
        applyHighlight();
        applySearch();
    }

    function renderYearPills() {
        var box = $("#year-pills");
        var years = (box.dataset.years || "2024,2025,2026,2027").split(",").map(Number);
        var current = state.meta ? state.meta.year : null;
        if (current && years.indexOf(current) === -1) years.push(current);
        years.sort();
        box.innerHTML = years.map(function (y) {
            return '<button type="button" class="year-pill' + (y === current ? " active" : "") +
                '" data-year="' + y + '">' + y + "</button>";
        }).join("");
    }

    function renderAll() {
        renderStats();
        renderNextHoliday();
        renderYearPills();
        renderGrid();

        var banner = $("#error-banner");
        if (state.error) {
            banner.textContent = "⚠️ " + state.error;
            banner.hidden = false;
        } else {
            banner.hidden = true;
        }
        document.title = "澳門公眾假期 " + (state.meta ? state.meta.year : "") + " 年一覽";
    }

    /* ---------------------- 資料載入 ---------------------- */

    function load(url) {
        var page = $(".page");
        page.classList.add("loading");
        fetch(url, { headers: { Accept: "application/json" } })
            .then(function (res) {
                return res.json().then(function (data) { return { ok: res.ok, data: data }; });
            })
            .then(function (result) {
                var data = result.data;
                state.error = data.error;
                if (!state.error) {
                    state.holidays = data.holidays || [];
                    state.meta = data.meta;
                }
                renderAll();
                if (state.error) toast("載入失敗", "error");
                else toast("已載入 " + state.meta.year + " 年資料，共 " + state.meta.count + " 日", "success");
            })
            .catch(function () {
                toast("網路請求失敗", "error");
            })
            .finally(function () { page.classList.remove("loading"); });
    }

    /* ---------------------- 互動 ---------------------- */

    function applyHighlight() {
        var range = state.highlight;
        document.querySelectorAll(".month-card").forEach(function (card) {
            var m = parseInt(card.id.replace("month-", ""), 10);
            card.classList.toggle("highlighted", !!(range && m >= range[0] && m <= range[1]));
        });
    }

    function applySearch() {
        var keyword = ($("#search-input").value || "").trim().toLowerCase();
        var visibleCount = 0;
        document.querySelectorAll(".month-card").forEach(function (card) {
            if (!card.classList.contains("empty")) {
                var anyVisible = false;
                card.querySelectorAll(".holiday-item").forEach(function (item) {
                    var text = (item.textContent || "").toLowerCase();
                    var match = !keyword || text.indexOf(keyword) !== -1;
                    item.style.display = match ? "" : "none";
                    if (match) anyVisible = true;
                });
                card.classList.toggle("hidden", keyword && !anyVisible);
                if (!keyword || anyVisible) visibleCount++;
            } else {
                card.classList.toggle("hidden", !!keyword);
            }
        });
        var msg = $("#no-results");
        if (keyword && visibleCount === 0) {
            if (!msg) {
                msg = document.createElement("p");
                msg.id = "no-results";
                msg.style.cssText = "grid-column:1/-1;text-align:center;color:var(--text-faint);padding:40px 0;margin:0";
                $("#month-grid").appendChild(msg);
            }
            msg.textContent = "沒有符合「" + keyword + "」的假期";
        } else if (msg) {
            msg.remove();
        }
    }

    function bindEvents() {
        // 年份切換
        $("#year-pills").addEventListener("click", function (e) {
            var btn = e.target.closest(".year-pill");
            if (!btn || btn.classList.contains("active")) return;
            var year = btn.dataset.year;
            history.replaceState(null, "", "/?year=" + year);
            load("/api/holidays?year=" + encodeURIComponent(year));
        });

        // 自訂網址
        $("#url-form").addEventListener("submit", function (e) {
            e.preventDefault();
            var url = $("#url-input").value.trim();
            if (!url) { toast("請輸入網址", "warn"); return; }
            load("/api/holidays?url=" + encodeURIComponent(url));
        });

        // 搜尋
        var searchTimer;
        $("#search-input").addEventListener("input", function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(applySearch, 120);
        });

        // 月份高亮
        var startSel = $("#start-month"), endSel = $("#end-month");
        [startSel, endSel].forEach(function (sel) {
            for (var m = 1; m <= 12; m++) {
                var opt = document.createElement("option");
                opt.value = m;
                opt.textContent = MONTH_NAMES[m - 1];
                sel.appendChild(opt);
            }
        });
        startSel.value = "1"; endSel.value = "12";

        $("#highlight-btn").addEventListener("click", function () {
            var s = parseInt(startSel.value, 10), t = parseInt(endSel.value, 10);
            if (s > t) { toast("開始月份不能晚於結束月份", "warn"); return; }
            state.highlight = [s, t];
            applyHighlight();
            toast("已高亮 " + MONTH_NAMES[s - 1] + " 至 " + MONTH_NAMES[t - 1], "success");
        });
        $("#clear-highlight-btn").addEventListener("click", function () {
            state.highlight = null;
            applyHighlight();
        });

        // 點擊複製（事件委託）
        $("#month-grid").addEventListener("click", function (e) {
            var item = e.target.closest(".holiday-item");
            if (!item) return;
            copyText(item.dataset.copy).then(
                function () {
                    item.classList.add("copied");
                    setTimeout(function () { item.classList.remove("copied"); }, 900);
                    toast("已複製", "success", item.dataset.copy);
                },
                function () { toast("複製失敗", "error"); }
            );
        });
        $("#month-grid").addEventListener("keydown", function (e) {
            if (e.key !== "Enter" && e.key !== " ") return;
            var item = e.target.closest(".holiday-item");
            if (item) { e.preventDefault(); item.click(); }
        });

        // 複製全部
        $("#copy-all-btn").addEventListener("click", function () {
            if (!state.holidays.length) { toast("目前沒有資料", "warn"); return; }
            var text = state.holidays.map(function (h) {
                return formatSlash(h.date) + "（" + h.weekday + "）" + h.name;
            }).join("\n");
            copyText(text).then(
                function () { toast("已複製全部 " + state.holidays.length + " 日", "success"); },
                function () { toast("複製失敗", "error"); }
            );
        });

        // 主題切換
        var themeBtn = $("#theme-toggle");
        function applyTheme(theme) {
            document.documentElement.dataset.theme = theme;
            themeBtn.textContent = theme === "dark" ? "☀️ 淺色模式" : "🌙 深色模式";
            try { localStorage.setItem("holiday-theme", theme); } catch (err) { /* 忽略 */ }
        }
        var saved = null;
        try { saved = localStorage.getItem("holiday-theme"); } catch (err) { /* 忽略 */ }
        applyTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
        themeBtn.addEventListener("click", function () {
            applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
        });
    }

    /* ---------------------- 啟動 ---------------------- */

    document.addEventListener("DOMContentLoaded", function () {
        var raw = $("#bootstrap-data");
        if (raw) {
            try {
                var payload = JSON.parse(raw.textContent);
                state.holidays = payload.holidays || [];
                state.meta = payload.meta;
                state.error = payload.error;
            } catch (err) {
                state.error = "初始資料解析失敗";
            }
        }
        bindEvents();
        renderAll();
        if (state.error) toast("載入失敗", "error");
    });
})();
