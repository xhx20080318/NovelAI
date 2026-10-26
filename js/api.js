import { appConfig, normalizeApiUrl, generateUniqueId } from './config.js';
import { getCurrentSession, updateSession } from './storage.js';
import { showStatus, updateWordCount, removeLoadingIndicator, toggleInputState, showLoadingIndicator } from './ui.js';
import {
    getConversationHistory,
    setConversationHistory,
    addMessageToHistory,
    removeMessageFromHistory,
    addMessageToUI,
    addStreamMessageToUI,
    updateStreamMessage,
    finalizeStreamMessage
} from './chat.js';
import { getOutlineContext } from './outline.js';
import { updateChapterWordCount, getCurrentChapter } from './chapter.js';

let isGenerating = false;
let abortController = null;

// 获取生成状态
export function getIsGenerating() {
    return isGenerating;
}

// 停止生成
export function stopGeneration() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    isGenerating = false;
}

// 扫描世界书条目
export function scanWorldEntries(textToScan, entries) {
    let activeContent = [];

    if (!Array.isArray(entries) || !textToScan) return activeContent;

    entries.forEach(entry => {
        if (!entry || !entry.enabled) return;

        if (entry.strategy === 'constant') {
            activeContent.push(`【设定：${entry.title}】\n${entry.content}`);
            return;
        }

        if (entry.strategy === 'mention' && entry.keys) {
            const keys = entry.keys.split(/[,，、]/).map(k => k.trim()).filter(k => k);
            const isMatch = keys.some(key => {
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp(escapedKey, 'i').test(textToScan);
            });

            if (isMatch) {
                activeContent.push(`【资料库激活：${entry.title}】\n${entry.content}`);
            }
        }
    });

    return activeContent.join('\n\n');
}

// 调用 AI API
export async function callAiApi(currentSessionId, chatSessions, saveSessions, chapterId = null) {
    if (!appConfig.apiUrl || !appConfig.apiKey) {
        showStatus('请先在设置中配置 API', 'error');
        return { success: false, needOpenSettings: true };
    }

    isGenerating = true;
    toggleInputState(false, { value: isGenerating });
    const loadingId = showLoadingIndicator(generateUniqueId);

    try {
        const session = chatSessions[currentSessionId];
        if (!session) throw new Error("当前会话不存在");

        const currentSummary = session.summary || "";
        const entries = session.worldEntries || [];
        const conversationHistory = getConversationHistory();

        const visibleHistory = conversationHistory.filter(m => !m.hidden);
        const recentHistoryText = visibleHistory.slice(-3).map(m => m.content).join('\n');
        const userCurrentInput = visibleHistory.length > 0 ? visibleHistory[visibleHistory.length - 1].content : "";
        const textToScan = recentHistoryText + "\n" + userCurrentInput;

        const activatedWorldInfo = scanWorldEntries(textToScan, entries);

        // 获取大纲上下文
        const outlineContext = getOutlineContext();
        
        const finalSystemPrompt = `${appConfig.systemPrompt}

【世界观与设定数据库】
${activatedWorldInfo ? activatedWorldInfo : "（暂无相关设定触发）"}

${outlineContext ? outlineContext + '\n' : ''}
【前情提要 / 剧情进度】
${currentSummary ? currentSummary : "故事刚刚开始。"}

【写作要求】
请根据上述激活的设定${outlineContext ? '、情节节点规划' : ''}和前情提要，续写接下来的剧情。`;

        let historyToSend = visibleHistory.map(m => ({ role: m.role, content: m.content }));

        const limit = appConfig.history_limit || 0;
        if (limit > 0 && historyToSend.length > limit) {
            historyToSend = historyToSend.slice(-limit);
        }

        const messagesPayload = [
            { role: 'system', content: finalSystemPrompt },
            ...historyToSend
        ];

        const endpoint = normalizeApiUrl(appConfig.apiUrl) + '/chat/completions';

        const requestBody = {
            model: appConfig.model,
            messages: messagesPayload,
            stream: true,
            temperature: appConfig.temperature,
            top_p: appConfig.top_p,
            presence_penalty: appConfig.presence_penalty,
            frequency_penalty: appConfig.frequency_penalty,
            max_tokens: appConfig.max_tokens || 2000
        };

        if (appConfig.min_tokens > 0) {
            requestBody.min_tokens = appConfig.min_tokens;
        }

        // 创建 AbortController 用于终止请求
        abortController = new AbortController();

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + appConfig.apiKey
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API Error: ${res.status}`);
        }

        removeLoadingIndicator(loadingId);

        const aiMsgId = generateUniqueId();
        const streamMsgDiv = addStreamMessageToUI(aiMsgId, conversationHistory.length, appConfig.show_floor, chapterId);

        let fullContent = '';
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

                    const data = trimmedLine.slice(5).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullContent += delta;
                            updateStreamMessage(streamMsgDiv, fullContent);
                        }
                    } catch (parseErr) {
                        // 忽略解析错误
                    }
                }
            }
        } catch (readErr) {
            // 检查是否是被中止的
            if (readErr.name === 'AbortError') {
                console.log('生成已终止');
                // 如果有内容，保存已生成的部分
                if (fullContent) {
                    finalizeStreamMessage(streamMsgDiv, fullContent + '\n\n[已终止]', aiMsgId);
                    addMessageToHistory('assistant', fullContent, aiMsgId, chapterId);
                    session.history = [...getConversationHistory()];
                    session.timestamp = new Date().toISOString();
                    saveSessions();
                    updateWordCount(session.history);
                } else {
                    // 没有内容，移除流式消息
                    if (streamMsgDiv) streamMsgDiv.remove();
                }
                removeLoadingIndicator(loadingId);
                toggleInputState(true, { value: isGenerating });
                abortController = null;
                return { success: true, aborted: true };
            }
            throw readErr;
        }

        if (!fullContent) throw new Error("AI返回内容为空");

        finalizeStreamMessage(streamMsgDiv, fullContent, aiMsgId);
        addMessageToHistory('assistant', fullContent, aiMsgId, chapterId);

        // 更新会话
        session.history = [...getConversationHistory()];
        session.timestamp = new Date().toISOString();
        saveSessions();
        updateWordCount(session.history);

        // 更新章节字数和状态
        if (chapterId) {
            const chapterMessages = session.history.filter(m => m.chapterId === chapterId && m.role === 'assistant');
            const wordCount = chapterMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
            updateChapterWordCount(chapterId, wordCount);
        }

        isGenerating = false;
        toggleInputState(true, { value: isGenerating });
        abortController = null;

        return { success: true };

    } catch (e) {
        // 检查是否是被中止的
        if (e.name === 'AbortError') {
            console.log('生成已终止');
            removeLoadingIndicator(loadingId);
            isGenerating = false;
            toggleInputState(true, { value: isGenerating });
            abortController = null;
            return { success: true, aborted: true };
        }

        removeLoadingIndicator(loadingId);
        showStatus('生成失败: ' + e.message, 'error');
        console.error("Generate Error:", e);

        isGenerating = false;
        toggleInputState(true, { value: isGenerating });
        abortController = null;

        return { success: false, error: e.message };
    }
}

// 重新生成特定消息
export async function regenerateSpecific(msgId, currentSessionId, chatSessions, saveSessions, callAiApiFn) {
    if (isGenerating) {
        showStatus('AI正在生成中，请稍候...', 'info');
        return;
    }
    if (!currentSessionId || !chatSessions[currentSessionId]) return;

    const session = chatSessions[currentSessionId];
    const strId = String(msgId);
    const msgIndex = session.history.findIndex(m => String(m.id) === strId);

    if (msgIndex === -1) {
        showStatus('找不到该消息', 'error');
        return;
    }

    // 获取要删除的消息
    const msgToDelete = session.history[msgIndex];

    // 移除 UI
    const uiMsg = document.querySelector(`.message-row[data-id="${strId}"]`);
    if (uiMsg) uiMsg.remove();

    // 移除历史记录
    session.history = session.history.filter(m => String(m.id) !== strId);

    // 检查删除后最后一条消息的角色
    // 如果最后一条是 assistant，需要添加一条 user 消息来避免连续的 assistant
    const lastMsg = session.history[session.history.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
        // 添加一条提示性的 user 消息
        const userMsgId = generateUniqueId();
        const promptMsg = {
            role: 'user',
            content: '请继续完善上文内容。',
            id: userMsgId,
            chapterId: msgToDelete ? msgToDelete.chapterId : null
        };
        session.history.push(promptMsg);

        // 添加到 UI
        addMessageToUI('user', promptMsg.content, userMsgId, session.history.length - 1, false, appConfig.show_floor, msgToDelete ? msgToDelete.chapterId : null);
    }

    // 更新内存中的历史记录
    setConversationHistory([...session.history]);

    // 更新存储
    saveSessions();

    // 调用 API，传递原消息的章节ID
    const chapterId = msgToDelete ? msgToDelete.chapterId : null;
    return await callAiApi(currentSessionId, chatSessions, saveSessions, chapterId);
}

// 测试 API 连接
export async function testConnection() {
    const urlInput = document.getElementById('apiUrl');
    const keyInput = document.getElementById('apiKey');
    const modelInput = document.getElementById('modelInput');

    if (!urlInput || !keyInput) {
        showStatus("缺少必要元素", "error");
        return;
    }

    const url = urlInput.value;
    const key = keyInput.value;
    const model = modelInput ? modelInput.value : "gpt-3.5-turbo";

    if (!url || !key) {
        showStatus("请先填写 URL 和 Key", "error");
        return;
    }

    showStatus("正在发送测试请求...", "info");

    try {
        const endpoint = normalizeApiUrl(url) + '/chat/completions';

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + key
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 1
            })
        });

        if (res.ok) {
            showStatus("✅ 连接成功！API 配置有效。", "success");
        } else {
            const err = await res.json().catch(() => ({}));
            showStatus("❌ 连接失败: " + (err.error?.message || res.status), "error");
        }
    } catch (e) {
        showStatus("❌ 网络错误: " + e.message, "error");
    }
}

// 获取模型列表
export async function fetchModels() {
    const urlInput = document.getElementById('apiUrl');
    const keyInput = document.getElementById('apiKey');

    if (!urlInput || !keyInput) {
        showStatus("缺少必要元素", "error");
        return;
    }

    const url = urlInput.value;
    const key = keyInput.value;

    if (!url || !key) {
        showStatus("请填写完整", "error");
        return;
    }

    try {
        const endpoint = normalizeApiUrl(url) + '/models';
        const res = await fetch(endpoint, {
            headers: { 'Authorization': 'Bearer ' + key }
        });
        const data = await res.json();
        const sel = document.getElementById('modelSelector');
        if (sel) {
            sel.innerHTML = '<option value="">-- 选择模型 --</option>';
        }
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(m => {
                if (!sel) return;
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.id;
                sel.appendChild(opt);
            });
            showStatus("模型列表已更新", "success");
        } else {
            console.error("API Response:", data);
            throw new Error("API返回数据格式异常，请检查Key");
        }
    } catch (e) {
        showStatus("获取失败: " + e.message, "error");
    }
}

// 自动生成摘要
export async function autoGenerateSummary(currentSessionId, chatSessions) {
    if (!currentSessionId) {
        showStatus('请先进入一本小说', 'error');
        return;
    }
    if (!appConfig.apiKey) {
        showStatus('请先配置 API Key', 'error');
        return;
    }

    const btn = event.target;
    const originText = btn.innerText;
    btn.innerText = "⏳ 正在分析全文...";
    btn.disabled = true;

    try {
        const summaryInput = document.getElementById('summaryInput');
        if (!summaryInput) throw new Error("摘要输入框不存在");

        const currentSummary = summaryInput.value;
        const session = chatSessions[currentSessionId];

        const recentContent = session.history.map(m =>
            `${m.role === 'user' ? '【指令】' : '【正文】'}: ${m.content}`
        ).join('\n\n');

        let promptTemplate = appConfig.summaryPrompt;
        if (!promptTemplate || promptTemplate.trim() === "") {
            const DEFAULT_SUMMARY_PROMPT = `你是一个专业的网文编辑。请根据下方提供的【已知剧情】和【最近发生的内容】，整理出一份最新的、连贯的"剧情摘要"。

要求：
1. 目的：为了让AI在后续创作中记住之前的伏笔和状态。
2. 包含：关键人名、地点变更、主角当前状态、已获得的物品、悬而未决的伏笔。
3. 格式：不要任何开场白，直接输出摘要内容。
4. 长度：控制在 500 字以内。`;
            promptTemplate = DEFAULT_SUMMARY_PROMPT;
        }

        const summarizePrompt = `${promptTemplate}

【已知剧情】：
${currentSummary || "（无）"}

【最近发生的内容】：
${recentContent}`;

        const endpoint = normalizeApiUrl(appConfig.apiUrl) + '/chat/completions';

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + appConfig.apiKey
            },
            body: JSON.stringify({
                model: appConfig.model,
                messages: [{ role: 'user', content: summarizePrompt }],
                temperature: 0.7
            })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API 请求失败: ${res.status}`);
        }

        const data = await res.json();
        const newSummary = data.choices[0]?.message?.content;
        if (!newSummary) throw new Error("AI返回摘要为空");

        summaryInput.value = newSummary;
        showStatus('✅ 摘要已智能更新，记得保存！', 'success');

    } catch (e) {
        showStatus('摘要生成失败: ' + e.message, 'error');
    } finally {
        btn.innerText = originText;
        btn.disabled = false;
    }
}
