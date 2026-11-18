import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    FIREBASE_CONFIG,
    AUTH_KEYS,
    verifyPassword,
    safeSessionGet,
    safeSessionSet,
    safeSessionRemove,
    escapeHtml,
    sanitizeColor,
    normalizeExternalUrl,
    cleanProjectDescription,
    analyzeProjectAccess,
    parseTags,
    formatReleaseDate,
    getSortableTimestamp,
    getCreatorsList,
    detectInAppBrowser
} from "./portfolio-shared.js";

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

const state = {
    projects: [],
    categories: [],
    categoriesById: {},
    platforms: {},
    projectsById: {},
    categoryFilter: "all",
    creatorFilter: "all",
    platformFilter: "all",
    searchQuery: "",
    sortBy: "standard",
    viewMode: readLocalPref("portfolio_view_mode", "grid"),
    showManageLinks: readManageLinksDefault(),
    initialized: false
};

function readLocalPref(key, fallback) {
    try {
        return globalThis.localStorage?.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}

function writeLocalPref(key, value) {
    try {
        globalThis.localStorage?.setItem(key, value);
    } catch {
        // Ignore storage errors
    }
}

function readManageLinksDefault() {
    const saved = readLocalPref("portfolio_show_manage_links", "");
    if (saved === "true") return true;
    if (saved === "false") return false;
    return globalThis.innerWidth >= 768;
}

const SVG_ICONS = {
    lp: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    form: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    sheet: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line></svg>`,
    edit: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`
};

function setupAuthAndBoot() {
    const lockScreen = document.getElementById("lock-screen");
    const mainContent = document.getElementById("main-content");
    const lockForm = document.getElementById("lock-form");
    const lockInput = document.getElementById("lock-password");
    const lockError = document.getElementById("lock-error");
    const togglePassBtn = document.getElementById("toggle-lock-pass");
    const relockBtn = document.getElementById("btn-relock");

    if (togglePassBtn && lockInput) {
        togglePassBtn.addEventListener("click", () => {
            const nextType = lockInput.type === "password" ? "text" : "password";
            lockInput.type = nextType;
            togglePassBtn.textContent = nextType === "password" ? "👁️" : "🙈";
            togglePassBtn.setAttribute(
                "aria-label",
                nextType === "password" ? "パスワードを表示" : "パスワードを隠す"
            );
        });
    }

    const unlockView = () => {
        lockScreen.style.display = "none";
        mainContent.style.display = "block";
        if (!state.initialized) {
            state.initialized = true;
            initPortfolio();
        }
    };

    if (
        safeSessionGet(AUTH_KEYS.VIEW) === "true" ||
        safeSessionGet(AUTH_KEYS.ADMIN) === "true"
    ) {
        unlockView();
    }

    lockForm.addEventListener("submit", async e => {
        e.preventDefault();
        lockError.textContent = "";
        const ok = await verifyPassword(lockInput.value);
        if (ok) {
            safeSessionSet(AUTH_KEYS.VIEW, "true");
            lockInput.value = "";
            unlockView();
        } else {
            lockError.textContent = "パスワードが違います（前後スペースや全角・半角をご確認ください）";
        }
    });

    if (relockBtn) {
        relockBtn.addEventListener("click", () => {
            safeSessionRemove(AUTH_KEYS.VIEW);
            safeSessionRemove(AUTH_KEYS.ADMIN);
            mainContent.style.display = "none";
            lockScreen.style.display = "flex";
            lockInput.focus();
        });
    }
}

function setupInAppBrowserBanner() {
    const inApp = detectInAppBrowser();
    const banner = document.getElementById("inapp-banner");
    if (!inApp || !banner) return;

    const nameEl = document.getElementById("inapp-name");
    if (nameEl) nameEl.textContent = inApp;
    banner.style.display = "flex";

    document.getElementById("btn-copy-page-url")?.addEventListener("click", async e => {
        const btn = e.currentTarget;
        const copied = await copyText(globalThis.location.href);
        btn.textContent = copied ? "✅ コピーしました" : "URLを選択してコピーしてください";
        setTimeout(() => {
            btn.textContent = "📋 このURLをコピー";
        }, 2000);
    });

    document.getElementById("btn-dismiss-inapp")?.addEventListener("click", () => {
        banner.style.display = "none";
    });
}

async function copyText(text) {
    try {
        await globalThis.navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

async function initPortfolio() {
    setupInAppBrowserBanner();
    setupControls();
    setupModalEvents();
    setupBackToTop();

    const loading = document.getElementById("loading");
    try {
        const [catSnap, platSnap, projSnap] = await Promise.all([
            getDocs(collection(db, "categories")),
            getDocs(collection(db, "platforms")),
            getDocs(collection(db, "projects"))
        ]);

        state.categories = [];
        state.categoriesById = {};
        catSnap.forEach(docSnap => {
            const c = { id: docSnap.id, ...docSnap.data() };
            state.categories.push(c);
            state.categoriesById[c.id] = c;
        });
        state.categories.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        state.platforms = {};
        platSnap.forEach(docSnap => {
            state.platforms[docSnap.id] = docSnap.data();
        });

        const rawProjects = [];
        projSnap.forEach(docSnap => {
            rawProjects.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Assign stable Global IDs (Oldest = 1) based on createdAt ASC
        const sortedByCreatedAsc = [...rawProjects].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime() || 0;
            const dateB = new Date(b.createdAt || 0).getTime() || 0;
            return dateA - dateB;
        });

        const idMap = {};
        sortedByCreatedAsc.forEach((p, idx) => {
            idMap[p.id] = idx + 1;
        });

        state.projectsById = {};
        state.projects = rawProjects.map(p => {
            const access = analyzeProjectAccess(p);
            const creators = getCreatorsList(p);
            const tags = parseTags(p.tags);
            const cleanDesc = cleanProjectDescription(p.description);
            const deployPlatId = p.deployPlatformId || p.platformId || "";
            const codePlatId = p.codePlatformId || "";
            const deployPlat = state.platforms[deployPlatId] || { name: "-", color: "#64748b" };
            const codePlat = codePlatId ? state.platforms[codePlatId] || null : null;
            const releaseDateText = formatReleaseDate(p);
            const globalIndex = idMap[p.id];

            const enriched = {
                ...p,
                _globalIndex: globalIndex,
                _creators: creators,
                _tags: tags,
                _cleanDesc: cleanDesc,
                _access: access,
                _deployPlatId: deployPlatId,
                _codePlatId: codePlatId,
                _deployPlat: deployPlat,
                _codePlat: codePlat,
                _releaseDateText: releaseDateText,
                _sortTimestamp: getSortableTimestamp(p),
                _searchText: [
                    String(globalIndex),
                    `#${globalIndex}`,
                    p.title || "",
                    cleanDesc,
                    tags.join(" "),
                    creators.join(" "),
                    deployPlat.name || "",
                    codePlat?.name || "",
                    state.categoriesById[p.categoryId]?.name || "",
                    releaseDateText
                ]
                    .join(" ")
                    .toLowerCase()
            };
            state.projectsById[p.id] = enriched;
            return enriched;
        });

        populatePlatformSelect();
        renderCategoryFilters();
        syncViewControlsUI();
        renderProjects();
        loading.style.display = "none";
    } catch (err) {
        console.error(err);
        loading.innerHTML = `<p class="error-message">読み込みエラーが発生しました: ${escapeHtml(err.message)}</p>`;
    }
}

function populatePlatformSelect() {
    const select = document.getElementById("platform-filter");
    if (!select) return;

    const usedPlatformIds = new Set();
    for (const p of state.projects) {
        if (p._deployPlatId && state.platforms[p._deployPlatId]) {
            usedPlatformIds.add(p._deployPlatId);
        }
        if (p._codePlatId && state.platforms[p._codePlatId]) {
            usedPlatformIds.add(p._codePlatId);
        }
    }

    const sortedIds = Array.from(usedPlatformIds).sort((a, b) =>
        String(state.platforms[a]?.name || "").localeCompare(
            String(state.platforms[b]?.name || ""),
            "ja"
        )
    );

    select.innerHTML =
        `<option value="all">🖥️ すべての基盤</option>` +
        sortedIds
            .map(
                id =>
                    `<option value="${escapeHtml(id)}">🖥️ ${escapeHtml(
                        state.platforms[id].name
                    )}</option>`
            )
            .join("");
}

function renderCategoryFilters() {
    const container = document.getElementById("filter-section");
    if (!container) return;

    const counts = { all: state.projects.length };
    for (const c of state.categories) counts[c.id] = 0;
    for (const p of state.projects) {
        if (p.categoryId && counts[p.categoryId] !== undefined) {
            counts[p.categoryId]++;
        }
    }

    const buttons = [
        { id: "all", name: "すべて", count: counts.all },
        ...state.categories.map(c => ({
            id: c.id,
            name: c.name || "未設定",
            count: counts[c.id] || 0
        }))
    ];

    container.innerHTML = buttons
        .map(btn => {
            const isActive = state.categoryFilter === btn.id;
            return `<button type="button" class="filter-btn${isActive ? " active" : ""}" data-cat-id="${escapeHtml(
                btn.id
            )}" aria-pressed="${isActive}">
                <span>${escapeHtml(btn.name)}</span>
                <span class="filter-count">${btn.count}</span>
            </button>`;
        })
        .join("");
}

function setupControls() {
    const filterSection = document.getElementById("filter-section");
    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    const creatorSelect = document.getElementById("creator-filter");
    const platformSelect = document.getElementById("platform-filter");
    const sortSelect = document.getElementById("sort-select");
    const resetBtn = document.getElementById("btn-reset-filters");
    const manageToggle = document.getElementById("toggle-manage-links");
    const btnGrid = document.getElementById("layout-grid");
    const btnList = document.getElementById("layout-list");
    const grid = document.getElementById("projects-grid");

    filterSection?.addEventListener("click", e => {
        const btn = e.target.closest(".filter-btn");
        if (!btn) return;
        state.categoryFilter = btn.dataset.catId || "all";
        filterSection.querySelectorAll(".filter-btn").forEach(b => {
            const active = b === btn;
            b.classList.toggle("active", active);
            b.setAttribute("aria-pressed", String(active));
        });
        btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        renderProjects();
    });

    searchInput?.addEventListener("input", () => {
        state.searchQuery = searchInput.value.trim();
        if (searchClear) {
            searchClear.style.display = state.searchQuery ? "inline-flex" : "none";
        }
        renderProjects();
    });

    searchClear?.addEventListener("click", () => {
        searchInput.value = "";
        state.searchQuery = "";
        searchClear.style.display = "none";
        searchInput.focus();
        renderProjects();
    });

    creatorSelect?.addEventListener("change", () => {
        state.creatorFilter = creatorSelect.value;
        renderProjects();
    });

    platformSelect?.addEventListener("change", () => {
        state.platformFilter = platformSelect.value;
        renderProjects();
    });

    sortSelect?.addEventListener("change", () => {
        state.sortBy = sortSelect.value;
        renderProjects();
    });

    resetBtn?.addEventListener("click", () => {
        state.categoryFilter = "all";
        state.creatorFilter = "all";
        state.platformFilter = "all";
        state.searchQuery = "";
        state.sortBy = "standard";
        if (searchInput) searchInput.value = "";
        if (searchClear) searchClear.style.display = "none";
        if (creatorSelect) creatorSelect.value = "all";
        if (platformSelect) platformSelect.value = "all";
        if (sortSelect) sortSelect.value = "standard";
        renderCategoryFilters();
        renderProjects();
    });

    manageToggle?.addEventListener("click", () => {
        state.showManageLinks = !state.showManageLinks;
        writeLocalPref("portfolio_show_manage_links", String(state.showManageLinks));
        syncViewControlsUI();
        renderProjects();
    });

    btnGrid?.addEventListener("click", () => {
        state.viewMode = "grid";
        writeLocalPref("portfolio_view_mode", "grid");
        syncViewControlsUI();
    });

    btnList?.addEventListener("click", () => {
        state.viewMode = "list";
        writeLocalPref("portfolio_view_mode", "list");
        syncViewControlsUI();
    });

    grid?.addEventListener("click", e => {
        const detailBtn = e.target.closest("[data-open-detail]");
        if (detailBtn) {
            openDetailModal(detailBtn.dataset.openDetail);
            return;
        }
        const tagBtn = e.target.closest("[data-tag-filter]");
        if (tagBtn && searchInput) {
            const tag = tagBtn.dataset.tagFilter || "";
            searchInput.value = tag;
            state.searchQuery = tag;
            if (searchClear) searchClear.style.display = tag ? "inline-flex" : "none";
            renderProjects();
        }
        const emptyReset = e.target.closest("[data-empty-reset]");
        if (emptyReset) {
            resetBtn?.click();
        }
    });
}

function syncViewControlsUI() {
    const grid = document.getElementById("projects-grid");
    const manageToggle = document.getElementById("toggle-manage-links");
    const btnGrid = document.getElementById("layout-grid");
    const btnList = document.getElementById("layout-list");

    if (grid) {
        grid.classList.toggle("view-grid", state.viewMode === "grid");
        grid.classList.toggle("view-list", state.viewMode === "list");
    }
    if (manageToggle) {
        manageToggle.classList.toggle("active", state.showManageLinks);
        manageToggle.setAttribute("aria-pressed", String(state.showManageLinks));
    }
    if (btnGrid && btnList) {
        btnGrid.classList.toggle("active", state.viewMode === "grid");
        btnList.classList.toggle("active", state.viewMode === "list");
    }
}

function getFilteredAndSortedProjects() {
    const q = state.searchQuery.toLowerCase();

    const filtered = state.projects.filter(p => {
        if (state.categoryFilter !== "all" && p.categoryId !== state.categoryFilter) {
            return false;
        }

        if (state.creatorFilter === "collab") {
            if (p._creators.length < 2) return false;
        } else if (state.creatorFilter !== "all") {
            if (!p._creators.includes(state.creatorFilter)) return false;
        }

        if (state.platformFilter !== "all") {
            if (
                p._deployPlatId !== state.platformFilter &&
                p._codePlatId !== state.platformFilter
            ) {
                return false;
            }
        }

        if (q) {
            const terms = q.split(/\s+/).filter(Boolean);
            for (const term of terms) {
                if (!p._searchText.includes(term)) return false;
            }
        }

        return true;
    });

    if (state.sortBy === "newest") {
        filtered.sort(
            (a, b) => b._sortTimestamp - a._sortTimestamp || b._globalIndex - a._globalIndex
        );
    } else if (state.sortBy === "oldest") {
        filtered.sort((a, b) => a._globalIndex - b._globalIndex);
    } else {
        // Standard: All = No.1 first; Category = Admin manual order
        if (state.categoryFilter === "all") {
            filtered.sort((a, b) => a._globalIndex - b._globalIndex);
        } else {
            filtered.sort(
                (a, b) => (a.order ?? 999) - (b.order ?? 999) || a._globalIndex - b._globalIndex
            );
        }
    }

    return filtered;
}

function renderProjects() {
    const grid = document.getElementById("projects-grid");
    const countText = document.getElementById("results-count");
    const resetBtn = document.getElementById("btn-reset-filters");
    if (!grid) return;

    const targets = getFilteredAndSortedProjects();
    const hasActiveFilter =
        state.categoryFilter !== "all" ||
        state.creatorFilter !== "all" ||
        state.platformFilter !== "all" ||
        Boolean(state.searchQuery) ||
        state.sortBy !== "standard";

    if (countText) {
        countText.textContent = `表示中: ${targets.length} / ${state.projects.length} 件`;
    }
    if (resetBtn) {
        resetBtn.style.display = hasActiveFilter ? "inline-flex" : "none";
    }

    if (targets.length === 0) {
        grid.innerHTML = `
            <div class="no-projects">
                <p>条件に一致するプロジェクトが見つかりませんでした</p>
                <button type="button" class="btn-reset-filters" data-empty-reset="1">絞り込みをリセット</button>
            </div>`;
        return;
    }

    grid.innerHTML = targets.map(renderCardHtml).join("");
}

function renderCardHtml(p) {
    const deployColor = sanitizeColor(p._deployPlat.color, "#64748b");
    const codeColor = p._codePlat ? sanitizeColor(p._codePlat.color, "#475569") : "";
    const creatorsHtml = (p._creators.length ? p._creators : ["-"])
        .map(c => `<span class="creator-badge">👤 ${escapeHtml(c)}</span>`)
        .join("");

    const accessBadgesHtml = p._access.badges
        .map(
            b =>
                `<span class="access-badge access-${escapeHtml(b.type)}" title="${escapeHtml(
                    b.title
                )}">${escapeHtml(b.label)}</span>`
        )
        .join("");

    const { lpUrl, formUrl, sheetUrl, editUrl, hasPublicLink, hasManageLink, notices } =
        p._access;

    const links = [];
    if (lpUrl) {
        links.push(
            `<a href="${escapeHtml(
                lpUrl
            )}" target="_blank" rel="noopener noreferrer" class="project-link" title="公開サイト・アプリを開く">${SVG_ICONS.lp}<span>公開サイト</span></a>`
        );
    }
    if (formUrl) {
        links.push(
            `<a href="${escapeHtml(
                formUrl
            )}" target="_blank" rel="noopener noreferrer" class="project-link link-form" title="フォームを開く">${SVG_ICONS.form}<span>フォーム</span></a>`
        );
    }
    if (state.showManageLinks) {
        if (sheetUrl) {
            links.push(
                `<a href="${escapeHtml(
                    sheetUrl
                )}" target="_blank" rel="noopener noreferrer" class="project-link link-sheet" title="スプレッドシート / データ">${SVG_ICONS.sheet}<span>シート</span></a>`
            );
        }
        if (editUrl) {
            links.push(
                `<a href="${escapeHtml(
                    editUrl
                )}" target="_blank" rel="noopener noreferrer" class="project-link link-edit" title="編集画面 / ソースコード">${SVG_ICONS.edit}<span>編集・コード</span></a>`
            );
        }
    }

    let emptyLinkLabel = "";
    if (links.length === 0) {
        if (!hasPublicLink && hasManageLink && !state.showManageLinks) {
            emptyLinkLabel = `<span class="project-link disabled">内部管理リンクのみ（「管理リンク」ONで表示）</span>`;
        } else {
            emptyLinkLabel = `<span class="project-link disabled">公開リンクなし</span>`;
        }
    }

    const tagsHtml = p._tags.length
        ? `<div class="project-tags">${p._tags
              .map(
                  t =>
                      `<button type="button" class="tag" data-tag-filter="${escapeHtml(
                          t
                      )}" title="「${escapeHtml(t)}」で絞り込む">#${escapeHtml(t)}</button>`
              )
              .join("")}</div>`
        : "";

    const showReadMore = p._cleanDesc.length > 110 || notices.length > 0;

    return `
    <article class="project-card">
        <div class="project-card-top">
            <div class="project-header-row">
                <div class="project-title-group">
                    <h3>
                        <span class="display-id">${p._globalIndex}</span>
                        <button type="button" class="project-title-btn" data-open-detail="${escapeHtml(
                            p.id
                        )}">${escapeHtml(p.title || "無題のプロジェクト")}</button>
                    </h3>
                    <div class="project-meta">
                        ${creatorsHtml}
                        <span class="platform-badge-small" style="background:${deployColor};">🖥️ ${escapeHtml(
        p._deployPlat.name || "-"
    )}</span>
                        ${
                            p._codePlat
                                ? `<span class="platform-badge-small" style="background:${codeColor};">🔐 ${escapeHtml(
                                      p._codePlat.name
                                  )}</span>`
                                : ""
                        }
                        ${accessBadgesHtml}
                    </div>
                </div>
                ${
                    p._releaseDateText
                        ? `<div class="release-date">${escapeHtml(p._releaseDateText)}</div>`
                        : ""
                }
            </div>

            <p class="project-description">${escapeHtml(p._cleanDesc)}</p>
            ${
                showReadMore
                    ? `<button type="button" class="card-detail-trigger" data-open-detail="${escapeHtml(
                          p.id
                      )}">詳細・スマホ利用案内を見る →</button>`
                    : ""
            }
        </div>

        <div class="project-footer-row">
            <div class="project-links-group">
                ${links.join("") || emptyLinkLabel}
            </div>
            ${tagsHtml}
        </div>
    </article>`;
}

function linkifyEscapedText(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(
        /https?:\/\/[^\s<>"']+/g,
        rawMatch => {
            const clean = normalizeExternalUrl(rawMatch);
            if (!clean) return rawMatch;
            return `<a href="${escapeHtml(
                clean
            )}" target="_blank" rel="noopener noreferrer">${escapeHtml(clean)}</a>`;
        }
    );
}

function openDetailModal(projectId) {
    const p = state.projectsById[projectId];
    const backdrop = document.getElementById("detail-modal-backdrop");
    const titleEl = document.getElementById("detail-modal-title");
    const bodyEl = document.getElementById("detail-modal-body");
    if (!p || !backdrop || !titleEl || !bodyEl) return;

    const categoryName = state.categoriesById[p.categoryId]?.name || "未分類";
    const deployColor = sanitizeColor(p._deployPlat.color, "#64748b");
    const codeColor = p._codePlat ? sanitizeColor(p._codePlat.color, "#475569") : "";

    titleEl.innerHTML = `<span class="display-id">${p._globalIndex}</span> ${escapeHtml(
        p.title || ""
    )}`;

    const { lpUrl, formUrl, sheetUrl, editUrl, notices } = p._access;

    const urlRows = [];
    if (lpUrl) urlRows.push({ label: "🚀 公開サイト (LP)", url: lpUrl, cls: "" });
    if (formUrl) urlRows.push({ label: "📝 フォーム", url: formUrl, cls: "link-form" });
    if (sheetUrl) urlRows.push({ label: "📊 スプレッドシート", url: sheetUrl, cls: "link-sheet" });
    if (editUrl) urlRows.push({ label: "⚙️ 編集画面・コード", url: editUrl, cls: "link-edit" });

    bodyEl.innerHTML = `
        <div class="project-meta">
            <span class="creator-badge">📂 ${escapeHtml(categoryName)}</span>
            ${(p._creators.length ? p._creators : ["-"])
                .map(c => `<span class="creator-badge">👤 ${escapeHtml(c)}</span>`)
                .join("")}
            <span class="platform-badge-small" style="background:${deployColor};">🖥️ ${escapeHtml(
        p._deployPlat.name || "-"
    )}</span>
            ${
                p._codePlat
                    ? `<span class="platform-badge-small" style="background:${codeColor};">🔐 ${escapeHtml(
                          p._codePlat.name
                      )}</span>`
                    : ""
            }
            ${
                p._releaseDateText
                    ? `<span class="release-date">${escapeHtml(p._releaseDateText)}</span>`
                    : ""
            }
        </div>

        ${
            notices.length
                ? `<div class="detail-notice-box">💡 ${notices
                      .map(n => escapeHtml(n))
                      .join("<br>")}</div>`
                : ""
        }

        <div class="project-description" style="display:block; -webkit-line-clamp:unset; overflow:visible;">${linkifyEscapedText(
            p._cleanDesc || "説明はありません。"
        )}</div>

        ${
            urlRows.length
                ? `<div class="detail-url-list">
                    ${urlRows
                        .map(
                            r => `
                        <div class="detail-url-row">
                            <a href="${escapeHtml(
                                r.url
                            )}" target="_blank" rel="noopener noreferrer" class="project-link ${
                                r.cls
                            }">${escapeHtml(r.label)}</a>
                            <button type="button" class="btn-copy-url" data-copy-url="${escapeHtml(
                                r.url
                            )}">📋 URLをコピー</button>
                        </div>`
                        )
                        .join("")}
                </div>`
                : `<p style="color:var(--text-muted); font-size:0.9rem;">登録されているリンクはありません。</p>`
        }

        ${
            p._tags.length
                ? `<div class="project-tags">${p._tags
                      .map(
                          t =>
                              `<button type="button" class="tag" data-modal-tag="${escapeHtml(
                                  t
                              )}">#${escapeHtml(t)}</button>`
                      )
                      .join("")}</div>`
                : ""
        }
    `;

    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    document.getElementById("detail-modal-close")?.focus();
}

function closeDetailModal() {
    const backdrop = document.getElementById("detail-modal-backdrop");
    if (!backdrop) return;
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
}

function setupModalEvents() {
    const backdrop = document.getElementById("detail-modal-backdrop");
    const closeBtn = document.getElementById("detail-modal-close");

    closeBtn?.addEventListener("click", closeDetailModal);
    backdrop?.addEventListener("click", async e => {
        if (e.target === backdrop) {
            closeDetailModal();
            return;
        }
        const copyBtn = e.target.closest("[data-copy-url]");
        if (copyBtn) {
            const ok = await copyText(copyBtn.dataset.copyUrl || "");
            copyBtn.textContent = ok ? "✅ コピー完了" : "コピー失敗";
            setTimeout(() => {
                copyBtn.textContent = "📋 URLをコピー";
            }, 1800);
            return;
        }
        const tagBtn = e.target.closest("[data-modal-tag]");
        if (tagBtn) {
            const tag = tagBtn.dataset.modalTag || "";
            const searchInput = document.getElementById("search-input");
            const searchClear = document.getElementById("search-clear");
            if (searchInput) searchInput.value = tag;
            if (searchClear) searchClear.style.display = tag ? "inline-flex" : "none";
            state.searchQuery = tag;
            closeDetailModal();
            renderProjects();
        }
    });

    globalThis.addEventListener("keydown", e => {
        if (e.key === "Escape" && backdrop?.classList.contains("open")) {
            closeDetailModal();
        }
    });
}

function setupBackToTop() {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;

    globalThis.addEventListener(
        "scroll",
        () => {
            btn.classList.toggle("visible", globalThis.scrollY > 450);
        },
        { passive: true }
    );

    btn.addEventListener("click", () => {
        globalThis.scrollTo({ top: 0, behavior: "smooth" });
    });
}

setupAuthAndBoot();
