import { escapeHtml, generateUniqueId } from './config.js';
import { getCurrentSession, updateSession } from './storage.js';
import { showStatus, updateWordCount } from './ui.js';
import { getChapters, updateChapterWordCount } from './chapter.js';

// 当前会话的历史记录
let conversationHistory = [];

// 渲染 Markdown 内容为安全的 HTML
function renderMarkdownContent(content, role, appendCursor = false) {
    if (role === 'assistant' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        try {
            const textToParse = appendCursor ? content + '▌' : content;
            const rawHtml = marked.parse(textToParse);
            const cleanHtml = DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre'],
                ALLOWED_ATTR: []
            });
            let result = `<div class="markdown-body">${cleanHtml}</div>`;
            if (appendCursor) {
                result = result.replace(/<\/p>\s*$/, '') + '<span class="stream-cursor">▌</span></p>';
            }
            return result;
        } catch (e) {
            console.error("Markdown解析错误:", e);
            return escapeHtml(content) + (appendCursor ? '<span class="stream-cursor">▌</span>' : '');
        }
    }
    return escapeHtml(content) + (appendCursor ? '<span class="stream-cursor">▌</span>' : '');
}

// 获取历史记录
export function getConversationHistory() {
    return conversationHistory;
}

// 设置历史记录
export function setConversationHistory(history) {
    conversationHistory = history;
}

// 添加消息到历史
export function addMessageToHistory(role, content, id, chapterId = null) {
    conversationHistory.push({ role, content, id, chapterId });
}

// 从历史记录中删除消息
export function removeMessageFromHistory(msgId) {
    conversationHistory = conversationHistory.filter(m => String(m.id) !== String(msgId));
}

// 更新历史记录中的消息
export function updateMessageInHistory(msgId, newContent) {
    const msg = conversationHistory.find(m => String(m.id) === String(msgId));
    if (msg) {
        msg.content = newContent;
    }
}

// 添加消息到 UI
export function addMessageToUI(role, content, id, index = -1, isHidden = false, showFloor = false, chapterId = null) {
    const historyDiv = document.getElementById('chatHistory');
    if (!historyDiv) return;

    // 清除欢迎屏幕
    const welcome = historyDiv.querySelector('.welcome-screen');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message-row ${role === 'assistant' ? 'ai' : 'user'} ${isHidden ? 'hidden-msg' : ''}`;
    div.dataset.id = id;
    if (chapterId) {
        div.dataset.chapterId = chapterId;
    }

    // 使用统一的渲染函数
    const htmlContent = renderMarkdownContent(content, role);

    let extraActions = `
        <button class="action-link change-chapter-btn" data-id="${id}" title="更改所属章节">📑 改章节</button>
    `;
    if (role === 'assistant') {
        extraActions += `
            <button class="action-link continue-btn" data-id="${id}" title="发送'请继续'指令">⏩ 续写</button>
            <button class="action-link regen-btn" data-id="${id}" title="删除此条并重新生成">🔄 重试</button>
        `;
    }

    let floorHtml = '';
    if (showFloor && index >= 0) {
        floorHtml = `<div class="floor-id">#${index}</div>`;
    }

    div.innerHTML = `
        ${role === 'assistant' ? '<div class="message-role-name">AI Novelist</div>' : ''}
        <div class="message-content" id="content-${id}">${htmlContent}</div>
        ${floorHtml}
        <div class="msg-actions">
            ${extraActions}
            <button class="action-link edit-btn" data-id="${id}">编辑</button>
            <button class="action-link delete-btn" data-id="${id}">删除</button>
        </div>
    `;
    historyDiv.appendChild(div);

    requestAnimationFrame(() => {
        historyDiv.scrollTop = historyDiv.scrollHeight;
    });
}

// 添加流式消息到 UI
export function addStreamMessageToUI(id, index = -1, showFloor = false, chapterId = null) {
    const historyDiv = document.getElementById('chatHistory');
    if (!historyDiv) return null;

    const div = document.createElement('div');
    div.className = 'message-row ai streaming';
    div.dataset.id = id;
    if (chapterId) {
        div.dataset.chapterId = chapterId;
    }

    div.innerHTML = `
        <div class="message-role-name">AI Novelist</div>
        <div class="message-content" id="content-${id}">
            <div class="markdown-body"><p><span class="stream-cursor">▌</span></p></div>
        </div>
        ${showFloor && index >= 0 ? `<div class="floor-id">#${index}</div>` : ''}
        <div class="msg-actions" style="display:none;">
            <button class="action-link continue-btn" data-id="${id}" title="发送'请继续'指令">⏩ 续写</button>
            <button class="action-link regen-btn" data-id="${id}" title="删除此条并重新生成">🔄 重试</button>
            <button class="action-link change-chapter-btn" data-id="${id}" title="更改所属章节">📑 改章节</button>
            <button class="action-link edit-btn" data-id="${id}">编辑</button>
            <button class="action-link delete-btn" data-id="${id}">删除</button>
        </div>
    `;
    historyDiv.appendChild(div);

    requestAnimationFrame(() => {
        historyDiv.scrollTop = historyDiv.scrollHeight;
    });

    return div;
}

// 更新流式消息
export function updateStreamMessage(div, content) {
    if (!div) return;

    const contentDiv = div.querySelector('.message-content');
    if (!contentDiv) return;

    // 使用统一的渲染函数，添加光标
    contentDiv.innerHTML = renderMarkdownContent(content, 'assistant', true);

    const historyDiv = document.getElementById('chatHistory');
    if (historyDiv) {
        historyDiv.scrollTop = historyDiv.scrollHeight;
    }
}

// 完成流式消息
export function finalizeStreamMessage(div, content, id) {
    if (!div) return;

    div.classList.remove('streaming');

    const contentDiv = div.querySelector('.message-content');
    if (!contentDiv) return;

    // 使用统一的渲染函数
    contentDiv.innerHTML = renderMarkdownContent(content, 'assistant');

    const actionsDiv = div.querySelector('.msg-actions');
    if (actionsDiv) {
        actionsDiv.style.display = '';
    }
}

// 删除消息
export function deleteMessage(msgId, currentSessionId, chatSessions, saveSessions, renderHistoryList) {
    if (!confirm("确定删除此条内容？")) return;
    if (!currentSessionId || !chatSessions[currentSessionId]) return;

    const session = chatSessions[currentSessionId];
    const strId = String(msgId);

    const uiEl = document.querySelector(`.message-row[data-id="${strId}"]`);
    if (uiEl) uiEl.remove();

    session.history = session.history.filter(m => String(m.id) !== strId);
    conversationHistory = [...session.history];

    if (session.title.includes("未命名")) {
        const firstUser = session.history.find(m => m.role === 'user');
        if (firstUser) {
            session.title = firstUser.content.substring(0, 15) +
                (firstUser.content.length > 15 ? '...' : '');
        }
    }

    session.timestamp = new Date().toISOString();
    saveSessions();
    renderHistoryList();
    updateWordCount(conversationHistory);
    
    // 重新计算所有章节的字数
    const chapters = getChapters();
    chapters.forEach(chapter => {
        const chapterMessages = session.history.filter(m => m.chapterId === chapter.id && m.role === 'assistant');
        const wordCount = chapterMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
        
        // 直接更新章节字数，不调用 updateChapterWordCount（避免重复渲染）
        chapter.wordCount = wordCount;
        
        // 自动更新状态
        if (wordCount >= chapter.targetWordCount && chapter.status !== 'completed') {
            chapter.status = 'completed';
        }
        
        chapter.updatedAt = new Date().toISOString();
    });
    
    // 保存章节数据并更新UI
    import('./chapter.js').then(({ saveChapters, renderChapterList, renderCurrentChapterInfo }) => {
        saveChapters();
        renderChapterList();
        renderCurrentChapterInfo();
    });
}

// 进入编辑模式
export function enterEditMode(msgId, adjustTextareaHeight) {
    const contentDiv = document.getElementById(`content-${msgId}`);
    if (!contentDiv) return;

    const currentHeight = contentDiv.offsetHeight;
    const originalMsg = conversationHistory.find(m => String(m.id) === String(msgId));
    const originalText = originalMsg ? originalMsg.content : contentDiv.innerText;

    contentDiv.style.width = '100%';
    contentDiv.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.id = `edit-area-${msgId}`;
    textarea.value = originalText;
    textarea.style.height = Math.max(currentHeight, 120) + 'px';

    const btnContainer = document.createElement('div');
    btnContainer.className = 'edit-buttons';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.style.padding = '5px 10px';
    saveBtn.style.fontSize = '12px';
    saveBtn.innerText = '完成';
    saveBtn.onclick = () => saveEdit(msgId);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-link';
    cancelBtn.innerText = '取消';
    cancelBtn.onclick = () => cancelEdit(msgId);

    btnContainer.appendChild(saveBtn);
    btnContainer.appendChild(cancelBtn);

    contentDiv.appendChild(textarea);
    contentDiv.appendChild(btnContainer);

    textarea.addEventListener('input', () => adjustTextareaHeight(textarea));
    textarea.focus();
}

// 保存编辑
function saveEdit(msgId) {
    const textarea = document.getElementById(`edit-area-${msgId}`);
    if (!textarea) return;

    const newText = textarea.value;
    const msgIndex = conversationHistory.findIndex(m => String(m.id) === String(msgId));

    let role = 'user';
    if (msgIndex !== -1) {
        conversationHistory[msgIndex].content = newText;
        role = conversationHistory[msgIndex].role;
    }

    const contentDiv = document.getElementById(`content-${msgId}`);
    if (contentDiv) {
        contentDiv.style.width = '';
        // 使用统一的渲染函数
        contentDiv.innerHTML = renderMarkdownContent(newText, role);
    }

    // 同步保存到 localStorage
    import('./storage.js').then(({ getCurrentSession, saveSessions }) => {
        const session = getCurrentSession();
        if (session) {
            session.history = [...conversationHistory];
            session.timestamp = new Date().toISOString();
            saveSessions();
        }
    });
}

// 取消编辑
function cancelEdit(msgId) {
    const contentDiv = document.getElementById(`content-${msgId}`);
    if (!contentDiv) return;

    contentDiv.style.width = '';

    const msg = conversationHistory.find(m => String(m.id) === String(msgId));
    const originalText = msg ? msg.content : "";

    // 使用统一的渲染函数
    contentDiv.innerHTML = renderMarkdownContent(originalText, msg ? msg.role : 'user');
}

// 清空聊天区域
export function clearChatArea() {
    const historyDiv = document.getElementById('chatHistory');
    if (historyDiv) {
        historyDiv.innerHTML = `
            <div class="welcome-screen">
                <h2>开始创作你的新书</h2>
                <p>每一本书都是独立的世界。<br>建议先在「设定集」中完善大纲。</p>
            </div>
        `;
    }
}
