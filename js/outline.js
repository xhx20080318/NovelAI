import { generateUniqueId, escapeHtml } from './config.js';
import { showStatus } from './ui.js';
import { getCurrentSession, saveSessions } from './storage.js';

// 大纲状态
let outlineNodes = [];
let selectedNodeId = null;
let currentSession = null;

// 节点状态常量
export const NODE_STATUS = {
    LOCKED: 'locked',
    PLANNED: 'planned',
    WRITING: 'writing',
    COMPLETED: 'completed'
};

// 状态图标映射
const STATUS_ICONS = {
    [NODE_STATUS.LOCKED]: '🔒',
    [NODE_STATUS.PLANNED]: '⚪',
    [NODE_STATUS.WRITING]: '📝',
    [NODE_STATUS.COMPLETED]: '✅'
};

// 状态文本映射
const STATUS_TEXT = {
    [NODE_STATUS.LOCKED]: '锁定',
    [NODE_STATUS.PLANNED]: '计划中',
    [NODE_STATUS.WRITING]: '进行中',
    [NODE_STATUS.COMPLETED]: '已完成'
};

// 初始化大纲
export function initOutline(session) {
    currentSession = session;
    if (!session.storyOutline) {
        session.storyOutline = {
            nodes: [],
            currentNodeId: null,
            strictMode: true
        };
    }
    outlineNodes = session.storyOutline.nodes || [];
    selectedNodeId = null;
    
    // 确保所有节点都有依赖数组
    outlineNodes.forEach(node => {
        if (!node.dependencies) node.dependencies = [];
        if (!node.dependents) node.dependents = [];
    });
    
    updateAllNodeStatuses();
    renderOutlineList();
    renderOutlineEditor();
}

// 获取卷数的中文表示
function getVolumeText(order) {
    const volumes = ['第一卷', '第二卷', '第三卷', '第四卷', '第五卷', '第六卷', '第七卷', '第八卷', '第九卷', '第十卷'];
    if (order <= 10) return volumes[order - 1];
    return `第${order}卷`;
}

// 创建新节点
export function createOutlineNode() {
    const order = outlineNodes.length + 1;
    const newNode = {
        id: generateUniqueId(),
        title: `${getVolumeText(order)}：`,
        description: '',
        status: NODE_STATUS.PLANNED,
        order: order,
        dependencies: [],
        dependents: [],
        wordCountGoal: 50000,
        novelChapters: {
            start: null,
            end: null
        },
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    outlineNodes.push(newNode);
    
    // 同时创建对应的 volume
    const session = getCurrentSession();
    if (session && session.chapters) {
        if (!session.chapters.volumes) {
            session.chapters.volumes = [];
        }
        session.chapters.volumes.push({
            id: newNode.id,
            title: newNode.title.replace(/：$/, ''), // 去掉末尾的冒号
            startChapter: null,
            endChapter: null,
            nodeId: newNode.id
        });
        saveSessions();
    }
    
    updateAllNodeStatuses();
    saveOutline();
    renderOutlineList();
    selectOutlineNode(newNode.id);
    
    return newNode;
}

// 删除节点
export function deleteOutlineNode(nodeId) {
    const node = outlineNodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // 检查是否有其他节点依赖此节点
    if (node.dependents && node.dependents.length > 0) {
        const dependentTitles = node.dependents
            .map(id => outlineNodes.find(n => n.id === id)?.title)
            .filter(Boolean)
            .join('、');
        if (!confirm(`"${node.title}"被以下分卷依赖：\n${dependentTitles}\n\n删除后将移除这些依赖关系，是否继续？`)) {
            return;
        }
        
        // 从依赖节点的dependencies中移除
        node.dependents.forEach(depId => {
            const depNode = outlineNodes.find(n => n.id === depId);
            if (depNode && depNode.dependencies) {
                depNode.dependencies = depNode.dependencies.filter(id => id !== nodeId);
            }
        });
    }
    
    // 删除对应的 volume 并清除章节的 outlineNodeId
    const session = getCurrentSession();
    if (session && session.chapters) {
        // 清除关联的章节的 outlineNodeId
        if (session.chapters.list) {
            session.chapters.list.forEach(chapter => {
                if (chapter.outlineNodeId === nodeId) {
                    chapter.outlineNodeId = null;
                }
            });
        }
        
        // 删除对应的 volume
        if (session.chapters.volumes) {
            session.chapters.volumes = session.chapters.volumes.filter(v => v.nodeId !== nodeId);
        }
        
        saveSessions();
    }
    
    outlineNodes = outlineNodes.filter(n => n.id !== nodeId);
    
    // 重新排序
    outlineNodes.forEach((n, index) => {
        n.order = index + 1;
    });
    
    if (selectedNodeId === nodeId) {
        selectedNodeId = null;
    }
    
    // 如果删除的是当前进行中的节点，清除currentNodeId
    if (currentSession?.storyOutline?.currentNodeId === nodeId) {
        currentSession.storyOutline.currentNodeId = null;
    }
    
    updateAllNodeStatuses();
    saveOutline();
    renderOutlineList();
    renderOutlineEditor();
    
    // 触发章节列表重新渲染
    window.dispatchEvent(new CustomEvent('chaptersUpdated'));
    
    showStatus('分卷已删除', 'success');
}

// 选择节点
export function selectOutlineNode(nodeId) {
    selectedNodeId = nodeId;
    renderOutlineList();
    renderOutlineEditor();
}

// 更新节点
export function updateOutlineNode(nodeId, updates) {
    const node = outlineNodes.find(n => n.id === nodeId);
    if (!node) return;
    
    Object.assign(node, updates, { updatedAt: new Date().toISOString() });
    saveOutline();
}

// 更新节点状态
export function updateNodeStatus(nodeId, newStatus) {
    const node = outlineNodes.find(n => n.id === nodeId);
    if (!node) return false;
    
    // 检查状态转换是否合法
    if (newStatus === NODE_STATUS.WRITING) {
        if (!canStartWriting(nodeId)) {
            const unmetDeps = getUnmetDependencies(nodeId);
            showStatus(`请先完成前置分卷: ${unmetDeps.map(n => n.title).join('、')}`, 'error');
            return false;
        }
        
        // 将其他writing状态的节点改为completed
        outlineNodes.forEach(n => {
            if (n.id !== nodeId && n.status === NODE_STATUS.WRITING) {
                n.status = NODE_STATUS.COMPLETED;
            }
        });
        
        // 设置为当前节点
        if (currentSession?.storyOutline) {
            currentSession.storyOutline.currentNodeId = nodeId;
        }
    }
    
    node.status = newStatus;
    
    // 更新所有节点的状态（解锁等）
    updateAllNodeStatuses();
    saveOutline();
    renderOutlineList();
    
    return true;
}

// 检查节点是否可以开始写作
export function canStartWriting(nodeId) {
    const node = outlineNodes.find(n => n.id === nodeId);
    if (!node || !node.dependencies || node.dependencies.length === 0) {
        return true;
    }
    
    return node.dependencies.every(depId => {
        const depNode = outlineNodes.find(n => n.id === depId);
        return depNode && depNode.status === NODE_STATUS.COMPLETED;
    });
}

// 获取未满足的依赖
export function getUnmetDependencies(nodeId) {
    const node = outlineNodes.find(n => n.id === nodeId);
    if (!node || !node.dependencies) return [];
    
    return node.dependencies
        .map(depId => outlineNodes.find(n => n.id === depId))
        .filter(depNode => depNode && depNode.status !== NODE_STATUS.COMPLETED);
}

// 更新所有节点的状态
function updateAllNodeStatuses() {
    outlineNodes.forEach(node => {
        // 更新dependents
        node.dependents = outlineNodes
            .filter(n => n.dependencies && n.dependencies.includes(node.id))
            .map(n => n.id);
        
        // 如果不是writing或completed，检查是否应该locked
        if (node.status !== NODE_STATUS.WRITING && node.status !== NODE_STATUS.COMPLETED) {
            if (!canStartWriting(node.id)) {
                node.status = NODE_STATUS.LOCKED;
            } else if (node.status === NODE_STATUS.LOCKED) {
                node.status = NODE_STATUS.PLANNED;
            }
        }
    });
}

// 添加依赖关系
export function addDependency(nodeId, dependencyId) {
    if (nodeId === dependencyId) {
        showStatus('不能依赖自己', 'error');
        return false;
    }
    
    const node = outlineNodes.find(n => n.id === nodeId);
    const depNode = outlineNodes.find(n => n.id === dependencyId);
    
    if (!node || !depNode) return false;
    
    // 检查循环依赖
    if (wouldCreateCycle(nodeId, dependencyId)) {
        showStatus('不能添加循环依赖', 'error');
        return false;
    }
    
    if (!node.dependencies) node.dependencies = [];
    if (!node.dependencies.includes(dependencyId)) {
        node.dependencies.push(dependencyId);
        updateAllNodeStatuses();
        saveOutline();
        renderOutlineEditor();
        return true;
    }
    return false;
}

// 移除依赖关系
export function removeDependency(nodeId, dependencyId) {
    const node = outlineNodes.find(n => n.id === nodeId);
    if (!node || !node.dependencies) return;
    
    node.dependencies = node.dependencies.filter(id => id !== dependencyId);
    updateAllNodeStatuses();
    saveOutline();
    renderOutlineEditor();
}

// 检查是否会创建循环依赖
function wouldCreateCycle(nodeId, newDepId) {
    const visited = new Set();
    const stack = [newDepId];
    
    while (stack.length > 0) {
        const current = stack.pop();
        if (current === nodeId) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        
        const node = outlineNodes.find(n => n.id === current);
        if (node && node.dependencies) {
            stack.push(...node.dependencies);
        }
    }
    return false;
}

// 保存大纲
function saveOutline() {
    if (currentSession && currentSession.storyOutline) {
        currentSession.storyOutline.nodes = outlineNodes;
    }
}

// 渲染大纲列表
export function renderOutlineList() {
    const list = document.getElementById('outlineNodeList');
    if (!list) return;
    
    list.innerHTML = '';
    
    // 按order排序
    const sortedNodes = [...outlineNodes].sort((a, b) => a.order - b.order);
    
    sortedNodes.forEach(node => {
        const div = document.createElement('div');
        const isActive = node.id === selectedNodeId;
        const isCurrent = currentSession?.storyOutline?.currentNodeId === node.id;
        
        div.className = `outline-item ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`;
        div.dataset.id = node.id;
        div.onclick = () => {
            window.selectOutlineNode(node.id);
        };
        
        const icon = STATUS_ICONS[node.status] || '⚪';
        const statusText = STATUS_TEXT[node.status] || '未知';
        
        const volumeText = getVolumeText(node.order);
        div.innerHTML = `
            <div class="outline-item-main">
                <span class="outline-status-icon" title="${statusText}">${icon}</span>
                <span class="outline-title">${escapeHtml(volumeText)} ${escapeHtml(node.title.replace(volumeText, '').replace('：', ''))}</span>
                ${isCurrent ? '<span class="outline-current-badge">当前</span>' : ''}
            </div>
            ${node.dependencies && node.dependencies.length > 0 ? `
                <div class="outline-deps-hint">
                    前置: ${node.dependencies.length}卷
                </div>
            ` : ''}
        `;
        
        list.appendChild(div);
    });
    
    // 更新计数
    const countEl = document.getElementById('outlineNodeCount');
    if (countEl) {
        countEl.textContent = `${outlineNodes.length} 卷`;
    }
}

// 渲染大纲编辑器
export function renderOutlineEditor() {
    const editor = document.getElementById('outlineEditorArea');
    const emptyState = document.getElementById('outlineEmptyState');
    
    if (!editor || !emptyState) return;
    
    if (!selectedNodeId) {
        editor.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    const node = outlineNodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    
    editor.style.display = 'flex';
    emptyState.style.display = 'none';
    
    // 填充表单
    const titleInput = document.getElementById('outlineTitle');
    const statusSelect = document.getElementById('outlineStatus');
    const descTextarea = document.getElementById('outlineDescription');
    const wordCountInput = document.getElementById('outlineWordCount');
    const chapterStartInput = document.getElementById('outlineChapterStart');
    const chapterEndInput = document.getElementById('outlineChapterEnd');
    const notesTextarea = document.getElementById('outlineNotes');
    
    if (titleInput) titleInput.value = node.title || '';
    if (statusSelect) {
        statusSelect.value = node.status;
        // 如果节点被锁定，禁用writing选项
        const writingOption = statusSelect.querySelector('option[value="writing"]');
        if (writingOption) {
            writingOption.disabled = !canStartWriting(node.id);
        }
    }
    if (descTextarea) descTextarea.value = node.description || '';
    if (wordCountInput) wordCountInput.value = node.wordCountGoal || '';
    if (chapterStartInput) chapterStartInput.value = node.novelChapters?.start || '';
    if (chapterEndInput) chapterEndInput.value = node.novelChapters?.end || '';
    if (notesTextarea) notesTextarea.value = node.notes || '';
    
    // 渲染依赖关系
    renderDependenciesEditor(node);
}

// 渲染依赖关系编辑器
function renderDependenciesEditor(node) {
    const depsContainer = document.getElementById('outlineDependencies');
    const availableDepsContainer = document.getElementById('outlineAvailableDeps');
    
    if (!depsContainer) return;
    
    // 当前依赖
    depsContainer.innerHTML = '';
    if (node.dependencies && node.dependencies.length > 0) {
        node.dependencies.forEach(depId => {
            const depNode = outlineNodes.find(n => n.id === depId);
            if (!depNode) return;
            
            const depDiv = document.createElement('div');
            depDiv.className = 'dependency-tag';
            const statusIcon = STATUS_ICONS[depNode.status] || '⚪';
            const volumeText = getVolumeText(depNode.order);
            depDiv.innerHTML = `
                <span>${statusIcon} ${escapeHtml(volumeText)} ${escapeHtml(depNode.title.replace(volumeText, '').replace('：', ''))}</span>
                <button onclick="removeOutlineDependency('${node.id}', '${depId}')">×</button>
            `;
            depsContainer.appendChild(depDiv);
        });
    } else {
        depsContainer.innerHTML = '<span class="no-deps-hint">暂无前置分卷</span>';
    }
    
    // 可添加的依赖（排除自己和当前依赖）
    if (availableDepsContainer) {
        const availableNodes = outlineNodes.filter(n => 
            n.id !== node.id && 
            (!node.dependencies || !node.dependencies.includes(n.id))
        );
        
        availableDepsContainer.innerHTML = '';
        if (availableNodes.length > 0) {
            const select = document.createElement('select');
            select.className = 'wb-input';
            select.innerHTML = '<option value="">添加前置分卷...</option>' +
                availableNodes.map(n => {
                    const icon = STATUS_ICONS[n.status] || '⚪';
                    const volumeText = getVolumeText(n.order);
                    return `<option value="${n.id}">${icon} ${escapeHtml(volumeText)} ${escapeHtml(n.title.replace(volumeText, '').replace('：', ''))}</option>`;
                }).join('');
            select.onchange = (e) => {
                if (e.target.value) {
                    addDependency(node.id, e.target.value);
                    e.target.value = '';
                }
            };
            availableDepsContainer.appendChild(select);
        }
    }
}

// 保存当前编辑的节点
export function saveCurrentOutlineNode() {
    if (!selectedNodeId) return;
    
    const node = outlineNodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    
    const titleInput = document.getElementById('outlineTitle');
    const statusSelect = document.getElementById('outlineStatus');
    const descTextarea = document.getElementById('outlineDescription');
    const wordCountInput = document.getElementById('outlineWordCount');
    const chapterStartInput = document.getElementById('outlineChapterStart');
    const chapterEndInput = document.getElementById('outlineChapterEnd');
    const notesTextarea = document.getElementById('outlineNotes');
    
    // 处理状态变更
    if (statusSelect && statusSelect.value !== node.status) {
        if (!updateNodeStatus(node.id, statusSelect.value)) {
            // 状态更新失败，恢复选择
            statusSelect.value = node.status;
            return;
        }
    }
    
    node.title = titleInput?.value || node.title;
    node.description = descTextarea?.value || '';
    node.wordCountGoal = parseInt(wordCountInput?.value) || 0;
    node.novelChapters = {
        start: parseInt(chapterStartInput?.value) || null,
        end: parseInt(chapterEndInput?.value) || null
    };
    node.notes = notesTextarea?.value || '';
    node.updatedAt = new Date().toISOString();
    
    // 同步更新 volume 和章节关联
    const session = getCurrentSession();
    if (session && session.chapters && session.chapters.volumes) {
        const volume = session.chapters.volumes.find(v => v.nodeId === node.id);
        if (volume) {
            volume.title = node.title.replace(/：$/, '');
            volume.startChapter = node.novelChapters.start;
            volume.endChapter = node.novelChapters.end;
        }
        
        // 更新章节的 outlineNodeId
        if (session.chapters.list && node.novelChapters.start) {
            const startChapter = node.novelChapters.start;
            const endChapter = node.novelChapters.end || startChapter;
            
            session.chapters.list.forEach(chapter => {
                if (chapter.number >= startChapter && chapter.number <= endChapter) {
                    chapter.outlineNodeId = node.id;
                }
            });
        }
        
        saveSessions();
    }
    
    saveOutline();
    renderOutlineList();
    
    // 触发章节列表重新渲染以显示分卷信息
    window.dispatchEvent(new CustomEvent('chaptersUpdated'));
    
    showStatus('分卷已保存', 'success');
}

// 获取大纲上下文（用于AI Prompt）
export function getOutlineContext() {
    if (!outlineNodes || outlineNodes.length === 0) {
        return null;
    }
    
    const sortedNodes = [...outlineNodes].sort((a, b) => a.order - b.order);
    const currentNodeId = currentSession?.storyOutline?.currentNodeId;
    
    let context = '【故事结构规划 - 分卷大纲】\n';
    context += '⚠️ 注意：以下是你需要遵循的分卷规划，请严格按照分卷顺序推进剧情。\n\n';
    
    sortedNodes.forEach(node => {
        const icon = STATUS_ICONS[node.status] || '⚪';
        const isCurrent = node.id === currentNodeId;
        const marker = isCurrent ? ' ← 当前分卷' : '';
        const volumeText = getVolumeText(node.order);
        
        context += `${icon} [${STATUS_TEXT[node.status]}] ${volumeText}：${node.title.replace(volumeText, '').replace('：', '')}${marker}\n`;
        
        if (node.novelChapters?.start) {
            const endText = node.novelChapters.end ? `-${node.novelChapters.end}` : '+';
            context += `   └─ 对应小说第${node.novelChapters.start}${endText}章\n`;
        }
        
        if (node.dependencies && node.dependencies.length > 0) {
            const depTitles = node.dependencies
                .map(id => {
                    const depNode = outlineNodes.find(n => n.id === id);
                    if (depNode) {
                        return getVolumeText(depNode.order) + ' ' + depNode.title.replace(getVolumeText(depNode.order), '').replace('：', '');
                    }
                    return null;
                })
                .filter(Boolean);
            if (depTitles.length > 0) {
                context += `   └─ 前置分卷: ${depTitles.join('、')}\n`;
            }
        }
        
        if (isCurrent && node.description) {
            context += `   └─ 本卷概要：${node.description}\n`;
        }
        
        context += '\n';
    });
    
    const currentNode = outlineNodes.find(n => n.id === currentNodeId);
    if (currentNode) {
        const currentVolumeText = getVolumeText(currentNode.order);
        context += `当前任务：继续撰写${currentVolumeText}「${currentNode.title.replace(currentVolumeText, '').replace('：', '')}」的内容。\n`;
        if (currentNode.wordCountGoal > 0) {
            context += `本卷目标字数：约${currentNode.wordCountGoal}字。\n`;
        }
        if (currentNode.notes) {
            context += `写作提示：${currentNode.notes}\n`;
        }
    }
    
    return context;
}

// 获取当前进行中的节点
export function getCurrentOutlineNode() {
    const currentNodeId = currentSession?.storyOutline?.currentNodeId;
    if (!currentNodeId) return null;
    return outlineNodes.find(n => n.id === currentNodeId);
}

// 获取所有节点
export function getOutlineNodes() {
    return outlineNodes;
}

// 设置当前会话
export function setCurrentOutlineSession(session) {
    currentSession = session;
}
