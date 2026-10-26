import { escapeHtml, countWords } from './config.js';
import { getCurrentSessionId, getSortedSessions, getCurrentSession } from './storage.js';

// 显示状态消息
export function showStatus(msg, type) {
    const el = document.getElementById('statusMessage');
    if (!el) return;

    el.textContent = msg;
    el.className = `status ${type}`;
    el.style.display = 'block';

    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'fadeInStatus 0.3s ease';

    if (el.timeoutId) clearTimeout(el.timeoutId);
    el.timeoutId = setTimeout(() => el.style.display = 'none', 3000);
}

// 调整文本域高度
export function adjustTextareaHeight(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 120), 500) + 'px';
}

// 更新滑块显示值
export function updateSlider(spanId, value) {
    const el = document.getElementById(spanId);
    if (el) el.innerText = value;
}

// 编辑滑块数值 - 点击数字时转换为输入框
export function editSliderValue(spanId, inputId, min, max, step) {
    const span = document.getElementById(spanId);
    if (!span) return;

    const currentValue = span.innerText;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.min = min;
    input.max = max;
    input.step = step;
    input.className = 'slider-value-input';
    input.style.width = '60px';
    input.style.fontSize = '12px';
    input.style.padding = '2px 4px';
    input.style.border = '1px solid var(--accent)';
    input.style.borderRadius = '4px';
    input.style.background = 'var(--bg-main)';
    input.style.color = 'var(--accent)';
    input.style.textAlign = 'center';

    // 替换span为input
    span.parentNode.replaceChild(input, span);
    input.focus();
    input.select();

    // 保存值的函数
    const saveValue = () => {
        let value = parseFloat(input.value);
        // 验证范围
        if (isNaN(value)) value = min;
        if (value < min) value = min;
        if (value > max) value = max;
        // 按步长取整
        value = Math.round(value / step) * step;
        // 保留合适的小数位数
        const decimalPlaces = step.toString().split('.')[1]?.length || 0;
        value = parseFloat(value.toFixed(decimalPlaces));

        // 更新滑块和显示值
        const slider = document.getElementById(inputId);
        if (slider) slider.value = value;

        // 创建新的span替换input
        const newSpan = document.createElement('span');
        newSpan.id = spanId;
        newSpan.className = 'slider-value';
        newSpan.innerText = value;
        newSpan.onclick = () => editSliderValue(spanId, inputId, min, max, step);
        input.parentNode.replaceChild(newSpan, input);
    };

    // 事件监听
    input.addEventListener('blur', saveValue);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveValue();
        } else if (e.key === 'Escape') {
            // 取消编辑，恢复原值
            const newSpan = document.createElement('span');
            newSpan.id = spanId;
            newSpan.className = 'slider-value';
            newSpan.innerText = currentValue;
            newSpan.onclick = () => editSliderValue(spanId, inputId, min, max, step);
            input.parentNode.replaceChild(newSpan, input);
        }
    });
}

// 渲染历史列表
export function renderHistoryList(sessions, onSelect, onRename, onDelete) {
    const list = document.getElementById('historyList');
    if (!list) return;

    list.innerHTML = '';
    const sorted = getSortedSessions();
    const currentId = getCurrentSessionId();

    sorted.forEach(s => {
        const div = document.createElement('div');
        const isActive = String(s.id) === String(currentId);
        div.className = `history-item ${isActive ? 'active' : ''}`;
        div.onclick = () => onSelect(s.id);
        div.innerHTML = `
            <span class="history-title"><span class="book-icon">📕</span>${escapeHtml(s.title)}</span>
            <div class="history-actions">
                <button class="icon-btn" data-action="rename" data-id="${s.id}" title="重命名">✏️</button>
                <button class="icon-btn delete" data-action="delete" data-id="${s.id}" title="删除">×</button>
            </div>
        `;
        list.appendChild(div);
    });

    // 绑定按钮事件
    list.querySelectorAll('[data-action="rename"]').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            onRename(btn.dataset.id);
        };
    });

    list.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            onDelete(btn.dataset.id);
        };
    });
}

// 更新字数统计
export function updateWordCount(history) {
    const display = document.getElementById('wordCountDisplay');
    if (!display) return;

    if (!history || history.length === 0) {
        display.textContent = '📝 0 字';
        display.title = '当前作品字数统计';
        return;
    }

    let totalChars = 0;
    let aiChars = 0;
    let userChars = 0;

    history.forEach(msg => {
        if (!msg.hidden && msg.content) {
            const wordCount = countWords(msg.content);
            totalChars += wordCount;
            if (msg.role === 'assistant') {
                aiChars += wordCount;
            } else {
                userChars += wordCount;
            }
        }
    });

    display.textContent = `📝 ${totalChars.toLocaleString()} 字`;
    display.title = `总字数: ${totalChars.toLocaleString()}\nAI创作: ${aiChars.toLocaleString()} 字\n用户输入: ${userChars.toLocaleString()} 字`;
}

// 设置输入状态
export function toggleInputState(enabled, isGeneratingRef) {
    isGeneratingRef.value = !enabled;
    const input = document.getElementById('userInput');
    const btn = document.getElementById('sendBtn');
    const wrapper = document.getElementById('inputWrapper');

    if (!input || !btn || !wrapper) return;

    input.disabled = !enabled;

    if (!enabled) {
        wrapper.classList.add('disabled');
        input.placeholder = "AI 正在撰写剧情...";
        // 将发送按钮变成终止按钮
        btn.innerHTML = '<svg viewBox="0 0 24 24" style="fill: #e57373;"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
        btn.title = "终止生成";
        btn.onclick = window.stopGeneration;
    } else {
        wrapper.classList.remove('disabled');
        input.placeholder = "输入下一段剧情指令...";
        // 恢复发送按钮
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>';
        btn.title = "发送消息";
        btn.onclick = window.sendMessage;
        setTimeout(() => input.focus(), 10);
    }
}

// 显示加载指示器
export function showLoadingIndicator(generateUniqueId) {
    const id = generateUniqueId();
    const historyDiv = document.getElementById('chatHistory');
    if (!historyDiv) return id;

    const div = document.createElement('div');
    div.id = `loading-${id}`;
    div.className = 'message-row ai';
    div.innerHTML = `
        <div class="message-role-name">AI Novelist</div>
        <div class="message-content loading">
            <div class="typing-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
        </div>
        <div class="loading-label">思考中...</div>
    `;
    historyDiv.appendChild(div);
    historyDiv.scrollTop = historyDiv.scrollHeight;
    return `loading-${id}`;
}

// 移除加载指示器
export function removeLoadingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// 更新当前标题
export function updateCurrentTitle(title) {
    const el = document.getElementById('currentTitle');
    if (el) el.textContent = title;
}

// 更新模型显示
export function updateModelDisplay(model) {
    const el = document.getElementById('currentModelDisplay');
    if (el) el.textContent = model || '未配置';
}
