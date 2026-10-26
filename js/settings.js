import { appConfig, DEFAULT_SYSTEM_PROMPT, DEFAULT_SUMMARY_PROMPT, updateConfig } from './config.js';
import { showStatus, updateSlider, updateModelDisplay } from './ui.js';

// 打开设置
export function openSettings() {
    document.getElementById('settingsModal').style.display = 'flex';

    // 重新从 config 加载到 UI
    document.getElementById('apiUrl').value = appConfig.apiUrl || "";
    document.getElementById('apiKey').value = appConfig.apiKey || "";
    document.getElementById('modelInput').value = appConfig.model || "";
    document.getElementById('systemPromptInput').value = appConfig.systemPrompt || "";
    document.getElementById('summaryPromptTemplate').value = appConfig.summaryPrompt || DEFAULT_SUMMARY_PROMPT;

    updateUIFromConfig();
}

// 关闭设置
export function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
    document.getElementById('promptFileName').innerText = '';
}

// 保存设置
export function saveConfig() {
    const newConfig = {
        apiUrl: document.getElementById('apiUrl').value.trim(),
        apiKey: document.getElementById('apiKey').value.trim(),
        model: document.getElementById('modelInput').value.trim(),
        systemPrompt: document.getElementById('systemPromptInput').value,
        summaryPrompt: document.getElementById('summaryPromptTemplate').value,
        temperature: parseFloat(document.getElementById('paramTemp').value),
        top_p: parseFloat(document.getElementById('paramTopP').value),
        presence_penalty: parseFloat(document.getElementById('paramPres').value),
        frequency_penalty: parseFloat(document.getElementById('paramFreq').value),
        max_tokens: parseInt(document.getElementById('paramMaxTok').value),
        min_tokens: parseInt(document.getElementById('paramMinTok').value),
        history_limit: parseInt(document.getElementById('paramCtx').value),
        show_floor: document.getElementById('paramShowFloor').checked
    };

    updateConfig(newConfig);
    updateModelDisplay(newConfig.model);

    showStatus('配置已保存', 'success');
    closeSettings();
}

// 从配置更新 UI
export function updateUIFromConfig() {
    const modelInput = document.getElementById('modelInput');
    const systemPromptInput = document.getElementById('systemPromptInput');
    const summaryPromptTemplate = document.getElementById('summaryPromptTemplate');

    if (modelInput) modelInput.value = appConfig.model || '';
    if (systemPromptInput) systemPromptInput.value = appConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    if (summaryPromptTemplate) summaryPromptTemplate.value = appConfig.summaryPrompt || DEFAULT_SUMMARY_PROMPT;

    const setSlider = (id, val, displayId) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = val;
            updateSlider(displayId, val);
        }
    };

    setSlider('paramTemp', appConfig.temperature, 'val_temp');
    setSlider('paramTopP', appConfig.top_p, 'val_topp');
    setSlider('paramPres', appConfig.presence_penalty, 'val_pres');
    setSlider('paramFreq', appConfig.frequency_penalty, 'val_freq');
    setSlider('paramMaxTok', appConfig.max_tokens || 2000, 'val_max_tok');
    setSlider('paramMinTok', appConfig.min_tokens || 0, 'val_min_tok');
    setSlider('paramCtx', appConfig.history_limit !== undefined ? appConfig.history_limit : 10, 'val_ctx');

    const showFloorCheck = document.getElementById('paramShowFloor');
    if (showFloorCheck) showFloorCheck.checked = appConfig.show_floor || false;
}

// 恢复默认摘要提示词
export function restoreDefaultSummaryPrompt() {
    if (confirm("确定要恢复默认的总结提示词吗？")) {
        document.getElementById('summaryPromptTemplate').value = DEFAULT_SUMMARY_PROMPT;
    }
}

// 导出配置预设
export function exportConfigPreset() {
    const currentPrompt = document.getElementById('systemPromptInput').value;

    const preset = {
        name: "AI Novelist Preset",
        exported_at: new Date().toISOString(),
        systemPrompt: currentPrompt,
        summaryPrompt: appConfig.summaryPrompt,
        parameters: {
            model: document.getElementById('modelInput').value,
            temperature: parseFloat(document.getElementById('paramTemp').value),
            top_p: parseFloat(document.getElementById('paramTopP').value),
            presence_penalty: parseFloat(document.getElementById('paramPres').value),
            frequency_penalty: parseFloat(document.getElementById('paramFreq').value),
            max_tokens: parseInt(document.getElementById('paramMaxTok').value || 2000),
            min_tokens: parseInt(document.getElementById('paramMinTok').value || 0),
            history_limit: parseInt(document.getElementById('paramCtx').value || 10),
            show_floor: document.getElementById('paramShowFloor').checked
        }
    };

    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Preset_${preset.parameters.model || 'config'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('预设参数已导出 (JSON) ✅', 'success');
}

// 重置配置预设
export function resetConfigPreset() {
    if (!confirm("确定要清除当前的系统提示词和参数设置吗？")) return;

    const defaultConfig = {
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

    updateConfig(defaultConfig);
    updateUIFromConfig();
    showStatus('设置已重置为默认值', 'info');
}

// 智能加载配置
export function smartLoadConfig(input) {
    const file = input.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileNameEl = document.getElementById('promptFileName');
    if (fileNameEl) fileNameEl.innerText = "已加载: " + fileName;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;

        if (fileName.endsWith('.json')) {
            try {
                const data = JSON.parse(content);

                let finalPrompt = data.system_prompt_template || data.systemPrompt || DEFAULT_SYSTEM_PROMPT;
                let summaryPrompt = data.summaryPrompt || appConfig.summaryPrompt;

                let extraRules = [];
                if (data.anti_ai_patterns) {
                    const { forbidden_phrases, discouraged_structures } = data.anti_ai_patterns;
                    let antiList = [];
                    if (Array.isArray(forbidden_phrases)) antiList.push(`- 绝对禁止词汇：${forbidden_phrases.join("、")}`);
                    if (Array.isArray(discouraged_structures)) antiList.push(`- 避免使用的句式：${discouraged_structures.join("；")}`);
                    if (antiList.length > 0) extraRules.push(`【避坑指南 / 负面约束】\n${antiList.join('\n')}`);
                }

                if (data.description_guidelines) {
                    const { show_dont_tell, sensory_focus } = data.description_guidelines;
                    let descList = [];
                    if (show_dont_tell) descList.push("- 必须遵循 'Show, Don't Tell' (展示而非讲述) 原则。");
                    if (Array.isArray(sensory_focus)) descList.push(`- 描写重点关注感官：${sensory_focus.join("+")}`);
                    if (descList.length > 0) extraRules.push(`【描写细则】\n${descList.join('\n')}`);
                }

                if (extraRules.length > 0) {
                    finalPrompt += "\n\n=== 详细补充规则 (系统自动提取) ===\n";
                    finalPrompt += extraRules.join("\n\n");
                }

                const promptInput = document.getElementById('systemPromptInput');
                const summaryInput = document.getElementById('summaryPromptTemplate');

                if (promptInput) promptInput.value = finalPrompt;
                if (summaryInput) summaryInput.value = summaryPrompt;

                if (data.parameters) {
                    const p = data.parameters;
                    const updates = {};
                    if (p.temperature !== undefined) updates.temperature = p.temperature;
                    if (p.top_p !== undefined) updates.top_p = p.top_p;
                    if (p.max_tokens !== undefined) updates.max_tokens = p.max_tokens;
                    if (p.min_tokens !== undefined) updates.min_tokens = p.min_tokens;
                    if (p.history_limit !== undefined) updates.history_limit = p.history_limit;
                    if (p.model) updates.model = p.model;
                    if (p.show_floor !== undefined) updates.show_floor = p.show_floor;

                    updateConfig(updates);
                    updateUIFromConfig();
                    showStatus('配置与详细规则已完整加载 ✅', 'success');
                } else {
                    showStatus('写作规范与细则已应用 ✅', 'success');
                }

            } catch (err) {
                console.error(err);
                showStatus('JSON 格式错误 ❌', 'error');
            }
        } else {
            const promptInput = document.getElementById('systemPromptInput');
            if (promptInput) promptInput.value = content;
            showStatus('纯文本人设已加载 (参数未变) 📄', 'success');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

// 同步模型选择器到输入框
export function syncModelInputFromSelector() {
    const selector = document.getElementById('modelSelector');
    const input = document.getElementById('modelInput');

    if (!selector || !input) return;

    const val = selector.value;
    if (val) input.value = val;
}
