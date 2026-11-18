import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    updateDoc,
    doc,
    onSnapshot,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
    inspectProjectDataIssues,
    getCreatorsList
} from "./portfolio-shared.js";

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

const state = {
    subscribed: false,
    projects: [],
    projectsMap: {},
    categories: [],
    categoriesMap: {},
    platforms: [],
    platformsMap: {},
    searchQuery: "",
    categoryFilter: "all",
    detectedIssues: []
};

function setupAuth() {
    const overlay = document.getElementById("login-overlay");
    const adminApp = document.getElementById("admin-app");
    const loginForm = document.getElementById("admin-login-form");
    const passInput = document.getElementById("password-input");
    const errorEl = document.getElementById("login-error");
    const toggleBtn = document.getElementById("toggle-admin-pass");
    const logoutBtn = document.getElementById("btn-logout");

    toggleBtn?.addEventListener("click", () => {
        const nextType = passInput.type === "password" ? "text" : "password";
        passInput.type = nextType;
        toggleBtn.textContent = nextType === "password" ? "👁️" : "🙈";
    });

    const showAdmin = () => {
        overlay.style.display = "none";
        adminApp.style.display = "block";
        subscribeData();
    };

    if (safeSessionGet(AUTH_KEYS.ADMIN) === "true") {
        showAdmin();
    }

    loginForm?.addEventListener("submit", async e => {
        e.preventDefault();
        errorEl.style.display = "none";
        errorEl.textContent = "";

        const ok = await verifyPassword(passInput.value);
        if (ok) {
            safeSessionSet(AUTH_KEYS.ADMIN, "true");
            safeSessionSet(AUTH_KEYS.VIEW, "true");
            passInput.value = "";
            showAdmin();
        } else {
            errorEl.textContent = "パスワードが違います（前後スペースや全角・半角をご確認ください）";
            errorEl.style.display = "block";
        }
    });

    logoutBtn?.addEventListener("click", () => {
        safeSessionRemove(AUTH_KEYS.ADMIN);
        globalThis.location.reload();
    });
}

function setupAdminUIEvents() {
    // Tabs
    document.querySelector(".admin-tabs")?.addEventListener("click", e => {
        const btn = e.target.closest("[data-tab]");
        if (!btn) return;
        const tabId = btn.dataset.tab;
        document.querySelectorAll(".tab-content").forEach(el => {
            el.style.display = "none";
        });
        const target = document.getElementById(`tab-${tabId}`);
        if (target) target.style.display = "block";
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    });

    // Search & filter in projects list
    const searchInput = document.getElementById("admin-search-input");
    const catFilter = document.getElementById("admin-cat-filter");

    searchInput?.addEventListener("input", () => {
        state.searchQuery = searchInput.value.trim().toLowerCase();
        renderAdminProjectsList();
    });

    catFilter?.addEventListener("change", () => {
        state.categoryFilter = catFilter.value;
        renderAdminProjectsList();
    });

    // Save order
    document.getElementById("btn-save-order")?.addEventListener("click", saveOrder);

    // Export JSON backup
    document.getElementById("btn-export-backup")?.addEventListener("click", downloadBackupJson);

    // Auto-repair Firestore issues
    document.getElementById("btn-repair-issues")?.addEventListener("click", repairAllDetectedIssues);

    // Cancel edit buttons
    document.getElementById("cancel-edit-btn")?.addEventListener("click", () => resetForm("project"));
    document.getElementById("cat-cancel-btn")?.addEventListener("click", () => resetForm("category"));
    document.getElementById("plat-cancel-btn")?.addEventListener("click", () => resetForm("platform"));

    // Delegated actions on lists
    document.getElementById("admin-projects-list")?.addEventListener("click", e => {
        const editBtn = e.target.closest("[data-edit-project]");
        if (editBtn) {
            editProject(editBtn.dataset.editProject);
            return;
        }
        const delBtn = e.target.closest("[data-del-project]");
        if (delBtn) {
            deleteItem("projects", delBtn.dataset.delProject);
            return;
        }
        const moveBtn = e.target.closest("[data-move-dir]");
        if (moveBtn) {
            moveRow(moveBtn.closest(".admin-item"), Number(moveBtn.dataset.moveDir));
        }
    });

    document.getElementById("admin-categories-list")?.addEventListener("click", e => {
        const editBtn = e.target.closest("[data-edit-category]");
        if (editBtn) editCategory(editBtn.dataset.editCategory);
        const delBtn = e.target.closest("[data-del-category]");
        if (delBtn) deleteItem("categories", delBtn.dataset.delCategory);
    });

    document.getElementById("admin-platforms-list")?.addEventListener("click", e => {
        const editBtn = e.target.closest("[data-edit-platform]");
        if (editBtn) editPlatform(editBtn.dataset.editPlatform);
        const delBtn = e.target.closest("[data-del-platform]");
        if (delBtn) deleteItem("platforms", delBtn.dataset.delPlatform);
    });

    setupFormSubmissions();
}

function subscribeData() {
    if (state.subscribed) return;
    state.subscribed = true;

    // Categories (no Firestore orderBy so documents without `order` are never hidden)
    onSnapshot(collection(db, "categories"), snap => {
        const cats = [];
        state.categoriesMap = {};
        snap.forEach(docSnap => {
            const d = { id: docSnap.id, ...docSnap.data() };
            cats.push(d);
            state.categoriesMap[d.id] = d;
        });
        cats.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        state.categories = cats;

        renderAdminCategories();
        renderAdminProjectsList();
    });

    // Platforms
    onSnapshot(collection(db, "platforms"), snap => {
        const plats = [];
        state.platformsMap = {};
        snap.forEach(docSnap => {
            const d = { id: docSnap.id, ...docSnap.data() };
            plats.push(d);
            state.platformsMap[d.id] = d;
        });
        plats.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
        state.platforms = plats;

        renderAdminPlatforms();
    });

    // Projects
    onSnapshot(collection(db, "projects"), snap => {
        try {
            // Move inline edit form back to safety before re-rendering list
            const form = document.getElementById("add-project-form");
            const defaultContainer = document.getElementById("default-project-form-container");
            if (form && defaultContainer && form.parentElement !== defaultContainer) {
                defaultContainer.appendChild(form);
                document.getElementById("inline-edit-wrapper")?.remove();
            }

            const projects = [];
            state.projectsMap = {};
            snap.forEach(docSnap => {
                const d = { id: docSnap.id, ...docSnap.data() };
                projects.push(d);
                state.projectsMap[d.id] = d;
            });

            // Global IDs (Oldest = 1)
            const sortedByCreatedAsc = [...projects].sort((a, b) => {
                const dateA = new Date(a.createdAt || 0).getTime() || 0;
                const dateB = new Date(b.createdAt || 0).getTime() || 0;
                return dateA - dateB;
            });
            sortedByCreatedAsc.forEach((p, idx) => {
                p._globalIndex = idx + 1;
            });

            projects.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a._globalIndex - b._globalIndex);
            state.projects = projects;

            renderDiagnostics();
            renderAdminProjectsList();
        } catch (err) {
            console.error("Project render error:", err);
        }
    });
}

function renderAdminCategories() {
    const list = document.getElementById("admin-categories-list");
    const sel = document.getElementById("project-category-select");
    const filterSel = document.getElementById("admin-cat-filter");
    if (!list || !sel) return;

    const currentProjectCat = sel.value;
    const currentFilterCat = filterSel?.value || "all";

    list.innerHTML = state.categories
        .map(
            c => `
        <div class="admin-item" style="cursor:default;">
            <div class="admin-item-info">
                <h3>${escapeHtml(String(c.order ?? "-"))}. ${escapeHtml(c.name || "")}</h3>
            </div>
            <div class="admin-item-actions">
                <button type="button" class="btn-edit" data-edit-category="${escapeHtml(c.id)}">編集</button>
                <button type="button" class="btn-delete" data-del-category="${escapeHtml(c.id)}">削除</button>
            </div>
        </div>`
        )
        .join("");

    sel.innerHTML =
        `<option value="">選択してください</option>` +
        state.categories
            .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || "")}</option>`)
            .join("");
    if (currentProjectCat) sel.value = currentProjectCat;

    if (filterSel) {
        filterSel.innerHTML =
            `<option value="all">すべてのカテゴリー</option>` +
            state.categories
                .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || "")}</option>`)
                .join("");
        filterSel.value = currentFilterCat;
    }
}

function renderAdminPlatforms() {
    const list = document.getElementById("admin-platforms-list");
    const codeSel = document.getElementById("project-code-platform-select");
    const deploySel = document.getElementById("project-deploy-platform-select");
    if (!list || !codeSel || !deploySel) return;

    const prevCode = codeSel.value;
    const prevDeploy = deploySel.value;

    list.innerHTML = state.platforms
        .map(p => {
            const color = sanitizeColor(p.color, "#64748b");
            return `
            <div class="admin-item" style="cursor:default;">
                <div class="admin-item-info" style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="background:${color}; width:16px; height:16px; border-radius:4px; display:inline-block;"></span>
                    <h3 style="margin:0;">${escapeHtml(p.name || "")}</h3>
                </div>
                <div class="admin-item-actions">
                    <button type="button" class="btn-edit" data-edit-platform="${escapeHtml(p.id)}">編集</button>
                    <button type="button" class="btn-delete" data-del-platform="${escapeHtml(p.id)}">削除</button>
                </div>
            </div>`;
        })
        .join("");

    const opts = state.platforms
        .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || "")}</option>`)
        .join("");

    codeSel.innerHTML = `<option value="">なし / 未選択</option>` + opts;
    deploySel.innerHTML = `<option value="">選択してください</option>` + opts;
    if (prevCode) codeSel.value = prevCode;
    if (prevDeploy) deploySel.value = prevDeploy;
}

function renderDiagnostics() {
    const panel = document.getElementById("diagnostics-panel");
    const summaryEl = document.getElementById("diagnostics-summary");
    const listEl = document.getElementById("diagnostics-list");
    const repairBtn = document.getElementById("btn-repair-issues");
    if (!panel || !summaryEl || !listEl || !repairBtn) return;

    const issues = [];
    for (const p of state.projects) {
        const result = inspectProjectDataIssues(p);
        if (result.hasIssues) {
            issues.push({
                id: p.id,
                globalIndex: p._globalIndex,
                title: p.title || "無題",
                updates: result.updates,
                reasons: result.reasons
            });
        }
    }
    state.detectedIssues = issues;

    if (issues.length === 0) {
        panel.classList.add("clean");
        summaryEl.textContent = "✅ データベース診断: URL破損・Googleアカウント番号混入・説明文パスワード露出は0件です（正常）";
        listEl.innerHTML = "";
        listEl.style.display = "none";
        repairBtn.style.display = "none";
    } else {
        panel.classList.remove("clean");
        summaryEl.textContent = `⚠️ データベース診断: スマホ閲覧エラーや情報露出の原因となる項目が ${issues.length} 件見つかりました`;
        listEl.style.display = "block";
        listEl.innerHTML = issues
            .map(
                item =>
                    `<li><strong>#${item.globalIndex} ${escapeHtml(item.title)}</strong> — ${escapeHtml(
                        item.reasons.join(" / ")
                    )}</li>`
            )
            .join("");
        repairBtn.style.display = "inline-flex";
    }
}

function renderAdminProjectsList() {
    const list = document.getElementById("admin-projects-list");
    const saveOrderBtn = document.getElementById("btn-save-order");
    if (!list) return;

    const isFiltered = Boolean(state.searchQuery) || state.categoryFilter !== "all";
    if (saveOrderBtn) {
        saveOrderBtn.disabled = isFiltered;
        saveOrderBtn.title = isFiltered
            ? "並び順の保存は検索・カテゴリー絞り込みを解除した状態で行えます"
            : "現在の並び順を保存します";
        saveOrderBtn.style.opacity = isFiltered ? "0.5" : "1";
    }

    const visible = state.projects.filter(d => {
        if (state.categoryFilter !== "all" && d.categoryId !== state.categoryFilter) {
            return false;
        }
        if (state.searchQuery) {
            const hay = `${d._globalIndex} ${d.title || ""} ${d.description || ""} ${d.tags || ""}`.toLowerCase();
            if (!hay.includes(state.searchQuery)) return false;
        }
        return true;
    });

    if (visible.length === 0) {
        list.innerHTML = `<p style="color:var(--text-muted); padding:1rem;">該当するプロジェクトがありません。</p>`;
        return;
    }

    list.innerHTML = visible
        .map(d => {
            const catName = state.categoriesMap[d.categoryId]?.name || "-";
            const creators = getCreatorsList(d).join("・") || "-";
            return `
            <div class="admin-item" draggable="${!isFiltered}" data-id="${escapeHtml(
                d.id
            )}" id="proj-row-${escapeHtml(d.id)}">
                <div class="admin-item-info">
                    <h3>☰ ${d._globalIndex}. ${escapeHtml(d.title || "")}</h3>
                    <p class="form-hint">👤 ${escapeHtml(creators)} | 🏷️ ${escapeHtml(catName)}</p>
                </div>
                <div class="admin-item-actions">
                    ${
                        !isFiltered
                            ? `<button type="button" class="btn-move" data-move-dir="-1" title="上へ移動" aria-label="上へ移動">↑</button>
                               <button type="button" class="btn-move" data-move-dir="1" title="下へ移動" aria-label="下へ移動">↓</button>`
                            : ""
                    }
                    <button type="button" class="btn-edit" data-edit-project="${escapeHtml(d.id)}">編集</button>
                    <button type="button" class="btn-delete" data-del-project="${escapeHtml(d.id)}">削除</button>
                </div>
            </div>`;
        })
        .join("");

    if (!isFiltered) {
        setupDragAndDrop();
    }
}

function moveRow(rowEl, direction) {
    if (!rowEl) return;
    const list = document.getElementById("admin-projects-list");
    if (!list) return;
    if (direction < 0 && rowEl.previousElementSibling) {
        list.insertBefore(rowEl, rowEl.previousElementSibling);
    } else if (direction > 0 && rowEl.nextElementSibling) {
        list.insertBefore(rowEl.nextElementSibling, rowEl);
    }
}

let dragBound = false;
function setupDragAndDrop() {
    const list = document.getElementById("admin-projects-list");
    if (!list) return;

    list.querySelectorAll(".admin-item").forEach(item => {
        item.addEventListener("dragstart", () => setTimeout(() => item.classList.add("dragging"), 0));
        item.addEventListener("dragend", () => item.classList.remove("dragging"));
    });

    if (dragBound) return;
    dragBound = true;
    list.addEventListener("dragover", e => {
        const dragging = list.querySelector(".dragging");
        if (!dragging) return;
        e.preventDefault();
        const after = [...list.querySelectorAll(".admin-item:not(.dragging)")].reduce(
            (closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;
                return offset < 0 && offset > closest.offset
                    ? { offset, element: child }
                    : closest;
            },
            { offset: Number.NEGATIVE_INFINITY, element: null }
        ).element;
        if (after) {
            list.insertBefore(dragging, after);
        } else {
            list.appendChild(dragging);
        }
    });
}

async function saveOrder() {
    const items = document.querySelectorAll("#admin-projects-list .admin-item");
    if (!items.length) return;
    const batch = writeBatch(db);
    items.forEach((item, idx) => {
        batch.update(doc(db, "projects", item.dataset.id), { order: idx + 1 });
    });
    await batch.commit();
    alert("✅ 並び順を保存しました");
}

function downloadBackupJson() {
    const payload = {
        exportedAt: new Date().toISOString(),
        categories: state.categories,
        platforms: state.platforms,
        projects: state.projects
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function repairAllDetectedIssues() {
    if (!state.detectedIssues.length) return;
    const msg = `検出された ${state.detectedIssues.length} 件のデータ問題（二重URL・Googleアカウント番号混入・説明文パスワード記載）をFirestore上で安全に修復しますか？`;
    if (!confirm(msg)) return;

    const btn = document.getElementById("btn-repair-issues");
    if (btn) btn.disabled = true;

    try {
        const batch = writeBatch(db);
        for (const issue of state.detectedIssues) {
            batch.update(doc(db, "projects", issue.id), issue.updates);
        }
        await batch.commit();
        alert(`✅ ${state.detectedIssues.length} 件のデータを修復しました！`);
    } catch (err) {
        console.error(err);
        alert("修復中にエラーが発生しました: " + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function editProject(id) {
    const d = state.projectsMap[id];
    if (!d) return;

    document.getElementById("edit-doc-id").value = id;
    document.getElementById("input-title").value = d.title || "";

    const creators = getCreatorsList(d);
    document.querySelectorAll(".creator-checkbox").forEach(cb => {
        cb.checked = creators.includes(cb.value);
    });

    document.getElementById("project-category-select").value = d.categoryId || "";
    document.getElementById("project-code-platform-select").value = d.codePlatformId || "";
    document.getElementById("project-deploy-platform-select").value =
        d.deployPlatformId || d.platformId || "";

    document.getElementById("input-releaseDate").value = d.releaseDate || "";
    document.getElementById("input-description").value = d.description || "";
    document.getElementById("input-url").value = d.url || "";
    document.getElementById("input-spreadsheetUrl").value = d.spreadsheetUrl || "";
    document.getElementById("input-editUrl").value = d.editUrl || "";
    document.getElementById("input-formUrl").value = d.formUrl || "";
    document.getElementById("input-tags").value = d.tags || "";

    document.getElementById("submit-btn").textContent = "更新する";
    document.getElementById("cancel-edit-btn").style.display = "inline-flex";

    const row = document.getElementById(`proj-row-${id}`);
    const form = document.getElementById("add-project-form");
    if (row && form) {
        let wrapper = document.getElementById("inline-edit-wrapper");
        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.id = "inline-edit-wrapper";
            wrapper.style.padding = "1.25rem";
            wrapper.style.background = "#fffbeb";
            wrapper.style.border = "2px dashed #f59e0b";
            wrapper.style.borderRadius = "12px";
            wrapper.style.margin = "0.75rem 0";
        }
        wrapper.innerHTML = "";
        wrapper.appendChild(form);
        row.after(wrapper);
        wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
        form?.scrollIntoView({ behavior: "smooth" });
    }
}

function editCategory(id) {
    const d = state.categoriesMap[id];
    if (!d) return;
    document.getElementById("edit-cat-id").value = id;
    document.querySelector('#add-category-form [name="name"]').value = d.name || "";
    document.querySelector('#add-category-form [name="order"]').value = d.order ?? 1;
    document.getElementById("cat-submit-btn").textContent = "更新する";
    document.getElementById("cat-cancel-btn").style.display = "inline-flex";
    document.getElementById("add-category-form")?.scrollIntoView({ behavior: "smooth" });
}

function editPlatform(id) {
    const d = state.platformsMap[id];
    if (!d) return;
    document.getElementById("edit-plat-id").value = id;
    document.querySelector('#add-platform-form [name="name"]').value = d.name || "";
    document.querySelector('#add-platform-form [name="color"]').value = sanitizeColor(
        d.color,
        "#34A853"
    );
    document.getElementById("plat-submit-btn").textContent = "更新する";
    document.getElementById("plat-cancel-btn").style.display = "inline-flex";
    document.getElementById("add-platform-form")?.scrollIntoView({ behavior: "smooth" });
}

function resetForm(type) {
    if (type === "project") {
        document.getElementById("add-project-form")?.reset();
        document.querySelectorAll(".creator-checkbox").forEach(cb => {
            cb.checked = false;
        });
        document.getElementById("edit-doc-id").value = "";
        document.getElementById("submit-btn").textContent = "追加する";
        document.getElementById("cancel-edit-btn").style.display = "none";

        const form = document.getElementById("add-project-form");
        const defaultContainer = document.getElementById("default-project-form-container");
        if (form && defaultContainer) {
            defaultContainer.appendChild(form);
        }
        document.getElementById("inline-edit-wrapper")?.remove();
    } else if (type === "category") {
        document.getElementById("add-category-form")?.reset();
        document.getElementById("edit-cat-id").value = "";
        document.getElementById("cat-submit-btn").textContent = "追加する";
        document.getElementById("cat-cancel-btn").style.display = "none";
    } else if (type === "platform") {
        document.getElementById("add-platform-form")?.reset();
        document.getElementById("edit-plat-id").value = "";
        document.getElementById("plat-submit-btn").textContent = "追加する";
        document.getElementById("plat-cancel-btn").style.display = "none";
    }
}

async function deleteItem(col, id) {
    if (!id) return;
    if (confirm("本当に削除しますか？")) {
        await deleteDoc(doc(db, col, id));
    }
}

function setupFormSubmissions() {
    const handlers = {
        "add-category-form": "categories",
        "add-platform-form": "platforms",
        "add-project-form": "projects"
    };

    Object.entries(handlers).forEach(([formId, colName]) => {
        document.getElementById(formId)?.addEventListener("submit", async e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());

            const docId = data.docId;
            delete data.docId;

            if (colName === "projects") {
                const selectedCreators = [];
                document.querySelectorAll(".creator-checkbox:checked").forEach(cb => {
                    selectedCreators.push(cb.value);
                });
                data.creators = selectedCreators;
                delete data.creator;

                // Auto-normalize URLs on save to prevent broken mobile links
                for (const key of ["url", "spreadsheetUrl", "editUrl", "formUrl"]) {
                    const raw = String(data[key] ?? "").trim();
                    if (!raw) {
                        data[key] = "";
                        continue;
                    }
                    const clean = normalizeExternalUrl(raw);
                    if (!clean) {
                        alert(`URLの形式が正しくありません: ${raw}`);
                        return;
                    }
                    data[key] = clean;
                }

                const cleanedDesc = cleanProjectDescription(data.description);
                if (cleanedDesc !== String(data.description ?? "").trim()) {
                    const stripOk = confirm(
                        "説明文にパスワードまたは管理者URLの記載が含まれています。セキュリティ保護のため該当行を除去して保存しますか？"
                    );
                    if (stripOk) {
                        data.description = cleanedDesc;
                    }
                }

                if (!docId && !data.createdAt) {
                    data.createdAt = new Date().toISOString();
                }
                if (!docId && !data.order) {
                    data.order = 999;
                }
            }

            if (data.order !== undefined && data.order !== "") {
                data.order = parseInt(data.order, 10);
            }

            if (docId) {
                await updateDoc(doc(db, colName, docId), data);
                alert("✅ 更新しました");
                resetForm(
                    colName === "projects"
                        ? "project"
                        : colName === "categories"
                          ? "category"
                          : "platform"
                );
            } else {
                await addDoc(collection(db, colName), data);
                alert("✨ 追加しました");
                e.target.reset();
            }
        });
    });
}

setupAuth();
setupAdminUIEvents();
