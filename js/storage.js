import { safeJSONParse, generateUniqueId } from './config.js';

// 会话数据
let chatSessions = {};
let currentSessionId = null;

// 初始化存储
export function initStorage() {
    chatSessions = safeJSONParse(localStorage.getItem('novelSessions'), {});
}

// 获取所有会话
export function getSessions() {
    return chatSessions;
}

// 获取当前会话 ID
export function getCurrentSessionId() {
    return currentSessionId;
}

// 设置当前会话 ID
export function setCurrentSessionId(id) {
    currentSessionId = id;
}

// 获取当前会话
export function getCurrentSession() {
    return currentSessionId ? chatSessions[currentSessionId] : null;
}

// 创建新会话
export function createSession() {
    const newSessionId = generateUniqueId();
    const newSession = {
        id: newSessionId,
        title: "未命名作品",
        timestamp: new Date().toISOString(),
        history: [],
        worldInfo: "",
        worldEntries: [],
        summary: "",
        storyOutline: {
            nodes: [],
            currentNodeId: null,
            strictMode: true
        },
        chapters: {
            list: [],
            currentChapterId: null,
            totalWordCount: 0,
            volumes: []
        }
    };
    chatSessions[newSessionId] = newSession;
    saveSessions();
    currentSessionId = newSessionId;
    return newSession;
}

// 保存会话列表
export function saveSessions() {
    localStorage.setItem('novelSessions', JSON.stringify(chatSessions));
}

// 更新会话
export function updateSession(sessionId, updates) {
    if (chatSessions[sessionId]) {
        chatSessions[sessionId] = { ...chatSessions[sessionId], ...updates };
        saveSessions();
    }
}

// 删除会话
export function deleteSession(sessionId) {
    if (chatSessions[sessionId]) {
        delete chatSessions[sessionId];
        saveSessions();
        if (currentSessionId === sessionId) {
            currentSessionId = null;
        }
    }
}

// 重命名会话
export function renameSession(sessionId, newTitle) {
    if (chatSessions[sessionId]) {
        chatSessions[sessionId].title = newTitle;
        chatSessions[sessionId].timestamp = new Date().toISOString();
        saveSessions();
    }
}

// 获取排序后的会话列表
export function getSortedSessions() {
    return Object.values(chatSessions).sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );
}

// 导出所有数据（全库备份）
export function exportAllData(config) {
    return {
        version: "2.0",
        exportDate: new Date().toISOString(),
        exportType: "full_backup",
        config: config,
        sessions: chatSessions,
        // 备份所有 localStorage 数据
        localStorage: {
            novelSessions: localStorage.getItem('novelSessions'),
            novelConfig: localStorage.getItem('novelConfig')
        }
    };
}

// 导入数据（全库恢复）
export function importAllData(data) {
    // 支持新的全库备份格式
    if (data.exportType === "full_backup" && data.localStorage) {
        // 恢复所有 localStorage 数据
        if (data.localStorage.novelSessions) {
            localStorage.setItem('novelSessions', data.localStorage.novelSessions);
            chatSessions = safeJSONParse(data.localStorage.novelSessions, {});
        }
        if (data.localStorage.novelConfig) {
            localStorage.setItem('novelConfig', data.localStorage.novelConfig);
        }
        return data.config;
    }
    
    // 兼容旧版本格式
    if (data.sessions) {
        chatSessions = data.sessions;
        saveSessions();
    }
    return data.config;
}

// 导出单个会话
export function exportSession(sessionId) {
    const session = chatSessions[sessionId];
    if (!session) return null;
    return {
        type: "single_novel_export",
        version: "1.0",
        data: session
    };
}

// 导入单个会话
export function importSession(sessionData) {
    const newId = generateUniqueId();
    const newSession = {
        ...sessionData,
        id: newId,
        title: sessionData.title + " (导入)",
        timestamp: new Date().toISOString()
    };
    chatSessions[newId] = newSession;
    saveSessions();
    return newId;
}

// 生成会话标题
export function generateSessionTitle(history) {
    if (!history || history.length === 0) return "未命名作品";
    const firstUserMessage = history.find(m => m.role === 'user');
    if (firstUserMessage) {
        const match = firstUserMessage.content.match(/书名[：:](.+?)(\n|$)/);
        if (match) return match[1].trim();
        return firstUserMessage.content.substring(0, 15) +
               (firstUserMessage.content.length > 15 ? '...' : '');
    }
    return "未命名作品";
}
