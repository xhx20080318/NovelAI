import { appConfig } from './config.js';
import {
    getSessions,
    exportAllData,
    importAllData,
    exportSession,
    importSession
} from './storage.js';
import { showStatus } from './ui.js';

// 导出所有数据
export function exportData() {
    const data = exportAllData(appConfig);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `AI_Novelist_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('全库备份已下载 ✅', 'success');
}

// 导入数据
export function importData(inputElement, onSuccess) {
    const file = inputElement.files[0];
    if (!file) return;

    if (!confirm("⚠️ 严重警告：\n导入将彻底覆盖浏览器内现有的所有小说数据！\n\n请确认您已做好备份。继续吗？")) {
        inputElement.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            const config = importAllData(data);

            if (config) {
                Object.assign(appConfig, config);
            }

            showStatus('作品库恢复成功 ✅', 'success');
            if (onSuccess) onSuccess();

        } catch (err) {
            console.error(err);
            showStatus('文件损坏或格式错误 ❌', 'error');
        }
        inputElement.value = '';
    };
    reader.readAsText(file);
}

// 导出当前会话
export function exportCurrentSession(currentSessionId) {
    if (!currentSessionId) {
        showStatus('请先打开一本小说', 'error');
        return;
    }

    const exportData = exportSession(currentSessionId);
    if (!exportData) {
        showStatus('导出失败', 'error');
        return;
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = exportData.data.title.replace(/[\\/:*?"<>|]/g, "_");
    a.download = `${cleanTitle}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('作品已完整导出 (JSON)', 'success');
}

// 导入单个会话
export function importSingleSession(inputElement, onSuccess) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);
            let sessionToImport = null;

            if (json.type === "single_novel_export" && json.data) {
                sessionToImport = json.data;
            } else if (json.history && Array.isArray(json.history)) {
                sessionToImport = json;
            } else {
                throw new Error("无效的小说数据格式");
            }

            const newId = importSession(sessionToImport);
            showStatus(`已成功导入: ${sessionToImport.title}`, 'success');

            if (onSuccess) onSuccess(newId);

        } catch (err) {
            console.error(err);
            showStatus('导入失败：文件格式错误', 'error');
        }
        inputElement.value = '';
    };
    reader.readAsText(file);
}

// 导出为 TXT
export function exportCurrentToTxt(currentSessionId, chatSessions) {
    if (!currentSessionId || !chatSessions[currentSessionId]) {
        showStatus('请先打开一本小说', 'error');
        return;
    }

    const session = chatSessions[currentSessionId];
    let txtContent = `《${session.title}》\n`;
    txtContent += `导出时间：${new Date().toLocaleString()}\n`;
    txtContent += `========================================\n\n`;

    if (session.summary) {
        txtContent += `【前情提要】：\n${session.summary}\n`;
        txtContent += `========================================\n\n`;
    }

    session.history.forEach(msg => {
        if (msg.hidden) return;

        if (msg.role === 'user') {
            txtContent += `【指令】: ${msg.content}\n`;
            txtContent += `----------------------------------------\n`;
        } else {
            txtContent += `${msg.content}\n\n`;
        }
    });

    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('小说全文已导出 (TXT)', 'success');
}
