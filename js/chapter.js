import { generateUniqueId, escapeHtml } from './config.js';
import { showStatus } from './ui.js';
import { getCurrentSession, updateSession, saveSessions } from './storage.js';

// 章节状态常量
export const CHAPTER_STATUS = {
    DRAFT: 'draft',           // 草稿
    WRITING: 'writing',       // 写作中
    COMPLETED: 'completed',   // 已完成
    LOCKED: 'locked'          // 锁定
};

// 状态图标映射
const STATUS_ICONS = {
    [CHAPTER_STATUS.DRAFT]: '⚪',
    [CHAPTER_STATUS.WRITING]: '📝',
    [CHAPTER_STATUS.COMPLETED]: '✅',
    [CHAPTER_STATUS.LOCKED]: '🔒'
};

// 当前章节数据
let chapters = [];
let currentChapterId = null;
let currentSession = null;

// 初始化章节管理
// autoCreateChapter: 是否在没有章节时自动创建第一章，默认为true
export function initChapters(session, autoCreateChapter = true) {
    currentSession = session;
    
    if (!session.chapters) {
        session.chapters = {
            list: [],
            currentChapterId: null,
            totalWordCount: 0,
            volumes: []  // 默认不创建分卷
        };
    }
    
    // 确保volumes字段存在，如果是旧数据中的默认分卷则清空
    if (!session.chapters.volumes) {
        session.chapters.volumes = [];
    }
    // 清除旧数据中的默认分卷（只有一个且是"第一卷"的默认分卷）
    if (session.chapters.volumes.length === 1 && 
        session.chapters.volumes[0].title === '第一卷' &&
        session.chapters.volumes[0].id === 'vol1') {
        session.chapters.volumes = [];
    }
    
    chapters = session.chapters.list || [];
    currentChapterId = session.chapters.currentChapterId;
    
    // 如果没有章节，自动创建第一章（可选）
    if (chapters.length === 0 && autoCreateChapter) {
        createChapter('第一章', false);
    } else if (!currentChapterId && chapters.length > 0) {
        // 如果没有当前章节，默认选中第一个
        currentChapterId = chapters[0].id;
        session.chapters.currentChapterId = currentChapterId;
    }
    
    updateTotalWordCount();
    renderChapterList();
    renderCurrentChapterInfo();
}

// 创建新章节
export function createChapter(title = null, selectAfterCreate = true) {
    const newNumber = chapters.length > 0 
        ? Math.max(...chapters.map(c => c.number)) + 1 
        : 1;
    
    // 如果没有提供标题，使用默认标题（不包含"第X章"前缀）
    const defaultTitle = `新章节`;
    
    const newChapter = {
        id: generateUniqueId(),
        number: newNumber,
        title: title || defaultTitle,
        status: CHAPTER_STATUS.DRAFT,
        wordCount: 0,
        targetWordCount: 5000,
        outlineNodeId: null,
        summary: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    chapters.push(newChapter);
    saveChapters();
    
    if (selectAfterCreate) {
        // 新建章节时，滚动到消息底部
        selectChapter(newChapter.id, true);
    }
    
    renderChapterList();
    showStatus(`章节"${newChapter.title}"已创建`, 'success');
    return newChapter;
}

// 删除章节
export function deleteChapter(chapterId) {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    // 获取该章节的消息数量
    const allMessages = currentSession?.history || [];
    const chapterMessages = allMessages.filter(m => m.chapterId === chapterId);
    const messageCount = chapterMessages.length;
    
    let confirmMsg = `确定要删除章节"${chapter.title}"吗？`;
    if (messageCount > 0) {
        confirmMsg += `\n\n⚠️ 该章节包含 ${messageCount} 条消息（AI回复和用户输入），删除章节将同时删除这些消息。`;
    }
    confirmMsg += "\n\n此操作不可恢复。";
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    // 删除该章节对应的所有消息
    if (currentSession && currentSession.history) {
        // 从DOM中移除消息
        chapterMessages.forEach(msg => {
            const uiEl = document.querySelector(`.message-row[data-id="${msg.id}"]`);
            if (uiEl) uiEl.remove();
        });
        
        // 从历史记录中移除（只删除明确属于该章节的消息）
        currentSession.history = currentSession.history.filter(m => {
            // 如果消息没有chapterId，保留
            if (!m.chapterId) return true;
            // 如果消息的chapterId等于要删除的章节id，删除
            return m.chapterId !== chapterId;
        });
        
        // 同步更新 conversationHistory（chat.js 中的变量）
        import('./chat.js').then(({ setConversationHistory }) => {
            setConversationHistory([...currentSession.history]);
        });
    }
    
    // 如果删除的是当前章节，先记录索引，然后切换到前一个或后一个
    let deletedIndex = -1;
    if (currentChapterId === chapterId) {
        deletedIndex = chapters.findIndex(c => c.id === chapterId);
    }
    
    chapters = chapters.filter(c => c.id !== chapterId);
    
    // 如果删除的是当前章节，切换到前一个或后一个
    if (currentChapterId === chapterId) {
        let newIndex;
        if (chapters.length === 0) {
            // 没有章节了
            newIndex = -1;
        } else if (deletedIndex <= 0) {
            // 删除的是第一个，切换到新的第一个
            newIndex = 0;
        } else {
            // 删除的不是第一个，切换到前一个
            newIndex = deletedIndex - 1;
        }
        const newChapter = newIndex >= 0 ? chapters[newIndex] : null;
        currentChapterId = newChapter ? newChapter.id : null;
        if (currentSession) {
            currentSession.chapters.currentChapterId = currentChapterId;
        }
    }
    
    // 重新编号
    renumberChapters();
    
    // 保存章节数据
    if (currentSession && currentSession.chapters) {
        currentSession.chapters.list = chapters;
        currentSession.chapters.currentChapterId = currentChapterId;
    }
    
    // 保存会话（包含删除后的历史记录）
    if (currentSession) {
        saveSessions();
    }
    
    // 更新总字数统计
    updateTotalWordCount();
    
    // 更新UI上的字数显示
    import('./ui.js').then(({ updateWordCount }) => {
        updateWordCount(currentSession?.history || []);
    });
    
    renderChapterList();
    renderCurrentChapterInfo();
    
    // 如果删除后没有章节了，显示提示
    if (chapters.length === 0) {
        showStatus(`章节"${chapter.title}"已删除，所有章节已清空`, 'success');
    } else {
        showStatus(`章节"${chapter.title}"已删除，同时删除了 ${messageCount} 条消息`, 'success');
    }
}

// 选择章节
// scrollToBottom: 是否滚动到消息底部（用于新建章节时）
export function selectChapter(chapterId, scrollToBottom = false) {
    if (currentChapterId === chapterId) return;
    
    // 保存当前章节状态
    saveCurrentChapterState();
    
    currentChapterId = chapterId;
    if (currentSession) {
        currentSession.chapters.currentChapterId = chapterId;
        saveSessions();
    }
    
    // 更新章节状态为写作中
    const chapter = chapters.find(c => c.id === chapterId);
    if (chapter && chapter.status === CHAPTER_STATUS.DRAFT) {
        chapter.status = CHAPTER_STATUS.WRITING;
        chapter.updatedAt = new Date().toISOString();
        saveChapters();
    }
    
    renderChapterList();
    renderCurrentChapterInfo();
    
    // 触发章节切换事件
    window.dispatchEvent(new CustomEvent('chapterChanged', { 
        detail: { chapterId, chapter } 
    }));
    
    // 跳转到对应章节的消息位置
    setTimeout(() => {
        const chatHistory = document.getElementById('chatHistory');
        if (!chatHistory) return;
        
        if (scrollToBottom) {
            // 新建章节时，滚动到所有消息的底部
            chatHistory.scrollTop = chatHistory.scrollHeight;
        } else {
            // 点击章节时，找到该章节的所有消息
            const chapterMessages = chatHistory.querySelectorAll(`.message-row[data-chapter-id="${chapterId}"]`);
            
            if (chapterMessages.length > 0) {
                // 滚动到该章节的第一条消息（最开始的位置）
                const firstMessage = chapterMessages[0];
                firstMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // 没有消息，滚动到底部（方便用户继续写作）
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
        }
    }, 100);
}

// 更新章节
export function updateChapter(chapterId, updates) {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    Object.assign(chapter, updates, { updatedAt: new Date().toISOString() });
    saveChapters();
    renderChapterList();
}

// 更新章节标题
export function updateChapterTitle(chapterId, newTitle) {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter || !newTitle.trim()) return;
    
    chapter.title = newTitle.trim();
    chapter.updatedAt = new Date().toISOString();
    saveChapters();
    renderChapterList();
    renderCurrentChapterInfo();
}

// 更新章节字数
export function updateChapterWordCount(chapterId, wordCount) {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    chapter.wordCount = wordCount;
    
    // 自动更新状态
    if (wordCount >= chapter.targetWordCount && chapter.status !== CHAPTER_STATUS.COMPLETED) {
        chapter.status = CHAPTER_STATUS.COMPLETED;
    }
    
    chapter.updatedAt = new Date().toISOString();
    saveChapters();
    updateTotalWordCount();
    renderChapterList();
}

// 获取当前章节
export function getCurrentChapter() {
    return chapters.find(c => c.id === currentChapterId);
}

// 获取当前章节ID
export function getCurrentChapterId() {
    return currentChapterId;
}

// 获取所有章节
export function getChapters() {
    return chapters;
}

// 获取章节数量
export function getChapterCount() {
    return chapters.length;
}

// 获取总字数
export function getTotalWordCount() {
    return chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
}

// 保存章节数据
export function saveChapters() {
    if (currentSession && currentSession.chapters) {
        currentSession.chapters.list = chapters;
        saveSessions();
    }
}

// 保存当前章节状态（字数等）
function saveCurrentChapterState() {
    // 这里可以保存更多状态，如编辑位置等
    saveChapters();
}

// 更新总字数统计
function updateTotalWordCount() {
    if (currentSession && currentSession.chapters) {
        currentSession.chapters.totalWordCount = getTotalWordCount();
    }
}

// 重新编号章节
function renumberChapters() {
    chapters.sort((a, b) => a.number - b.number);
    chapters.forEach((chapter, index) => {
        chapter.number = index + 1;
    });
}

// 获取章节所属分卷
function getChapterVolume(chapter) {
    if (!currentSession || !currentSession.chapters || !currentSession.chapters.volumes) {
        return null;
    }
    
    const volumes = currentSession.chapters.volumes;
    
    // 如果章节有关联的 outlineNodeId，直接查找对应的 volume
    if (chapter.outlineNodeId) {
        return volumes.find(v => v.nodeId === chapter.outlineNodeId) || null;
    }
    
    // 如果没有关联，尝试通过章节号范围匹配
    const sortedVolumes = [...volumes].sort((a, b) => (a.startChapter || 0) - (b.startChapter || 0));
    
    for (let i = 0; i < sortedVolumes.length; i++) {
        const vol = sortedVolumes[i];
        
        // 如果 volume 有设置 startChapter
        if (vol.startChapter && chapter.number >= vol.startChapter) {
            if (!vol.endChapter || chapter.number <= vol.endChapter) {
                return vol;
            }
        }
    }
    
    return null;
}

// 格式化字数显示
function formatWordCount(count) {
    if (count >= 10000) {
        return (count / 10000).toFixed(1) + 'w';
    } else if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
}

// 渲染章节列表
export function renderChapterList() {
    const listContainer = document.getElementById('chapterList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // 如果没有章节，显示提示
    if (chapters.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'chapter-empty-hint';
        emptyDiv.innerHTML = `
            <div style="text-align: center; padding: 30px 20px; color: #666; font-size: 13px;">
                <div style="margin-bottom: 10px; font-size: 24px;">📝</div>
                <div>暂无章节</div>
                <div style="margin-top: 5px; font-size: 12px;">点击上方"+ 新建章节"创建</div>
            </div>
        `;
        listContainer.appendChild(emptyDiv);
        
        // 更新章节计数
        const countEl = document.getElementById('chapterCount');
        if (countEl) {
            countEl.textContent = '0 章';
        }
        return;
    }
    
    // 按序号排序
    const sortedChapters = [...chapters].sort((a, b) => a.number - b.number);
    
    sortedChapters.forEach(chapter => {
        const div = document.createElement('div');
        const isActive = chapter.id === currentChapterId;
        const icon = STATUS_ICONS[chapter.status] || '⚪';
        
        // 获取章节所属分卷
        const volume = getChapterVolume(chapter);
        const volumeLabel = volume ? `📚 ${volume.title}` : '';
        
        div.className = `chapter-item ${isActive ? 'active' : ''}`;
        div.dataset.id = chapter.id;
        
        div.innerHTML = `
            <div class="chapter-item-main">
                <span class="chapter-status-icon">${icon}</span>
                <span class="chapter-number-badge">${chapter.number}</span>
                <div class="chapter-info">
                    <div class="chapter-title">${escapeHtml(chapter.title)}</div>
                    <div class="chapter-meta">
                        ${formatWordCount(chapter.wordCount)}/${formatWordCount(chapter.targetWordCount)}字
                    </div>
                    ${volumeLabel ? `<div class="chapter-volume">${volumeLabel}</div>` : ''}
                </div>
            </div>
        `;
        
        // 点击选择章节
        div.onclick = () => selectChapter(chapter.id);
        
        // 双击编辑标题
        div.ondblclick = (e) => {
            e.stopPropagation();
            enableChapterTitleEdit(chapter.id, div);
        };
        
        // 右键菜单
        div.oncontextmenu = (e) => {
            e.preventDefault();
            showChapterContextMenu(e, chapter.id);
        };
        
        listContainer.appendChild(div);
    });
    
    // 更新章节计数
    const countEl = document.getElementById('chapterCount');
    if (countEl) {
        countEl.textContent = `${chapters.length} 章`;
    }
}

// 渲染当前章节信息
export function renderCurrentChapterInfo() {
    const chapter = getCurrentChapter();
    
    // 更新面包屑显示 - 只显示第几章
    const breadcrumbEl = document.getElementById('currentChapterBreadcrumb');
    if (breadcrumbEl) {
        if (chapter) {
            breadcrumbEl.innerHTML = `
                <span class="chapter-number-only">第${chapter.number}章</span>
            `;
            breadcrumbEl.classList.add('has-chapter');
        } else {
            breadcrumbEl.innerHTML = '<span class="no-chapter">未选择章节</span>';
            breadcrumbEl.classList.remove('has-chapter');
        }
    }
    
    // 更新输入区域的章节信息
    const inputChapterInfo = document.getElementById('inputChapterInfo');
    if (inputChapterInfo) {
        if (chapter) {
            const progress = Math.min(100, Math.round((chapter.wordCount / chapter.targetWordCount) * 100));
            inputChapterInfo.innerHTML = `
                <div class="chapter-info-bar">
                    <span class="chapter-label">当前章节: 第${chapter.number}章 ${escapeHtml(chapter.title)}</span>
                    <div class="chapter-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <span class="progress-text">${formatWordCount(chapter.wordCount)}/${formatWordCount(chapter.targetWordCount)}字</span>
                    </div>
                </div>
            `;
            inputChapterInfo.style.display = 'flex';
        } else {
            // 没有章节时隐藏章节信息栏
            inputChapterInfo.innerHTML = '';
            inputChapterInfo.style.display = 'none';
        }
    }
}

// 启用章节标题编辑
function enableChapterTitleEdit(chapterId, container) {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    const titleDiv = container.querySelector('.chapter-title');
    if (!titleDiv) return;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = chapter.title;
    input.className = 'chapter-title-input';
    
    const saveTitle = () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== chapter.title) {
            updateChapterTitle(chapterId, newTitle);
        } else {
            renderChapterList();
        }
    };
    
    input.onblur = saveTitle;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            saveTitle();
        } else if (e.key === 'Escape') {
            renderChapterList();
        }
    };
    
    titleDiv.innerHTML = '';
    titleDiv.appendChild(input);
    input.focus();
    input.select();
}

// 显示章节右键菜单
function showChapterContextMenu(event, chapterId) {
    // 移除已存在的菜单
    const existingMenu = document.querySelector('.chapter-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    const menu = document.createElement('div');
    menu.className = 'chapter-context-menu';
    
    // 先创建菜单内容以计算高度
    menu.innerHTML = `
        <div class="menu-item" onclick="editChapterTitle('${chapterId}')">✏️ 重命名</div>
        <div class="menu-item" onclick="setChapterTarget('${chapterId}')">🎯 设置目标字数</div>
        <div class="menu-divider"></div>
        <div class="menu-item" onclick="markChapterCompleted('${chapterId}')">✅ 标记完成</div>
        <div class="menu-item" onclick="markChapterDraft('${chapterId}')">⚪ 标记草稿</div>
        <div class="menu-divider"></div>
        <div class="menu-item text-danger" onclick="deleteChapter('${chapterId}')">🗑️ 删除章节</div>
    `;
    
    // 先添加到body以获取高度
    menu.style.cssText = `
        position: fixed;
        left: -9999px;
        top: -9999px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 6px;
        padding: 4px 0;
        z-index: 1000;
        min-width: 140px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(menu);
    
    const menuHeight = menu.offsetHeight;
    const windowHeight = window.innerHeight;
    
    // 计算菜单位置，如果超出底部则向上显示
    let top = event.clientY;
    if (top + menuHeight > windowHeight) {
        top = event.clientY - menuHeight;
    }
    
    // 设置最终位置
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${top}px`;
    
    // 点击其他地方关闭菜单
    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
}

// 切换视图：显示书籍列表
export function showBookList() {
    const chapterView = document.getElementById('chapterView');
    const bookView = document.getElementById('bookView');
    
    if (chapterView) chapterView.style.display = 'none';
    if (bookView) bookView.style.display = 'flex';
    
    // 触发事件，让app.js重新渲染书籍列表
    window.dispatchEvent(new CustomEvent('showBookList'));
}

// 切换视图：显示章节列表
export function showChapterView() {
    const chapterView = document.getElementById('chapterView');
    const bookView = document.getElementById('bookView');
    
    if (chapterView) chapterView.style.display = 'flex';
    if (bookView) bookView.style.display = 'none';
    
    renderChapterList();
    renderCurrentChapterInfo();
}

// 设置当前会话
export function setCurrentChapterSession(session) {
    currentSession = session;
    if (session && session.chapters) {
        chapters = session.chapters.list || [];
        currentChapterId = session.chapters.currentChapterId;
    }
}

// 全局函数暴露（供HTML调用）
window.createNewChapter = () => createChapter();
window.selectChapter = selectChapter;
window.deleteChapter = deleteChapter;
window.updateChapterTitle = updateChapterTitle;
window.showBookList = showBookList;
window.editChapterTitle = (id) => {
    const container = document.querySelector(`[data-id="${id}"]`);
    if (container) enableChapterTitleEdit(id, container);
};
window.markChapterCompleted = (id) => {
    updateChapter(id, { status: CHAPTER_STATUS.COMPLETED });
    showStatus('章节已标记为完成', 'success');
};
window.markChapterDraft = (id) => {
    updateChapter(id, { status: CHAPTER_STATUS.DRAFT });
    showStatus('章节已标记为草稿', 'success');
};
window.setChapterTarget = (id) => {
    const chapter = chapters.find(c => c.id === id);
    if (!chapter) return;
    const newTarget = prompt('设置目标字数:', chapter.targetWordCount);
    if (newTarget && !isNaN(newTarget)) {
        updateChapter(id, { targetWordCount: parseInt(newTarget) });
        // 实时更新输入区域的章节信息
        renderCurrentChapterInfo();
        showStatus('目标字数已更新', 'success');
    }
};
