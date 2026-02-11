import { AuthManager } from './auth.js';

const COLORS = {
    blue: '#1976D2', green: '#388E3C', orange: '#F57C00', red: '#D32F2F',
    purple: '#7B1FA2', teal: '#00796B', grey: '#616161', yellow: '#FBC02D',
    darkBlue: '#303F9F', lightBlue: '#03A9F4'
};
const COLOR_ARRAY = Object.values(COLORS);

let rawData = [];
let filteredData = [];
let chartInstances = {};
let dashboardLayout = [];
let kpiConfig = [];
let fullConfig = {};
let tempColorMap = {};

const DEFAULT_LAYOUT = [
    { id: 'c1', title: 'Status dos Pagamentos (AP)', type: 'doughnut', field: 'status', width: 'col-md-4', filterScope: 'Contas a Pagar', colors: { "Concluído": COLORS.green, "Em Teste": COLORS.yellow, "Cancelado": COLORS.red, "Chamado Aberto": COLORS.orange } },
    { id: 'c2', title: 'Pagamentos por Modalidade', type: 'bar', field: 'modalidade', width: 'col-md-4', filterScope: 'Contas a Pagar', colors: {} },
    { id: 'c3', title: 'Status por Responsável', type: 'pie', field: 'responsavel', width: 'col-md-4', filterScope: '', colors: {} },
    { id: 'c4', title: 'Status dos Recebimentos (AR)', type: 'doughnut', field: 'status', width: 'col-md-6', filterScope: 'Contas a Receber', colors: {} },
    { id: 'c5', title: 'Ocorrências (Recebimento)', type: 'horizontalBar', field: 'ocorrencia', width: 'col-md-6', filterScope: 'Contas a Receber', colors: {} }
];

const DEFAULT_KPIS = [
    { title: 'Testes de Pagamento', color: '#283593', icon: 'bi-credit-card', rule: { field: 'tipo_fluxo', value: 'Contas a Pagar' } },
    { title: 'Testes de Recebimento', color: '#1565C0', icon: 'bi-cash-coin', rule: { field: 'tipo_fluxo', value: 'Contas a Receber' } },
    { title: 'Processados Sucesso', color: '#2E7D32', icon: 'bi-check-circle', rule: { field: 'status', value: 'Concluído' } },
    { title: 'Erros / Rejeições', color: '#C62828', icon: 'bi-exclamation-triangle', rule: { field: 'status', value: 'Cancelado' } }
];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const cachedTheme = localStorage.getItem('cnab_theme') || 'excel';
        document.body.setAttribute('data-theme', cachedTheme);
        applyThemeColors(cachedTheme);

        const isLogged = await AuthManager.checkSession();
        if (!isLogged) return;
        
        if (!AuthManager.can('dash_view')) { alert("Acesso negado."); window.location.href='index.html'; return; }
        document.body.style.visibility = 'visible';
        
        if (!AuthManager.can('dash_edit')) {
            const btnAdd = document.getElementById('btnAddChart');
            if(btnAdd) btnAdd.style.display = 'none';
            const style = document.createElement('style');
            style.innerHTML = '.chart-actions, .kpi-edit-btn, .chart-header { display: none !important; cursor: default !important; }';
            document.head.appendChild(style);
        }

        await initDashboard();
    } catch(e) { console.error("Erro init:", e); document.body.style.visibility = 'visible'; }
});

async function initDashboard() {
    try {
        const response = await fetch('api.php?action=load_all');
        const json = await response.json();

        if (json.status === 'success') {
            const db = json.db || [];
            rawData = [];
            // Flatten inteligente: Marca quem é Pai e quem é Filho
            db.forEach(pai => {
                // Marca PAI
                const enrichedParent = { ...pai, _isParent: true };
                rawData.push(enrichedParent);
                
                if (pai.children && pai.children.length > 0) {
                    pai.children.forEach(child => {
                        const enrichedChild = { ...child, _isParent: false }; // Marca FILHO
                        // Herança de dados para filtro
                        if(!enrichedChild.empresa) enrichedChild.empresa = pai.empresa;
                        if(!enrichedChild.banco) enrichedChild.banco = pai.banco;
                        if(!enrichedChild.tipo_fluxo) enrichedChild.tipo_fluxo = pai.tipo_fluxo;
                        if(!enrichedChild.responsavel) enrichedChild.responsavel = pai.responsavel;
                        rawData.push(enrichedChild);
                    });
                }
            });

            fullConfig = json.configs || {};
            dashboardLayout = fullConfig['dashboard_layout'] || DEFAULT_LAYOUT;
            kpiConfig = fullConfig['dashboard_kpis'] || DEFAULT_KPIS;
            
            const dbTheme = fullConfig['cnab_theme'];
            if(dbTheme) { document.body.setAttribute('data-theme', dbTheme); applyThemeColors(dbTheme); }

            if (AuthManager.can('dash_edit')) { initSortable(); initKPIReorder(); }
            
            populateFilters();
            applyFilters();
            
            const timeEl = document.getElementById('lastUpdate');
            if(timeEl) timeEl.innerText = 'Atualizado: ' + new Date().toLocaleTimeString();
        }
    } catch (e) { console.error('Erro init:', e); }
}

function populateFilters() {
    const filters = { tipo_arq: new Set(), banco: new Set(), empresa: new Set(), responsavel: new Set() };
    rawData.forEach(item => {
        if(item.tipo_arq) filters.tipo_arq.add(item.tipo_arq);
        if(item.banco) filters.banco.add(item.banco);
        if(item.empresa) filters.empresa.add(item.empresa);
        if(item.responsavel) filters.responsavel.add(item.responsavel);
    });
    fillSelect('filterTipoArq', filters.tipo_arq); fillSelect('filterBanco', filters.banco); fillSelect('filterEmpresa', filters.empresa); fillSelect('filterResponsavel', filters.responsavel);
}
function fillSelect(id, set) {
    const el = document.getElementById(id); if(!el) return;
    const sorted = Array.from(set).sort();
    el.innerHTML = '<option value="">Todos</option>' + sorted.map(v => `<option value="${v}">${v}</option>`).join('');
}

function applyFilters() {
    const fScope = document.getElementById('filterScope').value; // Novo Filtro
    const fTipo = document.getElementById('filterTipoArq')?.value;
    const fBanco = document.getElementById('filterBanco')?.value;
    const fEmp = document.getElementById('filterEmpresa')?.value;
    const fResp = document.getElementById('filterResponsavel')?.value;

    filteredData = rawData.filter(item => {
        // Filtro de Nível
        if (fScope === 'parents' && !item._isParent) return false;
        if (fScope === 'children' && item._isParent) return false;

        // Filtros de Dados
        if(fTipo && item.tipo_arq !== fTipo) return false;
        if(fBanco && item.banco !== fBanco) return false;
        if(fEmp && item.empresa !== fEmp) return false;
        if(fResp && item.responsavel !== fResp) return false;
        return true;
    });

    updateKPIs();
    renderDynamicCharts();
}

function updateKPIs() {
    const container = document.getElementById('kpiArea'); if(!container) return; container.innerHTML = '';
    kpiConfig.forEach((kpi, index) => {
        let count = 0;
        if (kpi.rule.field === 'all') { count = filteredData.length; } 
        else { count = filteredData.filter(d => d[kpi.rule.field] && d[kpi.rule.field].includes(kpi.rule.value)).length; }
        const div = document.createElement('div');
        div.className = 'kpi-card'; div.style.backgroundColor = kpi.color; div.setAttribute('data-id', index);
        div.innerHTML = `<button class="kpi-edit-btn" onclick="window.dashboard.editKPI(${index}, event)" title="Editar"><i class="bi bi-pencil-fill" style="font-size: 0.7rem;"></i></button><div class="kpi-title">${kpi.title}</div><div class="kpi-value">${count}</div><i class="bi ${kpi.icon} kpi-icon"></i>`;
        container.appendChild(div);
    });
}

function renderDynamicCharts() {
    const container = document.getElementById('dynamicChartsArea'); if (!container) return;
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    container.innerHTML = '';
    dashboardLayout.forEach(config => {
        let chartData = filteredData;
        if (config.filterScope) { chartData = chartData.filter(d => d.tipo_fluxo === config.filterScope); }
        const wrapper = document.createElement('div'); wrapper.className = `chart-wrapper ${config.width}`; wrapper.setAttribute('data-id', config.id);
        const isMin = config.minimized ? 'minimized' : ''; const iconMin = config.minimized ? 'bi-plus-lg' : 'bi-dash-lg';
        wrapper.innerHTML = `<div class="chart-card h-100 ${isMin}" id="card_${config.id}"><div class="chart-header"><span class="chart-title"><i class="bi bi-bar-chart-fill text-muted me-2"></i>${config.title}</span><div class="chart-actions"><button class="btn" onclick="window.dashboard.toggleMin('${config.id}')"><i class="bi ${iconMin}"></i></button><button class="btn" onclick="window.dashboard.editChart('${config.id}')"><i class="bi bi-pencil-fill"></i></button><button class="btn text-danger" onclick="window.dashboard.deleteChart('${config.id}')"><i class="bi bi-x-lg"></i></button></div></div><div class="chart-body" style="height: 300px; position: relative;"><canvas id="canvas_${config.id}"></canvas></div></div>`;
        container.appendChild(wrapper);
        if (!config.minimized) drawChart(config, chartData);
    });
}

function drawChart(config, data) {
    const ctx = document.getElementById(`canvas_${config.id}`); if (!ctx) return;
    const counts = {}; data.forEach(d => { let val = d[config.field]; if (!val || val === '') val = '(Vazio)'; counts[val] = (counts[val] || 0) + 1; });
    let labels = Object.keys(counts); let values = Object.values(counts);
    if (labels.length > 15 || config.type === 'horizontalBar') { const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15); labels = sorted.map(k => k[0]); values = sorted.map(k => k[1]); }
    const customColors = config.colors || {}; const backgroundColors = labels.map((label, index) => customColors[label] || COLOR_ARRAY[index % COLOR_ARRAY.length]);
    let chartType = config.type === 'horizontalBar' ? 'bar' : config.type; let indexAxis = config.type === 'horizontalBar' ? 'y' : 'x';
    try { chartInstances[config.id] = new Chart(ctx, { type: chartType, data: { labels: labels, datasets: [{ label: 'Qtd', data: values, backgroundColor: backgroundColors, borderColor: backgroundColors, borderWidth: 1, borderRadius: 4 }] }, options: { indexAxis: indexAxis, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: (config.type === 'pie' || config.type === 'doughnut'), position: 'right' } }, scales: { x: { display: (config.type !== 'pie' && config.type !== 'doughnut') }, y: { display: (config.type !== 'pie' && config.type !== 'doughnut'), beginAtZero: true } } } }); } catch(err) { console.error("Err Chart", err); }
}

function initKPIReorder() {
    const el = document.getElementById('kpiArea'); if (!el || typeof Sortable === 'undefined') return;
    Sortable.create(el, { animation: 150, ghostClass: 'opacity-50', onEnd: function () { const newConfig = []; document.querySelectorAll('.kpi-card').forEach(card => { const oldIndex = parseInt(card.getAttribute('data-id')); if (kpiConfig[oldIndex]) newConfig.push(kpiConfig[oldIndex]); }); kpiConfig = newConfig; saveKPIs(); updateKPIs(); } });
}
function initSortable() {
    const el = document.getElementById('dynamicChartsArea'); if (!el || typeof Sortable === 'undefined') return;
    Sortable.create(el, { animation: 150, handle: '.chart-header', ghostClass: 'bg-light', onEnd: function () { const newLayout = []; document.querySelectorAll('.chart-wrapper').forEach(card => { const id = card.getAttribute('data-id'); const item = dashboardLayout.find(x => x.id === id); if (item) newLayout.push(item); }); dashboardLayout = newLayout; saveLayout(); } });
}

function applyThemeColors(theme) { if (typeof Chart === 'undefined') return; if (theme === 'dark') { Chart.defaults.color = '#adb5bd'; Chart.defaults.borderColor = '#495057'; } else { Chart.defaults.color = '#666'; Chart.defaults.borderColor = '#e0e0e0'; } }
async function saveLayout() { fullConfig['dashboard_layout'] = dashboardLayout; try { await fetch('api.php?action=save_config', { method: 'POST', body: JSON.stringify({ key: 'dashboard_layout', value: dashboardLayout }) }); } catch (e) {} }
async function saveKPIs() { fullConfig['dashboard_kpis'] = kpiConfig; try { await fetch('api.php?action=save_config', { method: 'POST', body: JSON.stringify({ key: 'dashboard_kpis', value: kpiConfig }) }); } catch (e) {} }
function rgbToHex(rgba) { if(!rgba) return '#cccccc'; if(rgba.startsWith('#')) return rgba; const parts = rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); if(parts && parts.length === 4) { return "#" + ("0" + parseInt(parts[1]).toString(16)).slice(-2) + ("0" + parseInt(parts[2]).toString(16)).slice(-2) + ("0" + parseInt(parts[3]).toString(16)).slice(-2); } return '#cccccc'; }

window.dashboard = {
    applyFilters: applyFilters,
    openNewKPI: () => { document.getElementById('kpiIndex').value = '-1'; document.getElementById('kpiTitle').value = ''; document.getElementById('kpiColor').value = '#283593'; document.getElementById('kpiIcon').value = 'bi-check-circle'; document.getElementById('kpiField').value = 'status'; document.getElementById('kpiValue').value = ''; document.getElementById('modalKPITitle').innerText = 'Novo Totalizador'; document.getElementById('btnDeleteKPI').style.display = 'none'; new bootstrap.Modal(document.getElementById('modalKPIConfig')).show(); },
    editKPI: (index, event) => { if(event) event.stopPropagation(); const kpi = kpiConfig[index]; if(!kpi) return; document.getElementById('kpiIndex').value = index; document.getElementById('kpiTitle').value = kpi.title; document.getElementById('kpiColor').value = kpi.color; document.getElementById('kpiIcon').value = kpi.icon; document.getElementById('kpiField').value = kpi.rule.field; document.getElementById('kpiValue').value = kpi.rule.value || ''; document.getElementById('modalKPITitle').innerText = 'Editar Totalizador'; document.getElementById('btnDeleteKPI').style.display = 'block'; new bootstrap.Modal(document.getElementById('modalKPIConfig')).show(); },
    saveKPIFromModal: () => { const idx = parseInt(document.getElementById('kpiIndex').value); const title = document.getElementById('kpiTitle').value; const color = document.getElementById('kpiColor').value; const icon = document.getElementById('kpiIcon').value; const field = document.getElementById('kpiField').value; const value = document.getElementById('kpiValue').value; if (!title) { alert("Título é obrigatório"); return; } const newItem = { title, color, icon, rule: { field, value } }; if (idx === -1) { kpiConfig.push(newItem); } else { kpiConfig[idx] = newItem; } saveKPIs(); updateKPIs(); bootstrap.Modal.getInstance(document.getElementById('modalKPIConfig')).hide(); },
    deleteCurrentKPI: () => { const idx = parseInt(document.getElementById('kpiIndex').value); if (idx > -1 && confirm('Excluir este Totalizador?')) { kpiConfig.splice(idx, 1); saveKPIs(); updateKPIs(); bootstrap.Modal.getInstance(document.getElementById('modalKPIConfig')).hide(); } },
    openKPIManager: () => { window.dashboard.openNewKPI(); },
    toggleMin: (id) => { const item = dashboardLayout.find(x => x.id === id); if (item) { item.minimized = !item.minimized; saveLayout(); renderDynamicCharts(); } },
    deleteChart: (id) => { if (confirm('Remover gráfico?')) { dashboardLayout = dashboardLayout.filter(x => x.id !== id); saveLayout(); renderDynamicCharts(); } },
    openAddChartModal: () => { document.getElementById('chartId').value = ''; document.getElementById('chartTitleInput').value = ''; document.getElementById('chartTypeInput').value = 'bar'; document.getElementById('chartWidthInput').value = 'col-md-4'; document.getElementById('chartFieldInput').value = 'status'; document.getElementById('chartFilterScope').value = ''; tempColorMap = {}; window.dashboard.generateColorPickers('status'); new bootstrap.Modal(document.getElementById('modalChartConfig')).show(); },
    editChart: (id) => { const item = dashboardLayout.find(x => x.id === id); if (!item) return; document.getElementById('chartId').value = item.id; document.getElementById('chartTitleInput').value = item.title; document.getElementById('chartTypeInput').value = item.type; document.getElementById('chartWidthInput').value = item.width; document.getElementById('chartFieldInput').value = item.field; document.getElementById('chartFilterScope').value = item.filterScope || ''; tempColorMap = item.colors || {}; window.dashboard.generateColorPickers(item.field); new bootstrap.Modal(document.getElementById('modalChartConfig')).show(); },
    generateColorPickers: (field) => { const container = document.getElementById('colorMappingArea'); if(!container) return; container.innerHTML = ''; let allValues = new Set(); rawData.forEach(item => { if(item[field]) allValues.add(item[field]); }); const sortedValues = Array.from(allValues).sort().slice(0, 15); if (sortedValues.length === 0) { container.innerHTML = '<span class="text-muted">Nenhum dado.</span>'; return; } sortedValues.forEach((val, idx) => { let currentColor = tempColorMap[val] || rgbToHex(COLOR_ARRAY[idx % COLOR_ARRAY.length]); const row = document.createElement('div'); row.className = 'd-flex align-items-center mb-2 border-bottom pb-1'; row.innerHTML = `<input type="color" class="form-control form-control-color" value="${currentColor}" onchange="window.dashboard.updateTempColor('${val}', this.value)"><span class="ms-2 small text-truncate">${val}</span>`; container.appendChild(row); }); },
    updateTempColor: (label, color) => { tempColorMap[label] = color; },
    saveChartConfig: () => { const id = document.getElementById('chartId').value; const title = document.getElementById('chartTitleInput').value || 'Gráfico'; const type = document.getElementById('chartTypeInput').value; const width = document.getElementById('chartWidthInput').value; const field = document.getElementById('chartFieldInput').value; const filterScope = document.getElementById('chartFilterScope').value; const newConfig = { title, type, width, field, filterScope, minimized: false, colors: { ...tempColorMap } }; if (id) { const idx = dashboardLayout.findIndex(x => x.id === id); if (idx > -1) { newConfig.id = id; newConfig.minimized = dashboardLayout[idx].minimized; dashboardLayout[idx] = newConfig; } } else { newConfig.id = 'c_' + Date.now(); dashboardLayout.push(newConfig); } saveLayout(); renderDynamicCharts(); bootstrap.Modal.getInstance(document.getElementById('modalChartConfig')).hide(); }
};