const SALARY = 1625.75;
const STANDARD_HOURS = 8 * 60 + 48; 
const SATURDAY_WEEK_HOURS = 8 * 60; 

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
        // Salva localmente como backup
        localStorage.setItem('settingsBackup', JSON.stringify(settings));
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
    
    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        const date = new Date(month + '-01');
        option.textContent = date.toLocaleDateString('pt-BR', { 
            month: 'long', 
            year: 'numeric' 
        });
        option.textContent = option.textContent.charAt(0).toUpperCase() + option.textContent.slice(1);
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

    daysToCalculate.forEach(day => {
        const hours = calculateDayHours(day);
        totalMinutes += hours.total;
        totalExtraMinutes += hours.extra;
        totalNegativeMinutes += hours.negative;
    });

    document.getElementById('totalHours').textContent = minutesToTime(totalMinutes);
    document.getElementById('totalExtraHours').textContent = minutesToTime(totalExtraMinutes);
    document.getElementById('totalNegativeHours').textContent = minutesToTime(totalNegativeMinutes);

    const monthlyHours = 220; 
    const hourlyRate = SALARY / monthlyHours;
    const extraHourRate = hourlyRate * 1.5; 
    const extraHoursValue = (totalExtraMinutes / 60) * extraHourRate;

    document.getElementById('extraHoursValue').textContent = 
        `R$ ${extraHoursValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    updateBalanceIndicator(totalExtraMinutes, totalNegativeMinutes);
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
