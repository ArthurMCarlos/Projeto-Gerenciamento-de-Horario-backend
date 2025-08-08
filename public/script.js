const SALARY = 1625.75;
        const STANDARD_HOURS = 8 * 60 + 48; 
        const SATURDAY_WEEK_HOURS = 8 * 60; 
        
        let workDays = [];
        let filteredWorkDays = [];
        let currentFilter = '';

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            workDays = await getSavedData();
            populateMonthFilter();
            renderTable();
            updateSummary();
        });

        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            saveData();
        }

        function loadTheme() {
            const savedData = getSavedData();
            if (savedData && savedData.theme) {
                document.documentElement.setAttribute('data-theme', savedData.theme);
            }
        }

        function getSavedData() {
            return fetch("/get_days")
             .then(res => res.json())
             .catch(() => []);
        }

        function saveData() {
            fetch("/save_days", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(workDays)
            }).catch(err => console.error("Erro ao salvar:", err));
        }

        function loadData() {
            const savedData = getSavedData();
            if (savedData.workDays) {
                workDays = savedData.workDays;
            }
        }

        function clearAllData() {
            if (confirm('Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.')) {
                workDays = [];
                filteredWorkDays = [];
                currentFilter = '';
                document.getElementById('monthFilter').value = '';
                localStorage.removeItem('workHoursData');
                populateMonthFilter();
                renderTable();
                updateSummary();
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

        // Exemplo: buscar dados
async function buscarDados() {
  try {
    const response = await fetch('/api/dados');
    const dados = await response.json();
    console.log(dados);
    // Processar dados na interface
  } catch (error) {
    console.error('Erro:', error);
  }
}

// Exemplo: salvar dados
async function salvarDados(dados) {
  try {
    const response = await fetch('/api/dados', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dados)
    });
    const resultado = await response.json();
    console.log(resultado);
  } catch (error) {
    console.error('Erro:', error);
  }
}
