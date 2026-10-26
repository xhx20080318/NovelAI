import { escapeHtml, generateUniqueId } from './config.js';
import { showStatus } from './ui.js';

// 世界书状态
let currentWorldEntries = [];
let selectedEntryId = null;
let isBatchMode = false;

// 获取当前条目
export function getCurrentWorldEntries() {
    return currentWorldEntries;
}

// 设置条目
export function setCurrentWorldEntries(entries) {
    currentWorldEntries = entries;
}

// 获取选中的条目 ID
export function getSelectedEntryId() {
    return selectedEntryId;
}

// 设置选中的条目 ID
export function setSelectedEntryId(id) {
    selectedEntryId = id;
}

// 获取批量模式状态
export function getIsBatchMode() {
    return isBatchMode;
}

// 渲染条目列表
export function renderEntryList() {
    const list = document.getElementById('wbEntryList');
    if (!list) return;

    const searchInput = document.getElementById('wbSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";

    list.innerHTML = '';

    // 排序：常驻优先，然后按ID
    currentWorldEntries.sort((a, b) => {
        if (a.strategy === b.strategy) return String(a.id).localeCompare(String(b.id));
        return a.strategy === 'constant' ? -1 : 1;
    });

    let visibleCount = 0;

    currentWorldEntries.forEach(entry => {
        if (searchTerm) {
            const title = (entry.title || "").toLowerCase();
            const keys = (entry.keys || "").toLowerCase();
            if (!title.includes(searchTerm) && !keys.includes(searchTerm)) return;
        }
        visibleCount++;

        const div = document.createElement('div');
        const isActive = !isBatchMode && String(entry.id) === String(selectedEntryId);
        div.className = `wb-item ${isActive ? 'active' : ''} ${!entry.enabled ? 'disabled-entry' : ''}`;

        if (isBatchMode) {
            div.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    const cb = div.querySelector('.wb-batch-checkbox');
                    if (cb) cb.checked = !cb.checked;
                }
            };
            const badgeText = entry.strategy === 'constant' ? '常驻' : '触发';
            div.innerHTML = `
                <div style="display:flex; align-items:center; overflow:hidden;">
                    <input type="checkbox" class="wb-batch-checkbox wb-checkbox" value="${entry.id}">
                    <span style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${escapeHtml(entry.title || '未命名条目')}
                    </span>
                </div>
                <span style="font-size:10px; color:#666;">${badgeText}</span>
            `;
        } else {
            div.onclick = () => selectEntry(entry.id);
            const badgeClass = entry.strategy === 'constant' ? 'wb-type-constant' : 'wb-type-trigger';
            const badgeText = entry.strategy === 'constant' ? '常驻' : '触发';

            div.innerHTML = `
                <span style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(entry.title)}">
                    ${escapeHtml(entry.title || '未命名条目')}
                </span>
                <span class="wb-badge ${badgeClass}">${badgeText}</span>
            `;
        }
        list.appendChild(div);
    });

    const total = currentWorldEntries.length;
    const countText = searchTerm ? `${visibleCount} / ${total}` : `${total}`;
    const countEl = document.getElementById('entriesCount');
    if (countEl) countEl.innerText = `${countText} 条目`;
}

// 切换批量模式
export function toggleBatchMode() {
    isBatchMode = !isBatchMode;

    const btn = document.getElementById('batchModeBtn');
    const normalToolbar = document.getElementById('wbNormalToolbar');
    const batchToolbar = document.getElementById('wbBatchToolbar');

    if (!btn || !normalToolbar || !batchToolbar) return;

    if (isBatchMode) {
        btn.classList.add('active');
        normalToolbar.style.display = 'none';
        batchToolbar.style.display = 'flex';

        document.getElementById('wbEditorArea').style.display = 'none';
        document.getElementById('wbEmptyState').style.display = 'flex';
        document.getElementById('wbEmptyState').innerHTML = "<p>🗑️ 请勾选左侧条目进行删除</p>";
    } else {
        btn.classList.remove('active');
        normalToolbar.style.display = 'flex';
        batchToolbar.style.display = 'none';

        document.getElementById('wbEmptyState').innerHTML = "<p>👈 请在左侧选择或新建一个设定条目</p>";
        if (selectedEntryId) renderEditor();
    }
    renderEntryList();
}

// 执行批量删除
export function executeBatchDelete() {
    const checkboxes = document.querySelectorAll('.wb-batch-checkbox:checked');
    if (checkboxes.length === 0) {
        showStatus('未选择任何条目', 'info');
        return;
    }

    if (!confirm(`确定要删除选中的 ${checkboxes.length} 个条目吗？此操作不可恢复。`)) return;

    const idsToDelete = new Set(Array.from(checkboxes).map(cb => cb.value));

    currentWorldEntries = currentWorldEntries.filter(entry => !idsToDelete.has(String(entry.id)));

    if (selectedEntryId && idsToDelete.has(String(selectedEntryId))) {
        selectedEntryId = null;
    }

    showStatus(`已删除 ${idsToDelete.size} 个条目`, 'success');
    toggleBatchMode();
}

// 选择条目
export function selectEntry(id) {
    selectedEntryId = id;
    renderEntryList();
    renderEditor();
}

// 渲染编辑器
export function renderEditor() {
    const editor = document.getElementById('wbEditorArea');
    const emptyState = document.getElementById('wbEmptyState');

    if (!editor || !emptyState) return;

    if (!selectedEntryId) {
        editor.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    const entry = currentWorldEntries.find(e => String(e.id) === String(selectedEntryId));
    if (!entry) return;

    editor.style.display = 'flex';
    emptyState.style.display = 'none';

    const titleInput = document.getElementById('wbTitle');
    const strategySelect = document.getElementById('wbStrategy');
    const keysInput = document.getElementById('wbKeys');
    const contentTextarea = document.getElementById('wbContent');
    const enabledCheckbox = document.getElementById('wbEnabled');

    if (titleInput) titleInput.value = entry.title || "";
    if (strategySelect) strategySelect.value = entry.strategy || "mention";
    if (keysInput) keysInput.value = entry.keys || "";
    if (contentTextarea) contentTextarea.value = entry.content || "";
    if (enabledCheckbox) enabledCheckbox.checked = entry.enabled !== false;
}

// 添加新条目
export function addWorldEntry() {
    const searchInput = document.getElementById('wbSearchInput');
    if (searchInput) searchInput.value = "";

    const newEntry = {
        id: generateUniqueId(),
        title: "新条目",
        strategy: "mention",
        keys: "",
        content: "",
        enabled: true
    };
    currentWorldEntries.push(newEntry);
    selectEntry(newEntry.id);

    setTimeout(() => {
        const titleInput = document.getElementById('wbTitle');
        if (titleInput) titleInput.focus();
    }, 50);
}

// 更新当前条目
export function updateCurrentEntry() {
    if (!selectedEntryId) return;
    const entry = currentWorldEntries.find(e => String(e.id) === String(selectedEntryId));
    if (!entry) return;

    const titleInput = document.getElementById('wbTitle');
    const strategySelect = document.getElementById('wbStrategy');
    const keysInput = document.getElementById('wbKeys');
    const contentTextarea = document.getElementById('wbContent');
    const enabledCheckbox = document.getElementById('wbEnabled');

    if (titleInput) entry.title = titleInput.value;
    if (strategySelect) entry.strategy = strategySelect.value;
    if (keysInput) entry.keys = keysInput.value;
    if (contentTextarea) entry.content = contentTextarea.value;
    if (enabledCheckbox) entry.enabled = enabledCheckbox.checked;
}

// 删除当前条目
export function deleteCurrentEntry() {
    if (!confirm("确定删除此条目吗？")) return;
    currentWorldEntries = currentWorldEntries.filter(e => String(e.id) !== String(selectedEntryId));
    selectedEntryId = null;
    renderEntryList();
    renderEditor();
}

// 初始化世界书
export function initWorldBook(session) {
    if (!session.worldEntries) {
        currentWorldEntries = [];
        // 兼容旧数据
        if (session.worldInfo && session.worldInfo.trim() !== "") {
            currentWorldEntries.push({
                id: generateUniqueId(),
                title: "基础世界观 (旧数据)",
                strategy: "constant",
                keys: "",
                content: session.worldInfo,
                enabled: true
            });
        }
    } else {
        currentWorldEntries = JSON.parse(JSON.stringify(session.worldEntries));
    }

    selectedEntryId = null;
    if (isBatchMode) toggleBatchMode();
    renderEntryList();
    renderEditor();
}
