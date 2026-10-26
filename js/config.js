// 默认配置
export const DEFAULT_SYSTEM_PROMPT = "你是一个专业的小说家助手。你现在的任务是协助作者完成一部长篇小说。请严格遵循设定的世界观和人物性格。不要急于完结，每次输出只需推动一部分剧情或对话。";

export const DEFAULT_SUMMARY_PROMPT = `你是一个专业的网文编辑。请根据下方提供的【已知剧情】和【最近发生的内容】，整理出一份最新的、连贯的"剧情摘要"。

要求：
1. 目的：为了让AI在后续创作中记住之前的伏笔和状态。
2. 包含：关键人名、地点变更、主角当前状态、已获得的物品、悬而未决的伏笔。
3. 格式：不要任何开场白，直接输出摘要内容。
4. 长度：控制在 500 字以内。`;

// 应用配置
export let appConfig = {
    apiUrl: "",
    apiKey: "",
    model: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,
    temperature: 1.0,
    top_p: 1.0,
    presence_penalty: 0.0,
    frequency_penalty: 0.0,
    max_tokens: 2000,
    min_tokens: 0,
    history_limit: 10,
    show_floor: false
};

// 安全解析 JSON
export function safeJSONParse(str, fallback) {
    try {
        return str ? JSON.parse(str) : fallback;
    } catch (e) {
        console.error("JSON解析错误:", e);
        return fallback;
    }
}

// 加载配置
export function loadConfig() {
    const savedConfig = safeJSONParse(localStorage.getItem('novelConfig'), {});
    appConfig = { ...appConfig, ...savedConfig };
    return appConfig;
}

// 保存配置
export function saveConfigToStorage() {
    localStorage.setItem('novelConfig', JSON.stringify(appConfig));
}

// 更新配置
export function updateConfig(newConfig) {
    appConfig = { ...appConfig, ...newConfig };
    saveConfigToStorage();
}

// 规范化 API URL
export function normalizeApiUrl(url) {
    if (!url) return "";
    try {
        let u = new URL(url);
        if (u.pathname.endsWith('/chat/completions') || u.pathname.endsWith('/models')) {
            let segments = u.pathname.split('/').filter(s => s);
            segments.pop();
            u.pathname = segments.join('/');
        }
        if (!u.pathname.endsWith('/v1') && !u.pathname.includes('/v1/')) {
            u.pathname = u.pathname.replace(/\/+$/, '') + '/v1';
        }
        return u.toString();
    } catch (e) {
        let cleanUrl = url.trim().replace(/\/+$/, '');
        if (!cleanUrl.endsWith('/v1')) cleanUrl += '/v1';
        return cleanUrl;
    }
}

// 生成唯一 ID
export function generateUniqueId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// HTML 转义
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// 字数统计
export function countWords(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const numbers = (text.match(/\d+/g) || []).length;
    return chineseChars + englishWords + numbers;
}

// 调整文本域高度
export function adjustTextareaHeight(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 120), 500) + 'px';
}
