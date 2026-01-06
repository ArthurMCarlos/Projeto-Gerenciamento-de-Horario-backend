const SALARY = 1625.75;
const STANDARD_HOURS = 8 * 60 + 48; 
const SATURDAY_WEEK_HOURS = 8 * 60; 

// Configurações do usuário (com valores padrão)
let userSettings = {
    standardHours: 8,
    standardMinutes: 48,
    saturdayHours: 8,
    salaryBase: 1625.75,
    extraMultiplier: 1.5,
    monthlyHours: 220,
    defaultView: 'table',
    dateFormat: 'dd/mm/yyyy',
    animationsEnabled: true,
    autoSaveEnabled: true
};

// Configurações de retry e heartbeat
const RETRY_CONFIG = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
};

const HEARTBEAT_INTERVAL = 120000; // 2 minutos em milissegundos

let workDays = [];
let filteredWorkDays = [];
let currentFilter = '';
let heartbeatInterval = null;
let isServerAwake = true;

// Adiciona estilos CSS dinamicamente
const styleElement = document.createElement('style');
styleElement.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 10000;
        max-width: 350px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateX(120%);
        transition: transform 0.3s ease;
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.fade-out {
        opacity: 0;
        transform: translateX(120%);
    }
    
    .notification.error {
        background: #e74c3c;
    }
    
    .notification.success {
        background: #27ae60;
    }
    
    .notification.info {
        background: #3498db;
    }
    
    .notification.warning {
        background: #f39c12;
    }
    
    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    }
    
    .loading-overlay p {
        color: white;
        margin-top: 15px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
    }
    
    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
    
    .connection-status {
        position: fixed;
        bottom: 10px;
        left: 10px;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 1000;
    }
    
    .connection-status.connected {
        background: #27ae60;
        color: white;
    }
    
    .connection-status.disconnected {
        background: #e74c3c;
        color: white;
    }
`;
document.head.appendChild(styleElement);

// Função wrapper para requisições com retry automático
async function apiRequest(url, options = {}, retryCount = 0) {
    const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount),
        RETRY_CONFIG.maxDelay
    );
    
    try {
        // Adiciona timestamp para evitar cache
        const cacheBuster = url.includes('?') ? '&' : '?';
        const cacheBustedUrl = `${url}${cacheBuster}_=${Date.now()}`;
        
        const response = await fetch(cacheBustedUrl, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Verifica se há conteúdo para retornar
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return { success: true };
        
    } catch (error) {
        console.warn(`Tentativa ${retryCount + 1} falhou para ${url}:`, error.message);
        
        if (retryCount < RETRY_CONFIG.maxAttempts - 1) {
            console.log(`Tentando novamente em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return apiRequest(url, options, retryCount + 1);
        } else {
            console.error('Todas as tentativas de reconexão falharam');
            throw new Error('Falha na conexão. Por favor, recarregue a página.');
        }
    }
}

// Função para verificar conexão com o servidor
async function checkServerConnection() {
    try {
        const response = await fetch('/api/ping?_=' + Date.now());
        if (response.ok) {
            const data = await response.json();
            isServerAwake = data.dbConnected;
            console.log('Servidor está online:', isServerAwake ? 'Conectado' : 'Desconectado');
            updateConnectionStatus();
            return true;
        }
        isServerAwake = false;
        updateConnectionStatus();
        return false;
    } catch (error) {
        console.warn('Perda de conexão detectada:', error.message);
        isServerAwake = false;
        updateConnectionStatus();
        return false;
    }
}

// Função para inicializar o heartbeat
function initializeHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    // Verifica conexão imediatamente
    checkServerConnection();
    
    heartbeatInterval = setInterval(async () => {
        try {
            await checkServerConnection();
        } catch (error) {
            console.error('Erro no heartbeat:', error.message);
            isServerAwake = false;
            updateConnectionStatus();
        }
    }, HEARTBEAT_INTERVAL);
    
    console.log('Heartbeat inicializado a cada ' + (HEARTBEAT_INTERVAL / 1000) + ' segundos');
}

// Função para pausar o heartbeat quando a aba estiver invisível
function pauseHeartbeatWhenHidden() {
    if (document.visibilityState === 'hidden') {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
            console.log('Heartbeat pausado (aba inativa)');
        }
    } else {
        if (!heartbeatInterval) {
            initializeHeartbeat();
            console.log('Heartbeat retomado');
        }
    }
}

// Funções de feedback visual
function showNotification(message, type = 'info') {
    // Remove notificações anteriores do mesmo tipo
    const existingNotification = document.querySelector(`.notification.${type}`);
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animação de entrada
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });
    
    // Remove após 3 segundos
    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showLoading(message = 'Processando...') {
    hideLoading();
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <p>${message}</p>
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.remove();
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Inicializa o indicador de status de conexão
    updateConnectionStatus();
    
    await loadTheme();
    await loadData();
    populateMonthFilter();
    renderTable();
    updateSummary();
    
    // Inicializa o sistema de heartbeat
    initializeHeartbeat();
    
    // Pausa heartbeat quando a aba não está visível
    document.addEventListener('visibilitychange', pauseHeartbeatWhenHidden);
});

async function getSavedData() {
    try {
        return await apiRequest('/api/work-days');
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        showNotification('Erro ao carregar dados. Tentando novamente...', 'error');
        return [];
    }
}

async function saveData() {
    try {
        await apiRequest('/api/work-days', {
            method: 'POST',
            body: JSON.stringify(workDays)
        });
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
        showNotification('Erro ao salvar dados. Os dados serão salvos quando a conexão for restaurada.', 'error');
        // Armazena localmente como backup
        localStorage.setItem('workDaysBackup', JSON.stringify(workDays));
    }
}

async function saveSettings(settings) {
    try {
        await apiRequest('/api/settings', {
            method: 'POST',
            body: JSON.stringify(settings)
        });
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        localStorage.setItem('settingsBackup', JSON.stringify(settings));
    }
}

// Nova função para salvar configurações do usuário
async function saveSettingsToAPI(settings) {
    try {
        await apiRequest('/api/user-settings', {
            method: 'POST',
            body: JSON.stringify(settings)
        });
    } catch (error) {
        console.error('Erro ao salvar configurações do usuário:', error);
        // Salva localmente como backup
        localStorage.setItem('userSettingsBackup', JSON.stringify(settings));
    }
}

async function getSettings() {
    try {
        return await apiRequest('/api/settings');
    } catch (error) {
        console.error('Erro ao buscar configurações:', error);
        return {};
    }
}

// Nova função para buscar configurações do usuário
async function getUserSettings() {
    try {
        const response = await apiRequest('/api/user-settings');
        return response || {};
    } catch (error) {
        console.error('Erro ao buscar configurações do usuário:', error);
        // Tenta carregar do backup local
        const backup = localStorage.getItem('userSettingsBackup');
        if (backup) {
            try {
                return JSON.parse(backup);
            } catch (e) {
                console.error('Erro ao carregar backup de configurações:', e);
            }
        }
        return {};
    }
}

async function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    
    await saveSettings({ theme: newTheme });
}

async function loadTheme() {
    try {
        const settings = await getSettings();
        if (settings.theme) {
            document.documentElement.setAttribute('data-theme', settings.theme);
        }
    } catch (error) {
        console.error('Erro ao carregar tema:', error);
    }
}

// Função para atualizar indicador de status de conexão
function updateConnectionStatus() {
    let statusElement = document.getElementById('connectionStatus');
    
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'connectionStatus';
        statusElement.className = 'connection-status';
        document.body.appendChild(statusElement);
    }
    
    if (isServerAwake) {
        statusElement.className = 'connection-status connected';
        statusElement.textContent = '● Conectado';
    } else {
        statusElement.className = 'connection-status disconnected';
        statusElement.textContent = '● Desconectado';
    }
}

async function loadData() {
    try {
        workDays = await getSavedData();
        if (!Array.isArray(workDays)) {
            workDays = [];
        }
        
        // Verifica se há backup local
        const backup = localStorage.getItem('workDaysBackup');
        if (backup && workDays.length === 0) {
            const backupData = JSON.parse(backup);
            if (Array.isArray(backupData) && backupData.length > 0) {
                showNotification('Dados restaurados do backup local', 'info');
                workDays = backupData;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        workDays = [];
        
        // Tenta carregar do backup local
        const backup = localStorage.getItem('workDaysBackup');
        if (backup) {
            try {
                const backupData = JSON.parse(backup);
                if (Array.isArray(backupData)) {
                    workDays = backupData;
                    showNotification('Dados carregados do backup local devido a problemas de conexão', 'warning');
                }
            } catch (e) {
                console.error('Erro ao carregar backup:', e);
            }
        }
    }
}

function clearAllData() {
    if (confirm('Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.')) {
        workDays = [];
        filteredWorkDays = [];
        currentFilter = '';
        document.getElementById('monthFilter').value = '';
        populateMonthFilter();
        renderTable();
        updateSummary();
        saveData(); 
    }
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    if (minutes === 0) return '0:00';
    const hours = Math.floor(Math.abs(minutes) / 60);
    const mins = Math.abs(minutes) % 60;
    const sign = minutes < 0 ? '-' : '';
    return `${sign}${hours}:${mins.toString().padStart(2, '0')}`;
}

function calculateDayHours(day) {
    const entrada = timeToMinutes(day.entrada);
    const saidaIntervalo = timeToMinutes(day.saidaIntervalo);
    const retornoIntervalo = timeToMinutes(day.retornoIntervalo);
    const saidaFinal = timeToMinutes(day.saidaFinal);

    if (!entrada || !saidaFinal) return { total: 0, extra: 0, negative: 0 };

    let totalMinutes = saidaFinal - entrada;

    if (saidaIntervalo && retornoIntervalo) {
        const intervalo = retornoIntervalo - saidaIntervalo;
        totalMinutes -= intervalo;
    }

    const expectedHours = day.sabado ? SATURDAY_WEEK_HOURS : STANDARD_HOURS;
    const difference = totalMinutes - expectedHours;

    return {
        total: totalMinutes,
        extra: difference > 0 ? difference : 0,
        negative: difference < 0 ? Math.abs(difference) : 0
    };
}

function addNewDay() {
    const today = new Date().toISOString().split('T')[0];
    const newDay = {
        id: Date.now(),
        data: today,
        entrada: '',
        saidaIntervalo: '',
        retornoIntervalo: '',
        saidaFinal: '',
        sabado: false
    };
    
    workDays.push(newDay);
    sortWorkDays();
    populateMonthFilter();
    renderTable();
    saveData();
}

function sortWorkDays() {
    workDays.sort((a, b) => new Date(a.data) - new Date(b.data));
}

function moveUp(id) {
    const currentDays = currentFilter ? filteredWorkDays : workDays;
    const index = currentDays.findIndex(day => day.id === id);
    if (index > 0) {
        const originalIndex = workDays.findIndex(day => day.id === id);
        const targetId = currentDays[index - 1].id;
        const targetOriginalIndex = workDays.findIndex(day => day.id === targetId);

        [workDays[originalIndex], workDays[targetOriginalIndex]] = 
        [workDays[targetOriginalIndex], workDays[originalIndex]];
        
        renderTable();
        saveData();
    }
}

function moveDown(id) {
    const currentDays = currentFilter ? filteredWorkDays : workDays;
    const index = currentDays.findIndex(day => day.id === id);
    if (index < currentDays.length - 1) {
        const originalIndex = workDays.findIndex(day => day.id === id);
        const targetId = currentDays[index + 1].id;
        const targetOriginalIndex = workDays.findIndex(day => day.id === targetId);
        
        [workDays[originalIndex], workDays[targetOriginalIndex]] = 
        [workDays[targetOriginalIndex], workDays[originalIndex]];
        
        renderTable();
        saveData();
    }
}

function removeDay(id) {
    if (confirm('Tem certeza que deseja remover este dia?')) {
        workDays = workDays.filter(day => day.id !== id);
        populateMonthFilter();
        renderTable();
        updateSummary();
        saveData();
    }
}

function updateField(id, field, value) {
    const day = workDays.find(d => d.id === id);
    if (day) {
        if (field === 'sabado') {
            day[field] = value;
        } else {
            day[field] = value;
        }

        if (field === 'data') {
            sortWorkDays();
            populateMonthFilter();
        }
        
        renderTable();
        updateSummary();
        saveData();
    }
}

function populateMonthFilter() {
    const monthFilter = document.getElementById('monthFilter');
    const months = new Set();
    
    workDays.forEach(day => {
        if (day.data) {
            const month = day.data.substring(0, 7); 
            months.add(month);
        }
    });
    
    const sortedMonths = Array.from(months).sort().reverse();
    
    while (monthFilter.children.length > 1) {
        monthFilter.removeChild(monthFilter.lastChild);
    }
    
    // Mapeamento de números para nomes de meses em português
    const monthNames = {
        '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
        '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
        '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro'
    };
    
    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        const [year, monthNum] = month.split('-');
        const monthName = monthNames[monthNum];
        option.textContent = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
        monthFilter.appendChild(option);
    });
    
    if (currentFilter) {
        monthFilter.value = currentFilter;
    }
}

function filterByMonth() {
    const monthFilter = document.getElementById('monthFilter');
    currentFilter = monthFilter.value;
    
    if (currentFilter) {
        filteredWorkDays = workDays.filter(day => 
            day.data && day.data.startsWith(currentFilter)
        );
    } else {
        filteredWorkDays = [...workDays];
    }
    
    renderTable();
    updateSummary();
}

function renderTable() {
    const tbody = document.getElementById('hoursTableBody');
    tbody.innerHTML = '';

    const daysToShow = currentFilter ? filteredWorkDays : workDays;
    
    daysToShow.forEach((day, index) => {
        const hours = calculateDayHours(day);
        const row = document.createElement('tr');
        row.className = 'fade-in';
        
        row.innerHTML = `
            <td>
                <input type="date" value="${day.data}" 
                       onchange="updateField(${day.id}, 'data', this.value)">
            </td>
            <td>
                <input type="time" value="${day.entrada}" 
                       onchange="updateField(${day.id}, 'entrada', this.value)">
            </td>
            <td>
                <input type="time" value="${day.saidaIntervalo}" 
                       onchange="updateField(${day.id}, 'saidaIntervalo', this.value)">
            </td>
            <td>
                <input type="time" value="${day.retornoIntervalo}" 
                       onchange="updateField(${day.id}, 'retornoIntervalo', this.value)">
            </td>
            <td>
                <input type="time" value="${day.saidaFinal}" 
                       onchange="updateField(${day.id}, 'saidaFinal', this.value)">
            </td>
            <td class="hours-neutral">${minutesToTime(hours.total)}</td>
            <td class="hours-positive">${hours.extra > 0 ? minutesToTime(hours.extra) : '-'}</td>
            <td class="hours-negative">${hours.negative > 0 ? minutesToTime(hours.negative) : '-'}</td>
            <td>
                <input type="checkbox" ${day.sabado ? 'checked' : ''} 
                       onchange="updateField(${day.id}, 'sabado', this.checked)">
            </td>
            <td>
                <div class="actions-cell">
                    <button class="btn btn-move" onclick="moveUp(${day.id})" 
                            ${index === 0 ? 'disabled' : ''} title="Mover para cima">
                        ↑
                    </button>
                    <button class="btn btn-move" onclick="moveDown(${day.id})" 
                            ${index === daysToShow.length - 1 ? 'disabled' : ''} title="Mover para baixo">
                        ↓
                    </button>
                    <button class="btn btn-danger" onclick="removeDay(${day.id})" title="Remover">
                        🗑️
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });

    document.getElementById('filteredCount').textContent = `${daysToShow.length} dias`;
}

function updateSummary() {
    const daysToCalculate = currentFilter ? filteredWorkDays : workDays;
    
    let totalMinutes = 0;
    let totalExtraMinutes = 0;
    let totalNegativeMinutes = 0;
    let workDaysCount = 0;

    daysToCalculate.forEach(day => {
        const hours = calculateDayHours(day);
        totalMinutes += hours.total;
        totalExtraMinutes += hours.extra;
        totalNegativeMinutes += hours.negative;
        if (day.entrada && day.saidaFinal) {
            workDaysCount++;
        }
    });

    document.getElementById('totalHours').textContent = minutesToTime(totalMinutes);
    document.getElementById('totalExtraHours').textContent = minutesToTime(totalExtraMinutes);
    document.getElementById('totalNegativeHours').textContent = minutesToTime(totalNegativeMinutes);

    const hourlyRate = userSettings.salaryBase / userSettings.monthlyHours;
    const extraHourRate = hourlyRate * userSettings.extraMultiplier;
    const extraHoursValue = (totalExtraMinutes / 60) * extraHourRate;

    document.getElementById('extraHoursValue').textContent = 
        `R$ ${extraHoursValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Nova estatística: média diária
    const avgMinutes = workDaysCount > 0 ? totalMinutes / workDaysCount : 0;
    document.getElementById('dailyAverage').textContent = minutesToTime(avgMinutes);
    document.getElementById('workDaysCount').textContent = workDaysCount;

    updateBalanceIndicator(totalExtraMinutes, totalNegativeMinutes);
}

// ==================== FUNÇÕES DE CONFIGURAÇÕES ====================

async function openSettings() {
    await loadSettings();
    document.getElementById('settingsModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('show');
    document.body.style.overflow = '';
}

async function loadSettings() {
    try {
        const savedSettings = await getSettings();
        if (savedSettings && Object.keys(savedSettings).length > 0) {
            userSettings = { ...userSettings, ...savedSettings };
        }
        populateSettingsForm();
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
    }
}

function populateSettingsForm() {
    document.getElementById('standardHours').value = userSettings.standardHours;
    document.getElementById('standardMinutes').value = userSettings.standardMinutes;
    document.getElementById('saturdayHours').value = userSettings.saturdayHours;
    document.getElementById('salaryBase').value = userSettings.salaryBase;
    document.getElementById('extraMultiplier').value = userSettings.extraMultiplier;
    document.getElementById('monthlyHours').value = userSettings.monthlyHours;
    document.getElementById('defaultView').value = userSettings.defaultView;
    document.getElementById('dateFormat').value = userSettings.dateFormat;
    document.getElementById('animationsEnabled').checked = userSettings.animationsEnabled;
    document.getElementById('autoSaveEnabled').checked = userSettings.autoSaveEnabled;
}

async function saveSettings() {
    userSettings.standardHours = parseFloat(document.getElementById('standardHours').value) || 8;
    userSettings.standardMinutes = parseInt(document.getElementById('standardMinutes').value) || 0;
    userSettings.saturdayHours = parseFloat(document.getElementById('saturdayHours').value) || 8;
    userSettings.salaryBase = parseFloat(document.getElementById('salaryBase').value) || 1625.75;
    userSettings.extraMultiplier = parseFloat(document.getElementById('extraMultiplier').value) || 1.5;
    userSettings.monthlyHours = parseInt(document.getElementById('monthlyHours').value) || 220;
    userSettings.defaultView = document.getElementById('defaultView').value;
    userSettings.dateFormat = document.getElementById('dateFormat').value;
    userSettings.animationsEnabled = document.getElementById('animationsEnabled').checked;
    userSettings.autoSaveEnabled = document.getElementById('autoSaveEnabled').checked;

    await saveSettingsToAPI(userSettings);
    showNotification('Configurações salvas com sucesso!', 'success');
    closeSettings();
    renderTable();
    updateSummary();
}

function resetSettings() {
    if (confirm('Tem certeza que deseja resetar todas as configurações para os valores padrão?')) {
        userSettings = {
            standardHours: 8,
            standardMinutes: 48,
            saturdayHours: 8,
            salaryBase: 1625.75,
            extraMultiplier: 1.5,
            monthlyHours: 220,
            defaultView: 'table',
            dateFormat: 'dd/mm/yyyy',
            animationsEnabled: true,
            autoSaveEnabled: true
        };
        populateSettingsForm();
        showNotification('Configurações resetadas para padrão', 'info');
    }
}

// ==================== FUNÇÕES DE RELATÓRIOS ====================

let charts = {};

function openReports() {
    document.getElementById('reportsModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Define o mês atual nos seletores
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);
    document.getElementById('reportMonth').value = currentMonth;
    document.getElementById('compareMonth1').value = currentMonth;
    document.getElementById('compareMonth2').value = currentMonth;
    
    // Inicializa os gráficos
    setTimeout(() => {
        initReports();
    }, 100);
}

function closeReports() {
    document.getElementById('reportsModal').classList.remove('show');
    document.body.style.overflow = '';
    
    // Destrói os gráficos para liberar memória
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};
}

function switchReportTab(tabName) {
    // Atualiza os botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Atualiza as seções
    document.querySelectorAll('.report-section').forEach(section => section.classList.remove('active'));
    document.getElementById('report' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add('active');
    
    // Atualiza os dados do relatório
    if (tabName === 'overview') updateOverviewReport();
    else if (tabName === 'monthly') updateMonthlyReport();
    else if (tabName === 'trends') updateTrendReport();
    else if (tabName === 'compare') updateComparison();
}

function initReports() {
    updateOverviewReport();
    updateMonthlyReport();
    updateTrendReport();
    updateComparison();
}

function updateOverviewReport() {
    // Calcula estatísticas
    let totalDays = workDays.length;
    let totalMinutes = 0;
    let totalExtraMinutes = 0;
    
    workDays.forEach(day => {
        const hours = calculateDayHours(day);
        totalMinutes += hours.total;
        totalExtraMinutes += hours.extra;
    });
    
    const avgMinutes = totalDays > 0 ? totalMinutes / totalDays : 0;
    const hourlyRate = userSettings.salaryBase / userSettings.monthlyHours;
    const extraHourRate = hourlyRate * userSettings.extraMultiplier;
    const extraValue = (totalExtraMinutes / 60) * extraHourRate;
    
    // Atualiza cards de estatística
    document.getElementById('statTotalDays').textContent = totalDays;
    document.getElementById('statTotalHours').textContent = minutesToTime(totalMinutes);
    document.getElementById('statAvgHours').textContent = minutesToTime(avgMinutes);
    document.getElementById('statExtraValue').textContent = `R$ ${extraValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Gráfico de horas por mês
    const monthlyData = getMonthlyStats();
    
    if (charts.monthlyHours) charts.monthlyHours.destroy();
    const monthlyCtx = document.getElementById('monthlyHoursChart').getContext('2d');
    charts.monthlyHours = new Chart(monthlyCtx, {
        type: 'bar',
        data: {
            labels: monthlyData.labels,
            datasets: [{
                label: 'Horas Trabalhadas',
                data: monthlyData.hours,
                backgroundColor: 'rgba(37, 99, 235, 0.7)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return minutesToTime(value * 60); }
                    }
                }
            }
        }
    });
    
    // Gráfico de horas extras vs negativas
    if (charts.extraNegative) charts.extraNegative.destroy();
    const extraNegCtx = document.getElementById('extraNegativeChart').getContext('2d');
    charts.extraNegative = new Chart(extraNegCtx, {
        type: 'doughnut',
        data: {
            labels: ['Horas Extras', 'Horas Negativas', 'Horas Padrão'],
            datasets: [{
                data: [totalExtraMinutes, monthlyData.totalNegative, totalMinutes - totalExtraMinutes - monthlyData.totalNegative],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(100, 116, 139, 0.7)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)',
                    'rgba(100, 116, 139, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function getMonthlyStats() {
    const monthlyStats = {};
    let totalNegative = 0;
    
    workDays.forEach(day => {
        const month = day.data.substring(0, 7);
        const hours = calculateDayHours(day);
        
        if (!monthlyStats[month]) {
            monthlyStats[month] = { hours: 0, days: 0 };
        }
        
        monthlyStats[month].hours += hours.total;
        monthlyStats[month].days++;
        totalNegative += hours.negative;
    });
    
    const sortedMonths = Object.keys(monthlyStats).sort().reverse().slice(0, 6);
    
    // Corrigido: usar parsing de string para evitar problemas de timezone
    const monthNames = {
        '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
        '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
        '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
    };
    
    return {
        labels: sortedMonths.map(m => {
            const [, monthNum] = m.split('-');
            const year = m.split('-')[0].slice(-2);
            return `${monthNames[monthNum]}/${year}`;
        }),
        hours: sortedMonths.map(m => monthlyStats[m].hours / 60),
        totalNegative: totalNegative
    };
}

function updateMonthlyReport() {
    const selectedMonth = document.getElementById('reportMonth').value;
    if (!selectedMonth) return;
    
    const monthDays = workDays.filter(day => day.data && day.data.startsWith(selectedMonth));
    
    // Calcula dias úteis do mês - corrigido para evitar problemas de timezone
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    
    // Usar new Date(year, month, 0) para obter último dia do mês anterior
    // month é 1-12, mas Date usa 0-11, então month-1 é correto
    const daysInMonth = new Date(year, month, 0).getDate();
    let workDaysInMonth = 0;
    
    // Usar string parsing para evitar problemas de timezone
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
        const date = new Date(dateStr + 'T12:00:00'); // Usar meio-dia para evitar problemas de boundary
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            workDaysInMonth++;
        }
    }
    
    let totalMinutes = 0;
    let totalExtraMinutes = 0;
    let daysWorked = 0;
    
    monthDays.forEach(day => {
        const hours = calculateDayHours(day);
        totalMinutes += hours.total;
        totalExtraMinutes += hours.extra;
        if (day.entrada && day.saidaFinal) daysWorked++;
    });
    
    document.getElementById('monthWorkDays').textContent = workDaysInMonth;
    document.getElementById('monthDaysWorked').textContent = daysWorked;
    document.getElementById('monthTotalHours').textContent = minutesToTime(totalMinutes);
    document.getElementById('monthExtraHours').textContent = minutesToTime(totalExtraMinutes);
    
    // Gráfico diário
    if (charts.dailyHours) charts.dailyHours.destroy();
    
    const dailyData = {};
    monthDays.forEach(day => {
        const hours = calculateDayHours(day);
        dailyData[day.data] = hours.total;
    });
    
    const sortedDates = Object.keys(dailyData).sort();
    
    const dailyCtx = document.getElementById('dailyHoursChart').getContext('2d');
    charts.dailyHours = new Chart(dailyCtx, {
        type: 'bar',
        data: {
            labels: sortedDates.map(d => {
                // Extrair dia diretamente da string para evitar problemas de timezone
                return d.split('-')[2];
            }),
            datasets: [{
                label: 'Horas Trabalhadas',
                data: sortedDates.map(d => dailyData[d] / 60),
                backgroundColor: sortedDates.map(d => {
                    const hours = dailyData[d];
                    const expected = userSettings.standardHours * 60 + userSettings.standardMinutes;
                    if (hours > expected) return 'rgba(16, 185, 129, 0.7)';
                    if (hours < expected) return 'rgba(239, 68, 68, 0.7)';
                    return 'rgba(37, 99, 235, 0.7)';
                }),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return minutesToTime(value * 60); }
                    }
                }
            }
        }
    });
}

function updateTrendReport() {
    const period = parseInt(document.getElementById('trendPeriod').value);
    const months = getMonthsBack(period);
    
    const trendData = {};
    months.forEach(m => {
        trendData[m] = { extra: 0, negative: 0, total: 0, days: 0 };
    });
    
    workDays.forEach(day => {
        const month = day.data.substring(0, 7);
        if (trendData[month]) {
            const hours = calculateDayHours(day);
            trendData[month].extra += hours.extra;
            trendData[month].negative += hours.negative;
            trendData[month].total += hours.total;
            trendData[month].days++;
        }
    });
    
    // Gráfico de tendências
    if (charts.trend) charts.trend.destroy();
    
    // Corrigido: usar parsing de string para evitar problemas de timezone
    const monthNames = {
        '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
        '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
        '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
    };
    
    const trendCtx = document.getElementById('trendChart').getContext('2d');
    charts.trend = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: months.map(m => {
                const [, monthNum] = m.split('-');
                const year = m.split('-')[0].slice(-2);
                return `${monthNames[monthNum]}/${year}`;
            }),
            datasets: [
                {
                    label: 'Horas Extras',
                    data: months.map(m => trendData[m].extra / 60),
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Horas Negativas',
                    data: months.map(m => trendData[m].negative / 60),
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return minutesToTime(value * 60); }
                    }
                }
            }
        }
    });
    
    // Gera insights
    generateInsights(trendData, months);
}

function getMonthsBack(count) {
    const months = [];
    const today = new Date();
    
    for (let i = count - 1; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthStr = date.toISOString().slice(0, 7);
        months.push(monthStr);
    }
    
    return months;
}

function generateInsights(trendData, months) {
    const insights = [];
    const monthKeys = Object.keys(trendData);
    
    if (monthKeys.length < 2) {
        insights.push({ text: 'Colete mais dados para gerar insights precisos.', type: 'neutral' });
    } else {
        // Calcula tendência
        let totalExtra = 0;
        let totalNegative = 0;
        
        monthKeys.forEach(key => {
            totalExtra += trendData[key].extra;
            totalNegative += trendData[key].negative;
        });
        
        // Insight sobre horas extras
        if (totalExtra > totalNegative * 2) {
            insights.push({ 
                text: 'Você está tendo um bom equilíbrio de horas extras! Seu saldo geral está positivo.', 
                type: 'positive' 
            });
        } else if (totalNegative > totalExtra * 2) {
            insights.push({ 
                text: 'Cuidado! Você está acumulando muitas horas negativas. Considere ajustar sua rotina.', 
                type: 'negative' 
            });
        }
        
        // Insight sobre último mês
        const lastMonth = monthKeys[monthKeys.length - 1];
        const prevMonth = monthKeys[monthKeys.length - 2];
        
        if (trendData[lastMonth].extra > trendData[prevMonth].extra * 1.2) {
            insights.push({
                text: `O último mês teve ${Math.round((trendData[lastMonth].extra / trendData[prevMonth].extra - 1) * 100)}% mais horas extras que o mês anterior.`,
                type: 'neutral'
            });
        }
        
        // Insight sobre produtividade
        const avgHoursPerDay = monthKeys.reduce((sum, m) => sum + trendData[m].total, 0) / 
                               monthKeys.reduce((sum, m) => sum + trendData[m].days, 0);
        const expectedHours = userSettings.standardHours * 60 + userSettings.standardMinutes;
        
        if (avgHoursPerDay > expectedHours) {
            insights.push({
                text: `Sua média diária de trabalho está ${minutesToTime(avgHoursPerDay - expectedHours)} acima do esperado.`,
                type: 'neutral'
            });
        }
    }
    
    // Renderiza insights
    const insightsContent = document.getElementById('insightsContent');
    insightsContent.innerHTML = insights.map(i => 
        `<div class="insight-item ${i.type}">${i.text}</div>`
    ).join('');
}

function updateComparison() {
    const month1 = document.getElementById('compareMonth1').value;
    const month2 = document.getElementById('compareMonth2').value;
    
    if (!month1 || !month2) return;
    
    const stats1 = getMonthStats(month1);
    const stats2 = getMonthStats(month2);
    
    // Gráfico de comparação
    if (charts.comparison) charts.comparison.destroy();
    
    const compCtx = document.getElementById('comparisonChart').getContext('2d');
    charts.comparison = new Chart(compCtx, {
        type: 'bar',
        data: {
            labels: ['Horas Totais', 'Horas Extras', 'Horas Negativas', 'Dias Trab.'],
            datasets: [
                {
                    label: month1,
                    data: [stats1.totalHours, stats1.extraHours, stats1.negativeHours, stats1.days],
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1
                },
                {
                    label: month2,
                    data: [stats2.totalHours, stats2.extraHours, stats2.negativeHours, stats2.days],
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
    
    // Resumo da comparação
    const summaryEl = document.getElementById('comparisonSummary');
    summaryEl.innerHTML = `
        <div class="comparison-item">
            <div class="label">Horas Totais (${month1})</div>
            <div class="value">${minutesToTime(stats1.totalMinutes)}</div>
        </div>
        <div class="comparison-item">
            <div class="label">Horas Totais (${month2})</div>
            <div class="value">${minutesToTime(stats2.totalMinutes)}</div>
            <div class="diff ${stats2.totalMinutes >= stats1.totalMinutes ? 'positive' : 'negative'}">
                ${stats2.totalMinutes >= stats1.totalMinutes ? '+' : ''}${minutesToTime(stats2.totalMinutes - stats1.totalMinutes)}
            </div>
        </div>
        <div class="comparison-item">
            <div class="label">Horas Extras (${month1})</div>
            <div class="value">${minutesToTime(stats1.extraMinutes)}</div>
        </div>
        <div class="comparison-item">
            <div class="label">Horas Extras (${month2})</div>
            <div class="value">${minutesToTime(stats2.extraMinutes)}</div>
            <div class="diff ${stats2.extraMinutes >= stats1.extraMinutes ? 'positive' : 'negative'}">
                ${stats2.extraMinutes >= stats1.extraMinutes ? '+' : ''}${minutesToTime(stats2.extraMinutes - stats1.extraMinutes)}
            </div>
        </div>
    `;
}

function getMonthStats(monthStr) {
    const monthDays = workDays.filter(day => day.data && day.data.startsWith(monthStr));
    
    let totalMinutes = 0;
    let extraMinutes = 0;
    let negativeMinutes = 0;
    
    monthDays.forEach(day => {
        const hours = calculateDayHours(day);
        totalMinutes += hours.total;
        extraMinutes += hours.extra;
        negativeMinutes += hours.negative;
    });
    
    return {
        totalMinutes: totalMinutes,
        extraMinutes: extraMinutes,
        negativeMinutes: negativeMinutes,
        totalHours: totalMinutes / 60,
        extraHours: extraMinutes / 60,
        negativeHours: negativeMinutes / 60,
        days: monthDays.length
    };
}

// ==================== FUNÇÕES DE EXPORTAÇÃO ====================

function exportReportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text('Relatório de Controle de Horas', 105, 20, { align: 'center' });
    
    // Data do relatório
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 105, 28, { align: 'center' });
    
    // Período filtrado
    if (currentFilter) {
        const [year, month] = currentFilter.split('-');
        const monthNames = {
            '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
            '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
            '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
        };
        const monthName = `${monthNames[month]} de ${year}`;
        doc.text(`Período: ${monthName}`, 105, 36, { align: 'center' });
    }
    
    // Resumo
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text('Resumo', 14, 50);
    
    const daysToExport = currentFilter ? filteredWorkDays : workDays;
    let totalMinutes = 0;
    let totalExtraMinutes = 0;
    let totalNegativeMinutes = 0;
    
    daysToExport.forEach(day => {
        const hours = calculateDayHours(day);
        totalMinutes += hours.total;
        totalExtraMinutes += hours.extra;
        totalNegativeMinutes += hours.negative;
    });
    
    const hourlyRate = userSettings.salaryBase / userSettings.monthlyHours;
    const extraHourRate = hourlyRate * userSettings.extraMultiplier;
    const extraValue = (totalExtraMinutes / 60) * extraHourRate;
    
    doc.setFontSize(10);
    doc.text(`Total de Horas Trabalhadas: ${minutesToTime(totalMinutes)}`, 14, 60);
    doc.text(`Total de Horas Extras: ${minutesToTime(totalExtraMinutes)}`, 14, 68);
    doc.text(`Total de Horas Negativas: ${minutesToTime(totalNegativeMinutes)}`, 14, 76);
    doc.text(`Valor Estimado das Horas Extras: R$ ${extraValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 84);
    
    // Tabela de registros
    const tableData = daysToExport.map(day => {
        const hours = calculateDayHours(day);
        return [
            formatDate(day.data),
            day.entrada || '-',
            day.saidaIntervalo || '-',
            day.retornoIntervalo || '-',
            day.saidaFinal || '-',
            minutesToTime(hours.total),
            hours.extra > 0 ? minutesToTime(hours.extra) : '-',
            hours.negative > 0 ? minutesToTime(hours.negative) : '-',
            day.sabado ? 'Sim' : 'Não'
        ];
    });
    
    doc.autoTable({
        startY: 95,
        head: [['Data', 'Entrada', 'Saída Int.', 'Retorno', 'Saída', 'Total', 'Extras', 'Neg.', 'Sáb.']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 }
    });
    
    // Salva o PDF
    const filterSuffix = currentFilter ? `-${currentFilter}` : '';
    doc.save(`relatorio-horas${filterSuffix}-${new Date().toISOString().split('T')[0]}.pdf`);
    
    showNotification('Relatório PDF exportado com sucesso!', 'success');
}

function exportReportExcel() {
    exportToExcel();
}

function exportReportJSON() {
    const daysToExport = currentFilter ? filteredWorkDays : workDays;
    const reportData = {
        generatedAt: new Date().toISOString(),
        period: currentFilter || 'all',
        summary: {},
        records: daysToExport
    };
    
    let totalMinutes = 0;
    let totalExtraMinutes = 0;
    let totalNegativeMinutes = 0;
    
    daysToExport.forEach(day => {
        const hours = calculateDayHours(day);
        totalMinutes += hours.total;
        totalExtraMinutes += hours.extra;
        totalNegativeMinutes += hours.negative;
    });
    
    reportData.summary = {
        totalHours: minutesToTime(totalMinutes),
        extraHours: minutesToTime(totalExtraMinutes),
        negativeHours: minutesToTime(totalNegativeMinutes),
        totalRecords: daysToExport.length
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const filterSuffix = currentFilter ? `-${currentFilter}` : '';
    a.download = `relatorio-horas${filterSuffix}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Relatório JSON exportado com sucesso!', 'success');
}

function exportAllData() {
    const data = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        settings: userSettings,
        workDays: workDays
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-horas-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Backup completo exportado com sucesso!', 'success');
}

// ==================== FUNÇÕES DE IMPORTAÇÃO ====================

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            let importedData;
            
            if (file.name.endsWith('.json')) {
                importedData = JSON.parse(e.target.result);
                await processImportedData(importedData);
            } else if (file.name.endsWith('.csv')) {
                importedData = parseCSV(e.target.result);
                await processImportedData({ workDays: importedData });
            } else {
                showNotification('Formato de arquivo não suportado. Use JSON ou CSV.', 'error');
                return;
            }
            
            showNotification('Dados importados com sucesso!', 'success');
            await loadData();
            populateMonthFilter();
            renderTable();
            updateSummary();
        } catch (error) {
            console.error('Erro ao importar:', error);
            showNotification('Erro ao importar dados. Verifique o formato do arquivo.', 'error');
        }
        
        // Limpa o input
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

async function processImportedData(data) {
    // Se for um backup completo
    if (data.settings) {
        userSettings = { ...userSettings, ...data.settings };
        await saveSettingsToAPI(userSettings);
    }
    
    // Se tiver registros
    if (data.workDays && Array.isArray(data.workDays)) {
        // Mescla com dados existentes ou substitui
        if (confirm('Deseja mesclar com os dados existentes ou substituir completamente?')) {
            // Mesclar
            const existingIds = new Set(workDays.map(d => d.id));
            data.workDays.forEach(day => {
                if (!existingIds.has(day.id)) {
                    workDays.push(day);
                }
            });
        } else {
            // Substituir
            workDays = data.workDays;
        }
        
        sortWorkDays();
        await saveData();
    }
}

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const records = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= 5) {
            const record = {
                id: Date.now() + i,
                data: findValueByHeader(values, headers, ['data', 'date']),
                entrada: findValueByHeader(values, headers, ['entrada', 'entrada', 'in']),
                saidaIntervalo: findValueByHeader(values, headers, ['saída intervalo', 'saida intervalo', 'interval']),
                retornoIntervalo: findValueByHeader(values, headers, ['retorno intervalo', 'retorno intervalo', 'return']),
                saidaFinal: findValueByHeader(values, headers, ['saída final', 'saida final', 'out']),
                sabado: findValueByHeader(values, headers, ['sábado', 'sabado', 'saturday']).toLowerCase() === 'sim'
            };
            
            if (record.data) {
                records.push(record);
            }
        }
    }
    
    return records;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    
    return values;
}

function findValueByHeader(values, headers, possibleNames) {
    const index = headers.findIndex(h => possibleNames.some(pn => h.includes(pn)));
    return index >= 0 ? values[index] || '' : '';
}

// ==================== FUNÇÕES DE VISUALIZAÇÃO EM CARDS ====================

function renderCardsView() {
    const container = document.getElementById('cardsContainer');
    container.innerHTML = '';
    
    const daysToShow = currentFilter ? filteredWorkDays : workDays;
    
    // Dias da semana em português
    const dayOfWeekNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    
    daysToShow.forEach(day => {
        const hours = calculateDayHours(day);
        const card = document.createElement('div');
        card.className = 'day-card';
        
        // Usar parsing de string para evitar problemas de timezone
        const [year, month, dayNum] = day.data.split('-').map(num => parseInt(num, 10));
        const date = new Date(year, month - 1, dayNum, 12, 0, 0); // Usar meio-dia
        const dayOfWeekIndex = date.getDay();
        const dayOfWeek = dayOfWeekNames[dayOfWeekIndex];
        
        card.innerHTML = `
            <div class="day-card-header">
                <span class="day-card-date">${formatDate(day.data)} - ${dayOfWeek}</span>
                ${day.sabado ? '<span class="day-card-badge saturday">Sábado</span>' : ''}
            </div>
            <div class="day-card-body">
                <div class="time-grid">
                    <div class="time-item">
                        <span class="time-label">Entrada</span>
                        <input type="time" class="time-input" value="${day.entrada}" 
                               onchange="updateField(${day.id}, 'entrada', this.value)">
                    </div>
                    <div class="time-item">
                        <span class="time-label">Saída Intervalo</span>
                        <input type="time" class="time-input" value="${day.saidaIntervalo}" 
                               onchange="updateField(${day.id}, 'saidaIntervalo', this.value)">
                    </div>
                    <div class="time-item">
                        <span class="time-label">Retorno</span>
                        <input type="time" class="time-input" value="${day.retornoIntervalo}" 
                               onchange="updateField(${day.id}, 'retornoIntervalo', this.value)">
                    </div>
                    <div class="time-item">
                        <span class="time-label">Saída Final</span>
                        <input type="time" class="time-input" value="${day.saidaFinal}" 
                               onchange="updateField(${day.id}, 'saidaFinal', this.value)">
                    </div>
                </div>
                <div class="hours-summary">
                    <div class="hours-summary-item">
                        <div class="label">Total</div>
                        <div class="value">${minutesToTime(hours.total)}</div>
                    </div>
                    <div class="hours-summary-item">
                        <div class="label" style="color: var(--success-color)">Extras</div>
                        <div class="value hours-positive">${hours.extra > 0 ? minutesToTime(hours.extra) : '-'}</div>
                    </div>
                    <div class="hours-summary-item">
                        <div class="label" style="color: var(--danger-color)">Negativas</div>
                        <div class="value hours-negative">${hours.negative > 0 ? minutesToTime(hours.negative) : '-'}</div>
                    </div>
                </div>
            </div>
            <div class="day-card-footer">
                <div class="saturday-toggle">
                    <input type="checkbox" ${day.sabado ? 'checked' : ''} 
                           onchange="updateField(${day.id}, 'sabado', this.checked)">
                    <span>É Sábado</span>
                </div>
                <div class="card-actions">
                    <button class="btn btn-danger" onclick="removeDay(${day.id})" title="Remover">
                        🗑️
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function toggleViewMode() {
    const tableView = document.getElementById('hoursTable').closest('.table-container');
    const cardsView = document.getElementById('cardsView');
    
    if (cardsView.style.display === 'none') {
        tableView.style.display = 'none';
        cardsView.classList.add('show');
        renderCardsView();
    } else {
        tableView.style.display = 'block';
        cardsView.classList.remove('show');
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    
    const [year, month, day] = dateStr.split('-');
    
    switch (userSettings.dateFormat) {
        case 'mm/dd/yyyy':
            return `${month}/${day}/${year}`;
        case 'yyyy-mm-dd':
            return `${year}-${month}-${day}`;
        default:
            return `${day}/${month}/${year}`;
    }
}

function updateBalanceIndicator(extraMinutes, negativeMinutes) {
    const indicator = document.getElementById('balanceIndicator');
    const balance = extraMinutes - negativeMinutes;

    indicator.className = 'balance-indicator';

    if (balance > 0) {
        indicator.classList.add('balance-positive');
        indicator.innerHTML = `
            <div>✅ Você tem ${minutesToTime(balance)} de crédito</div>
            <div style="font-size: 12px; margin-top: 5px;">Horas a seu favor</div>
        `;
    } else if (balance < 0) {
        indicator.classList.add('balance-negative');
        indicator.innerHTML = `
            <div>⚠️ Você deve ${minutesToTime(Math.abs(balance))}</div>
            <div style="font-size: 12px; margin-top: 5px;">Horas a compensar</div>
        `;
    } else {
        indicator.classList.add('balance-neutral');
        indicator.innerHTML = `
            <div>⚖️ Saldo zerado</div>
            <div style="font-size: 12px; margin-top: 5px;">Em dia com suas horas</div>
        `;
    }
}

function exportToExcel() {
    const daysToExport = currentFilter ? filteredWorkDays : workDays;
    const data = daysToExport.map(day => {
        const hours = calculateDayHours(day);
        return {
            'Data': day.data,
            'Entrada': day.entrada,
            'Saída Intervalo': day.saidaIntervalo,
            'Retorno Intervalo': day.retornoIntervalo,
            'Saída Final': day.saidaFinal,
            'Total Horas': minutesToTime(hours.total),
            'Horas Extras': hours.extra > 0 ? minutesToTime(hours.extra) : '',
            'Horas Negativas': hours.negative > 0 ? minutesToTime(hours.negative) : '',
            'Sábado': day.sabado ? 'Sim' : 'Não'
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Controle de Horas');

    const filterSuffix = currentFilter ? `-${currentFilter}` : '';
    const filename = `controle-horas${filterSuffix}-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
}
