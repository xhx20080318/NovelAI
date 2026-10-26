// 主应用入口
import { appConfig, loadConfig, generateUniqueId, adjustTextareaHeight } from './config.js';
import {
    initStorage,
    getSessions,
    getCurrentSessionId,
    setCurrentSessionId,
    getCurrentSession,
    createSession,
    saveSessions,
    deleteSession,
    renameSession,
    getSortedSessions,
    generateSessionTitle
} from './storage.js';
import {
    showStatus,
    updateSlider,
    editSliderValue,
    renderHistoryList,
    updateWordCount,
    updateCurrentTitle,
    updateModelDisplay
} from './ui.js';
import {
    getConversationHistory,
    setConversationHistory,
    addMessageToHistory,
    addMessageToUI,
    deleteMessage,
    enterEditMode,
    clearChatArea
} from './chat.js';
import {
    getIsGenerating,
    callAiApi,
    regenerateSpecific,
    testConnection,
    fetchModels,
    autoGenerateSummary,
    stopGeneration
} from './api.js';
import {
    getCurrentWorldEntries,
    renderEntryList,
    toggleBatchMode,
    executeBatchDelete,
    addWorldEntry,
    updateCurrentEntry,
    deleteCurrentEntry,
    initWorldBook
} from './worldbook.js';
import {
    initOutline,
    createOutlineNode,
    saveCurrentOutlineNode,
    deleteOutlineNode,
    addDependency,
    removeDependency,
    renderOutlineList,
    renderOutlineEditor,
    selectOutlineNode,
    getOutlineContext,
    getCurrentOutlineNode,
    NODE_STATUS
} from './outline.js';
import {
    initChapters,
    createChapter,
    selectChapter,
    deleteChapter,
    updateChapterTitle,
    updateChapterWordCount,
    getCurrentChapter,
    getCurrentChapterId,
    getChapters,
    getTotalWordCount,
    showChapterView,
    showBookList,
    CHAPTER_STATUS
} from './chapter.js';
import {
    openSettings,
    closeSettings,
    saveConfig,
    updateUIFromConfig,
    restoreDefaultSummaryPrompt,
    exportConfigPreset,
    resetConfigPreset,
    smartLoadConfig,
    syncModelInputFromSelector
} from './settings.js';
import {
    exportData,
    importData,
    exportCurrentSession,
    importSingleSession
} from './export.js';

// 将函数暴露到全局作用域（供 HTML 中的 onclick 使用）
window.startNewChat = startNewChat;
window.loadSession = loadSession;
window.sendMessage = sendMessage;
window.continueGeneration = continueGeneration;
window.stopGeneration = stopGeneration;
window.adjustTextareaHeight = adjustTextareaHeight;
window.updateSlider = updateSlider;
window.editSliderValue = editSliderValue;

// 章节管理相关
window.createNewChapter = createChapter;
window.selectChapter = selectChapter;
window.deleteChapter = deleteChapter;
window.showBookList = showBookList;
window.showChapterView = showChapterView;

// 设置相关
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveConfig = saveConfig;
window.restoreDefaultSummaryPrompt = restoreDefaultSummaryPrompt;
window.exportConfigPreset = exportConfigPreset;
window.resetConfigPreset = resetConfigPreset;
window.smartLoadConfig = smartLoadConfig;
window.syncModelInputFromSelector = syncModelInputFromSelector;
window.testConnection = testConnection;
window.fetchModels = fetchModels;

// 世界书相关
window.openWorldSettings = openWorldSettings;
window.closeWorldSettings = closeWorldSettings;
window.saveWorldSettings = saveWorldSettings;
window.renderEntryList = renderEntryList;
window.toggleBatchMode = toggleBatchMode;
window.executeBatchDelete = executeBatchDelete;
window.addWorldEntry = addWorldEntry;
window.updateCurrentEntry = updateCurrentEntry;
window.deleteCurrentEntry = deleteCurrentEntry;
window.autoGenerateSummary = (e) => autoGenerateSummary(getCurrentSessionId(), getSessions());

// 大纲相关
window.switchWorldBookTab = switchWorldBookTab;
window.createOutlineNode = () => {
    createOutlineNode();
    // 自动聚焦到标题输入框
    setTimeout(() => {
        const titleInput = document.getElementById('outlineTitle');
        if (titleInput) titleInput.focus();
    }, 50);
};
window.saveCurrentOutlineNode = saveCurrentOutlineNode;
window.deleteCurrentOutlineNode = () => {
    const currentSessionId = getCurrentSessionId();
    if (!currentSessionId) return;
    const session = chatSessions[currentSessionId];
    if (!session || !session.storyOutline) return;
    
    // 获取当前选中的节点ID
    const selectedNode = document.querySelector('.outline-item.active');
    if (!selectedNode) {
        showStatus('请先选择一个节点', 'error');
        return;
    }
    
    // 从DOM中获取节点ID
    const nodeId = selectedNode.dataset?.id;
    if (nodeId) {
        deleteOutlineNode(nodeId);
    }
};
window.removeOutlineDependency = (nodeId, depId) => {
    removeDependency(nodeId, depId);
};
window.selectOutlineNode = (id) => {
    selectOutlineNode(id);
    // 更新DOM中的选中状态
    document.querySelectorAll('.outline-item').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.id === id) {
            el.classList.add('active');
        }
    });
};

// 导出导入相关
window.exportData = exportData;
window.importData = (input) => importData(input, () => {
    // 重新同步 chatSessions
    chatSessions = getSessions();
    // 重新加载配置
    loadConfig();
    updateUIFromConfig();
    renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
    closeSettings();
});
window.exportCurrentSession = () => exportCurrentSession(getCurrentSessionId());
window.importSingleSession = (input) => importSingleSession(input, (newId) => {
    // 重新同步 chatSessions
    chatSessions = getSessions();
    renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
    loadSession(newId);
    closeSettings();
});

// 重命名相关
let targetRenameId = null;
window.openRenameModal = openRenameModal;
window.closeRenameModal = closeRenameModal;
window.confirmRename = confirmRename;

// 初始化
let chatSessions = {};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 配置 Marked 选项
    if (typeof marked !== 'undefined') {
        marked.use({
            breaks: true,
            gfm: true,
            sanitize: false,
            sanitizer: null,
            pedantic: false,
            smartLists: true,
            smartypants: false
        });
    }

    // 加载配置和存储
    loadConfig();
    initStorage();
    chatSessions = getSessions();

    // 清理残留数据：删除没有对应章节的消息
    Object.values(chatSessions).forEach(session => {
        if (session.chapters && session.chapters.list && session.history) {
            const validChapterIds = new Set(session.chapters.list.map(c => c.id));
            const originalLength = session.history.length;
            
            session.history = session.history.filter(msg => {
                // 如果消息没有 chapterId，保留
                if (!msg.chapterId) return true;
                // 如果消息的 chapterId 存在于章节列表中，保留
                return validChapterIds.has(msg.chapterId);
            });
            
            if (session.history.length !== originalLength) {
                console.log(`Cleaned up ${originalLength - session.history.length} orphaned messages in session: ${session.title}`);
            }
        }
    });
    // 保存清理后的数据
    saveSessions();

    // 更新 UI
    updateUIFromConfig();
    renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
    updateModelDisplay(appConfig.model);

    // 绑定输入框事件
    const input = document.getElementById('userInput');
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // 绑定聊天区域事件委托
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        chatHistory.addEventListener('click', function(e) {
            const target = e.target.closest('button');
            if (!target) return;

            const msgId = target.dataset.id;
            if (!msgId) return;

            if (target.classList.contains('delete-btn')) {
                handleDeleteMessage(msgId);
            } else if (target.classList.contains('edit-btn')) {
                enterEditMode(msgId, adjustTextareaHeight);
            } else if (target.classList.contains('regen-btn')) {
                handleRegenerate(msgId);
            } else if (target.classList.contains('continue-btn')) {
                continueGeneration();
            } else if (target.classList.contains('change-chapter-btn')) {
                handleChangeChapter(msgId);
            }
        });
    }

    // 绑定世界书标题输入框失去焦点事件
    const titleInput = document.getElementById('wbTitle');
    if (titleInput) {
        titleInput.addEventListener('blur', renderEntryList);
    }

    // 绑定编辑文本框输入事件
    document.addEventListener('input', function(e) {
        if (e.target.classList.contains('edit-textarea')) {
            adjustTextareaHeight(e.target);
        }
    });
    
    // 监听返回书籍列表事件
    window.addEventListener('showBookList', function() {
        renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
        // 隐藏章节信息栏
        const inputChapterInfo = document.getElementById('inputChapterInfo');
        if (inputChapterInfo) {
            inputChapterInfo.style.display = 'none';
        }
        // 清空聊天区域
        clearChatArea();
        // 重置当前标题
        updateCurrentTitle('未命名作品');
        // 清空字数统计
        updateWordCount([]);
    });
    
    // 监听章节更新事件（分卷变更时重新渲染）
    window.addEventListener('chaptersUpdated', function() {
        import('./chapter.js').then(({ renderChapterList }) => {
            renderChapterList();
        });
    });
});

// 开始新聊天
function startNewChat(clearUI = true) {
    const newSession = createSession();
    chatSessions = getSessions();

    if (clearUI) {
        clearChatArea();
        updateCurrentTitle("未命名作品");
        setConversationHistory([]);
        renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
        updateWordCount([]);
    }

    // 初始化章节管理，创建新书时不自动创建章节
    initChapters(newSession, false);
    
    // 切换到章节视图
    showChapterView();
    
    // 更新书籍标题显示
    const bookTitleEl = document.getElementById('currentBookTitle');
    if (bookTitleEl) {
        bookTitleEl.textContent = newSession.title;
    }
    
    // 显示章节信息栏
    const inputChapterInfo = document.getElementById('inputChapterInfo');
    if (inputChapterInfo) {
        inputChapterInfo.style.display = 'flex';
    }

    setTimeout(() => {
        const activeItem = document.querySelector('.history-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100);
}

// 加载会话
function loadSession(id) {
    if (getIsGenerating()) {
        showStatus('AI正在生成中，请稍候...', 'info');
        return;
    }

    const session = chatSessions[id];
    if (!session) {
        showStatus('作品不存在', 'error');
        return;
    }

    setCurrentSessionId(id);
    setConversationHistory([...session.history || []]);

    if (!session.worldEntries) session.worldEntries = [];

    const summaryInput = document.getElementById('summaryInput');
    if (summaryInput) summaryInput.value = session.summary || "";

    // 初始化章节管理，加载已有书籍时不自动创建新章节
    initChapters(session, false);

    // 渲染历史消息
    const historyDiv = document.getElementById('chatHistory');
    if (historyDiv) {
        historyDiv.innerHTML = '';
    }

    const history = getConversationHistory();
    let needSave = false;

    history.forEach((msg, index) => {
        if (!msg.id) {
            msg.id = generateUniqueId();
            needSave = true;
        }
        addMessageToUI(msg.role === 'assistant' ? 'assistant' : 'user', msg.content, msg.id, index, msg.hidden, appConfig.show_floor, msg.chapterId);
    });

    if (needSave) {
        session.history = history;
        saveSessions();
    }

    updateCurrentTitle(session.title);
    renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
    updateWordCount(history);
    
    // 切换到章节视图
    showChapterView();
    
    // 更新书籍标题显示
    const bookTitleEl = document.getElementById('currentBookTitle');
    if (bookTitleEl) {
        bookTitleEl.textContent = session.title;
    }
    
    // 显示章节信息栏
    const inputChapterInfo = document.getElementById('inputChapterInfo');
    if (inputChapterInfo) {
        inputChapterInfo.style.display = 'flex';
    }
}

// 发送消息
async function sendMessage() {
    if (getIsGenerating()) {
        showStatus('AI正在生成中，请稍候...', 'info');
        return;
    }

    const input = document.getElementById('userInput');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    const currentSessionId = getCurrentSessionId();

    // 隐藏指令逻辑
    if (content.startsWith('/hide ')) {
        const match = content.match(/\/hide\s+(\d+)-(\d+)/);
        if (match && currentSessionId) {
            const start = parseInt(match[1]);
            const end = parseInt(match[2]);

            const history = getConversationHistory();
            let count = 0;
            history.forEach((msg, idx) => {
                if (idx >= start && idx <= end) {
                    msg.hidden = true;
                    count++;
                }
            });

            chatSessions[currentSessionId].history = history;
            saveSessions();
            loadSession(currentSessionId);
            input.value = '';
            showStatus(`已隐藏 ${count} 条消息 (${start}-${end})`, 'success');
            return;
        }
    }

    // 取消隐藏指令
    if (content.startsWith('/unhide')) {
        if (!currentSessionId) {
            showStatus('请先选择一本小说', 'error');
            return;
        }

        const history = getConversationHistory();
        history.forEach(msg => {
            if (msg.hidden) delete msg.hidden;
        });

        chatSessions[currentSessionId].history = history;
        saveSessions();
        loadSession(currentSessionId);
        input.value = '';
        showStatus('已取消隐藏所有消息', 'success');
        return;
    }

    // 创建新会话（如果没有）
    if (!currentSessionId) {
        startNewChat(false);
    }

    const userMsgId = generateUniqueId();
    const history = getConversationHistory();
    
    // 添加章节ID到消息
    const currentChapterId = getCurrentChapterId();
    addMessageToUI('user', content, userMsgId, history.length, false, appConfig.show_floor, currentChapterId);
    addMessageToHistory('user', content, userMsgId, currentChapterId);

    // 保存会话
    const session = getCurrentSession();
    if (session) {
        session.history = getConversationHistory();
        if (session.title === "未命名作品") {
            session.title = generateSessionTitle(session.history);
        }
        session.timestamp = new Date().toISOString();
        saveSessions();
        renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
        updateCurrentTitle(session.title);
    }

    input.value = '';
    input.style.height = 'auto';

    // 调用 API
    const result = await callAiApi(getCurrentSessionId(), chatSessions, saveSessions, currentChapterId);
    if (result && result.needOpenSettings) {
        openSettings();
    }
}

// 继续生成
async function continueGeneration() {
    if (getIsGenerating()) {
        showStatus('AI正在生成中，请稍候...', 'info');
        return;
    }

    const currentSessionId = getCurrentSessionId();
    if (!currentSessionId) return;

    const userMsgId = generateUniqueId();
    const content = "请继续写下去，保持情节连贯。";
    const history = getConversationHistory();
    
    // 添加章节ID到消息
    const currentChapterId = getCurrentChapterId();

    addMessageToUI('user', content, userMsgId, history.length, false, appConfig.show_floor, currentChapterId);
    addMessageToHistory('user', content, userMsgId, currentChapterId);

    const session = getCurrentSession();
    if (session) {
        session.history = getConversationHistory();
        session.timestamp = new Date().toISOString();
        saveSessions();
    }

    await callAiApi(currentSessionId, chatSessions, saveSessions, currentChapterId);
}

// 处理删除消息
function handleDeleteMessage(msgId) {
    const currentSessionId = getCurrentSessionId();
    deleteMessage(msgId, currentSessionId, chatSessions, saveSessions, () => {
        renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
    });
}

// 处理重新生成
async function handleRegenerate(msgId) {
    const currentSessionId = getCurrentSessionId();
    await regenerateSpecific(msgId, currentSessionId, chatSessions, saveSessions, callAiApi);
}

// 处理更改消息所属章节
function handleChangeChapter(msgId) {
    const session = getCurrentSession();
    if (!session || !session.history) return;
    
    const msg = session.history.find(m => String(m.id) === String(msgId));
    if (!msg) return;
    
    // 获取所有章节
    const chapters = getChapters();
    if (chapters.length === 0) {
        showStatus('没有可用的章节', 'error');
        return;
    }
    
    // 构建章节选择列表
    let chapterOptions = chapters.map((ch, idx) => {
        const isCurrent = ch.id === msg.chapterId;
        return `${idx + 1}. 第${ch.number}章 ${ch.title}${isCurrent ? ' (当前)' : ''}`;
    }).join('\n');
    
    const currentChapter = chapters.find(c => c.id === msg.chapterId);
    const currentInfo = currentChapter ? `当前所属: 第${currentChapter.number}章 ${currentChapter.title}` : '当前未绑定章节';
    
    const input = prompt(
        `${currentInfo}\n\n请选择要绑定的章节（输入序号）:\n${chapterOptions}\n\n输入 0 取消绑定`,
        ''
    );
    
    if (input === null) return; // 用户取消
    
    const selectedIndex = parseInt(input) - 1;
    
    if (input === '0') {
        // 取消绑定
        msg.chapterId = null;
        showStatus('已取消消息与章节的绑定', 'success');
    } else if (selectedIndex >= 0 && selectedIndex < chapters.length) {
        const selectedChapter = chapters[selectedIndex];
        msg.chapterId = selectedChapter.id;
        showStatus(`消息已绑定到: 第${selectedChapter.number}章 ${selectedChapter.title}`, 'success');
    } else {
        showStatus('无效的章节序号', 'error');
        return;
    }
    
    // 保存更改
    saveSessions();
    
    // 更新UI
    const msgEl = document.querySelector(`.message-row[data-id="${msgId}"]`);
    if (msgEl) {
        if (msg.chapterId) {
            msgEl.dataset.chapterId = msg.chapterId;
        } else {
            delete msgEl.dataset.chapterId;
        }
    }
    
    // 重新计算章节字数
    chapters.forEach(chapter => {
        const chapterMessages = session.history.filter(m => m.chapterId === chapter.id && m.role === 'assistant');
        const wordCount = chapterMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
        updateChapterWordCount(chapter.id, wordCount);
    });
}

// 打开世界书设置
function openWorldSettings() {
    const currentSessionId = getCurrentSessionId();
    if (!currentSessionId) {
        showStatus('请先创建或打开一本小说，才能编辑设定。', 'error');
        return;
    }

    document.getElementById('worldModal').style.display = 'flex';

    const session = chatSessions[currentSessionId];
    document.getElementById('worldModalTitle').innerText = session.title;
    document.getElementById('summaryInput').value = session.summary || "";

    // 初始化大纲
    initOutline(session);
    
    // 初始化世界书
    initWorldBook(session);
}

// 切换世界书标签页
function switchWorldBookTab(tabName) {
    // 隐藏所有标签页内容
    document.querySelectorAll('.wb-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有按钮的active状态
    document.querySelectorAll('.wb-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示选中的标签页
    const selectedTab = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // 激活对应的按钮
    const selectedBtn = document.getElementById('tabBtn' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
}

// 关闭世界书设置
function closeWorldSettings() {
    document.getElementById('worldModal').style.display = 'none';
}

// 保存世界书设置
function saveWorldSettings() {
    const currentSessionId = getCurrentSessionId();
    if (currentSessionId) {
        const session = chatSessions[currentSessionId];
        if (!session) return;

        session.worldEntries = getCurrentWorldEntries();
        session.worldInfo = "";
        session.summary = document.getElementById('summaryInput').value;
        
        // 保存当前大纲编辑状态
        saveCurrentOutlineNode();

        saveSessions();
        showStatus('世界书与设定已保存 ✅', 'success');
    }
    closeWorldSettings();
}

// 打开重命名模态框
function openRenameModal(id) {
    targetRenameId = id;
    const currentName = chatSessions[id].title;
    const input = document.getElementById('renameInput');
    input.value = currentName;

    document.getElementById('renameModal').style.display = 'flex';

    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);
}

// 关闭重命名模态框
function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
    targetRenameId = null;
}

// 确认重命名
function confirmRename() {
    if (!targetRenameId) return;

    const input = document.getElementById('renameInput');
    const newName = input.value.trim();

    if (newName) {
        renameSession(targetRenameId, newName);
        chatSessions = getSessions();
        renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);

        if (getCurrentSessionId() === targetRenameId) {
            updateCurrentTitle(newName);
        }
    }
    closeRenameModal();
}

// 处理删除会话
function handleDeleteSession(id) {
    if (!confirm("⚠️ 确定要彻底删除这本书吗？\n删除后无法找回，建议先备份。")) return;

    const currentSessionId = getCurrentSessionId();

    if (currentSessionId === id) {
        clearChatArea();
        updateCurrentTitle("未命名作品");
        const summaryInput = document.getElementById('summaryInput');
        if (summaryInput) summaryInput.value = "";
        setCurrentSessionId(null);
        setConversationHistory([]);
    }

    deleteSession(id);
    chatSessions = getSessions();
    renderHistoryList(chatSessions, loadSession, openRenameModal, handleDeleteSession);
    showStatus('作品已彻底删除', 'success');
}
