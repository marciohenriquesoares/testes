import { DataManager } from './data.js';
import { UIManager } from './ui.js';
import { KanbanManager } from './kanban.js';
import { GanttManager } from './gantt.js';
import { AccountsManager } from './accounts.js';
import { Utils } from './utils.js';
import { AuthManager } from './auth.js';

// --- VARIÁVEIS GLOBAIS DE ESTADO ---
let modalTempTags = [];
let modalCurrentColor = '#ffc107';
let tempTags = [];
let currentTagColor = '#ffc107';
let currentGanttTask = null; 
let currentEditing = { p: -1, c: -1, field: null, originalValue: null }; 
let currentStyling = { type: null, p: -1, c: -1, field: null };
let modalOriginals = { empresa: '', banco: '', num_banco: '', agencia: '', conta: '' };
let validOptions = { empresa: [], banco: [], num_banco: [], agencia: [], conta: [] };
const ALL_FIELDS = ['id','empresa','banco','num_banco','agencia','conta','modalidade','cod','tipo_arq','metodo','topico','prioridade','percentual','anotacoes','obs','responsavel'];

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Configurar Tema
    const cachedTheme = localStorage.getItem('cnab_theme') || 'excel';
    document.body.setAttribute('data-theme', cachedTheme);
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) themeSelector.value = cachedTheme;

    // 2. Verificar Login
    const isLogged = await AuthManager.checkSession();
    if (!isLogged) return;
    document.body.style.visibility = 'visible';
    AuthManager.applyUIProtection();

    const loadingOverlay = document.getElementById('loadingOverlay');
    
    try {
        // 3. Carregar Dados Iniciais
        await DataManager.load();

        const isGrid = !!document.getElementById('tabela-corpo');
        const isKanban = !!document.getElementById('kanban-container');
        const isGantt = !!document.getElementById('gantt');

        if (isGrid || document.getElementById('modalReg')) {
            if (window.actions && window.actions.recalcAllParents) window.actions.recalcAllParents();
            await AccountsManager.load();
        }

        // 4. Configurar UI
        updateStatusDropdowns();
        setupCascadingDropdownsModal();
        setupGridEditorEvents();

        // 5. Roteamento
        if (isGrid) {
            UIManager.render();
            // Inits Modais
            const csEl = document.getElementById('modalConfigStatus');
            const regEl = document.getElementById('modalReg');
            const impEl = document.getElementById('modalImportConfirm');
            if(regEl) new bootstrap.Modal(regEl);
            if(impEl) new bootstrap.Modal(impEl);
            if(document.getElementById('modalAccountImportOptions')) new bootstrap.Modal(document.getElementById('modalAccountImportOptions'));

            if(csEl) {
                new bootstrap.Modal(csEl);
                csEl.addEventListener('shown.bs.modal', () => {
                    if(AuthManager.can('admin')) window.actions.loadUsersList();
                    renderKanbanCardConfig(); 
                    renderColumnConfig();
                    renderConfigList('listPaymentModes', DataManager.paymentModes, 'paymentModes');
                    renderConfigList('listOccurrences', DataManager.receivableOccurrences, 'receivableOccurrences');
                    renderConfigList('listFileTypes', DataManager.fileTypes, 'fileTypes');
                    renderConfigList('listPaymentMethods', DataManager.paymentMethods, 'paymentMethods');
                    renderSLAList();
                    applyTabOrder();
                    const ganttInput = document.getElementById('ganttAutoDaysInput');
                    if (ganttInput) ganttInput.value = DataManager.ganttAutoDays || 5;
                    // Sortable
                    const tabList = document.getElementById('configTabsSortable');
                    if(tabList && typeof Sortable !== 'undefined') {
                        Sortable.create(tabList, { animation: 150, ghostClass: 'bg-light', onEnd: (evt) => {
                            const order = Array.from(evt.to.children).map(li => { const link = li.querySelector('a.nav-link'); return link ? link.getAttribute('href') : null; }).filter(id => id);
                            DataManager.saveConfig('config_tab_order', order);
                        }});
                    }
                    if(typeof AccountsManager.renderAccountsList === 'function') AccountsManager.renderAccountsList();
                });
            }
        } else if (isKanban) {
            KanbanManager.populateParentFilter();
            KanbanManager.render();
        } else if (isGantt) {
            GanttManager.render();
        }

        document.querySelectorAll('.date-mask').forEach(input => { 
            input.addEventListener('input', (e) => { 
                let v = e.target.value.replace(/\D/g, ''); 
                if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); 
                if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9); 
                e.target.value = v; 
            }); 
        });

        // =========================================================
        // NOVO: ATUALIZAÇÃO AUTOMÁTICA AO VOLTAR PARA A ABA/JANELA
        // =========================================================
        window.addEventListener('focus', async () => {
            // Evita recarregar se houver um modal aberto (para não perder edição)
            const openModal = document.querySelector('.modal.show');
            if (openModal) return;

            //console.log("Janela focada. Atualizando dados...");
            await DataManager.load();
            
            // Se estiver no Grid, recarrega contas também
            if (isGrid) {
                await AccountsManager.load();
            }
            
            // Re-renderiza a tela atual com os novos dados do banco
            renderActiveView();
        });

    } catch (error) { console.error("Erro Fatal no Init:", error); } 
    finally { if(loadingOverlay) { loadingOverlay.style.opacity = '0'; setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500); } }
});

// --- HELPER FUNCTIONS ---
function renderActiveView() {
    if (document.getElementById('tabela-corpo')) UIManager.render();
    else if (document.getElementById('kanban-container')) KanbanManager.render();
    else if (document.getElementById('gantt')) GanttManager.render();
}
function updateStatusDropdowns() {
    const opts = DataManager.statusConfig.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    const elFloat = document.getElementById('floatStatusInput'); if (elFloat) elFloat.innerHTML = opts;
    const elModal = document.getElementById('inp_status'); if (elModal) elModal.innerHTML = opts;
}
function setupGridEditorEvents() { const input = document.getElementById('bankGridInput'); if(input) { input.addEventListener('change', () => { const val = input.value.trim(); if (DataManager.strictBankValidation && currentEditing.field && currentEditing.field !== 'conta' && val !== currentEditing.originalValue && val !== '') { if (!validOptions[currentEditing.field] || !validOptions[currentEditing.field].includes(val)) { alert(`Valor não cadastrado!`); input.value = currentEditing.originalValue; input.focus(); } } }); } }
function setupCascadingDropdownsModal() { 
    const elEmpresa = document.getElementById('inp_empresa'); if(!elEmpresa) return;
    const updateAll = () => updateListsModal(); 
    elEmpresa.addEventListener('input', updateAll); document.getElementById('inp_banco').addEventListener('input', updateAll); document.getElementById('inp_num_banco').addEventListener('input', updateAll); document.getElementById('inp_agencia').addEventListener('input', updateAll); 
    elEmpresa.addEventListener('change', () => validateModalField(elEmpresa, 'empresa', 'Empresa não cadastrada!')); 
    document.getElementById('inp_conta').addEventListener('input', (e) => { const val = e.target.value.trim(); if(!val) return; const match = AccountsManager.accounts.find(acc => acc.account_number.trim() === val); if (match) { document.getElementById('inp_empresa').value = match.company_name; document.getElementById('inp_banco').value = match.bank_name; document.getElementById('inp_num_banco').value = match.bank_number; document.getElementById('inp_agencia').value = match.agency; updateListsModal(); } }); 
}
function updateListsModal() { 
    const elEmpresa = document.getElementById('inp_empresa'); if (!elEmpresa) return;
    const vEmpresa = elEmpresa.value; const vBanco = document.getElementById('inp_banco').value; const vNumBanco = document.getElementById('inp_num_banco').value; const vAgencia = document.getElementById('inp_agencia').value; 
    updateListsForContext({ empresa: vEmpresa, banco: vBanco, num_banco: vNumBanco, agencia: vAgencia }); 
    fillDatalist('list_empresa', validOptions.empresa); fillDatalist('list_banco', validOptions.banco); fillDatalist('list_num_banco', validOptions.num_banco); fillDatalist('list_agencia', validOptions.agencia); fillDatalist('list_conta', validOptions.conta); 
}
function updateListsForContext(dataObj) { const getUnique = (list, field) => [...new Set(list.map(i => i[field]?i[field].trim():''))].filter(v=>v).sort(); validOptions.empresa = getUnique(AccountsManager.accounts, 'company_name'); let filtered = AccountsManager.accounts; if (dataObj.empresa) filtered = filtered.filter(a => a.company_name === dataObj.empresa); if (dataObj.banco) filtered = filtered.filter(a => a.bank_name === dataObj.banco); validOptions.banco = getUnique(filtered, 'bank_name'); validOptions.num_banco = getUnique(filtered, 'bank_number'); validOptions.agencia = getUnique(filtered, 'agency'); validOptions.conta = getUnique(filtered, 'account_number'); }
function validateModalField(input, type, msg) { if (!DataManager.strictBankValidation) return; const val = input.value.trim(); if (!val || val === modalOriginals[type]) return; if (!validOptions[type].includes(val)) { alert(msg); input.value = ''; } else updateListsModal(); }
function fillDatalist(id, values) { const dl = document.getElementById(id); if(dl) { dl.innerHTML = ''; values.forEach(v => { const opt = document.createElement('option'); opt.value = v; dl.appendChild(opt); }); } }
function applyTabOrder() { const order = DataManager.configTabOrder; if (!order) return; const ul = document.getElementById('configTabsSortable'); if (!ul) return; const tabMap = {}; Array.from(ul.children).forEach(li => { const link = li.querySelector('a.nav-link'); if (link) tabMap[link.getAttribute('href')] = li; }); order.forEach(href => { if (tabMap[href]) { ul.appendChild(tabMap[href]); delete tabMap[href]; } }); Object.values(tabMap).forEach(li => ul.appendChild(li)); const firstTab = ul.querySelector('a.nav-link.active'); if(!firstTab) { const first = ul.querySelector('a.nav-link'); if(first) new bootstrap.Tab(first).show(); } }
function renderConfigList(elementId, dataArray, configKey) { const list = document.getElementById(elementId); if(!list) return; list.innerHTML = dataArray.map((item, index) => `<li class="list-group-item d-flex justify-content-between align-items-center py-1"><span>${item}</span><button class="btn btn-sm btn-link text-danger" onclick="window.actions.removeConfigItem('${configKey}', ${index})">x</button></li>`).join(''); }
function renderKanbanCardConfig() { const container = document.getElementById('kanbanCardConfigList'); if (!container) return; container.innerHTML = ''; Object.keys(DataManager.colLabels).forEach(key => { if (['id', 'actions', 'children', 'expanded'].includes(key)) return; const isChecked = DataManager.kanbanCardFields[key] ? 'checked' : ''; container.innerHTML += `<div class="form-check form-switch"><input class="form-check-input card-field-check" type="checkbox" value="${key}" id="chk_kbn_${key}" ${isChecked}><label class="form-check-label">${DataManager.colLabels[key]}</label></div>`; }); }
function renderColumnConfig() { const list = document.getElementById('colConfigList'); if (!list) return; const itemsHTML = DataManager.columnOrder.map((col, index) => `<li class="list-group-item d-flex justify-content-between p-2"><span>${DataManager.colLabels[col]||col}</span><div><button class="btn btn-sm btn-secondary py-0" onclick="window.actions.moveColumn(${index}, -1)">^</button><button class="btn btn-sm btn-secondary py-0" onclick="window.actions.moveColumn(${index}, 1)">v</button></div></li>`).join(''); list.innerHTML = itemsHTML; }
function renderSLAList() { const el = document.getElementById('slaList'); if(el) el.innerHTML = Object.entries(DataManager.slaConfig).map(([r, d]) => `<li class="list-group-item d-flex justify-content-between py-1"><span>${r}: ${d}d</span><button class="btn btn-sm btn-danger" onclick="window.actions.removeSla('${r}')">x</button></li>`).join(''); }
function renderModalTags() { const el = document.getElementById('modalTagList'); if(el) el.innerHTML = modalTempTags.map((t,i) => `<span class="tag-pill" style="background:${t.split('|')[1]}">${t.split('|')[0]} <span onclick="window.actions.modalRemoveTag(${i})">&times;</span></span>`).join(''); }
function smartPosition(editorId, targetElement) { const editor = document.getElementById(editorId); if (!editor || !targetElement) return; editor.style.display = 'block'; const rect = targetElement.getBoundingClientRect(); editor.style.top = `${rect.bottom}px`; editor.style.left = `${rect.left}px`; const firstInput = editor.querySelector('input, select'); if(firstInput) firstInput.focus(); }

// --- ACTIONS ---
const openBankGridEditor = (p, c, field, e) => { e.stopPropagation(); const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; const valAtual = item[field] || ''; currentEditing = { p, c, field, originalValue: valAtual }; updateListsForContext({ empresa: item.empresa, banco: item.banco }); const input = document.getElementById('bankGridInput'); document.getElementById('bankGridLabel').innerText = (DataManager.colLabels[field] || field).toUpperCase(); input.value = valAtual; fillDatalist('bankGridList', validOptions[field]); smartPosition('bankGridEditor', e.target.closest('td')); input.select(); };
const saveBankGridEditor = () => { const input = document.getElementById('bankGridInput'); const val = input.value.trim(); const { p, c, field } = currentEditing; const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; item[field] = val; document.getElementById('bankGridEditor').style.display = 'none'; DataManager.save(); renderActiveView(); };
const openDateEditor = (p, c, f, e) => { currentEditing={p,c,field:f}; document.getElementById('floatDateInput').value = Utils.formatDate((c===-1?DataManager.db[p]:DataManager.db[p].children[c])[f]); smartPosition('dateEditor', e.target.closest('td')); };
const saveDateEditor = () => { const v=document.getElementById('floatDateInput').value; const iso=Utils.parseDateBR(v); (currentEditing.c===-1?DataManager.db[currentEditing.p]:DataManager.db[currentEditing.p].children[currentEditing.c])[currentEditing.field] = iso; document.getElementById('dateEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openStatusEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; document.getElementById('floatStatusInput').value = (c===-1?DataManager.db[p]:DataManager.db[p].children[c]).status || 'Previsto'; smartPosition('statusEditor', e.target.closest('td')); };
const saveStatusEditor = () => { const val = document.getElementById('floatStatusInput').value; const {p,c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; item.status = val; if (val === 'Concluído') item.percentual = 100; if (c !== -1) window.actions.recalcParent(p); document.getElementById('statusEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openTagEditor = (p,c,e) => { e.stopPropagation(); currentEditing = {p,c}; const item = c===-1?DataManager.db[p]:DataManager.db[p].children[c]; tempTags = item.tags ? item.tags.split(',').filter(x=>x) : []; document.getElementById('editorTagList').innerHTML = tempTags.map((t,i) => `<span class="tag-pill" style="background:${t.split('|')[1]}">${t.split('|')[0]} <span onclick="window.actions.removeTag(${i})">x</span></span>`).join(''); smartPosition('tagEditor', e.target.closest('td')); };
const addTagFromEditor = () => { const i = document.getElementById('newTagInput'); if(i.value) { tempTags.push(i.value.toUpperCase()+'|'+currentTagColor); i.value=''; window.actions.saveTagEditor(); } };
const saveTagEditor = () => { const item = currentEditing.c===-1?DataManager.db[currentEditing.p]:DataManager.db[currentEditing.p].children[currentEditing.c]; item.tags = tempTags.join(','); document.getElementById('tagEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const selectColor = (c, e) => { currentTagColor = c; const m = document.getElementById('tagEditor'); if (m) m.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected')); if (e && e.target) e.target.classList.add('selected'); };
const openPriorityEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; document.getElementById('floatPriorityInput').value = item.prioridade || 'Média'; smartPosition('priorityEditor', e.target.closest('td')); };
const savePriorityEditor = () => { const val = document.getElementById('floatPriorityInput').value; const {p,c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; item.prioridade = val; document.getElementById('priorityEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openPercentEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; document.getElementById('floatPercentInput').value = item.percentual || 0; smartPosition('percentEditor', e.target.closest('td')); document.getElementById('floatPercentInput').focus(); };
const savePercentEditor = () => { const val = parseInt(document.getElementById('floatPercentInput').value) || 0; const {p,c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; item.percentual = Math.min(100, Math.max(0, val)); if (item.percentual === 100) item.status = 'Concluído'; else if (item.status === 'Concluído' && item.percentual < 100) item.status = 'Em Andamento'; if (c !== -1) window.actions.recalcParent(p); document.getElementById('percentEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openStyleEditor = (ev, p, c, field) => { ev.preventDefault(); currentStyling = { p, c, field }; const styles = (c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]).styles || {}; const st = styles[field] || {}; document.getElementById('styleBgPicker').value = st.bg || '#ffffff'; document.getElementById('styleTextPicker').value = st.text || '#000000'; smartPosition('styleEditor', (ev.target.closest('td') || {getBoundingClientRect:()=>({top:ev.clientY,left:ev.clientX,bottom:ev.clientY,right:ev.clientX})})); };
const saveStyle = () => { const bg = document.getElementById('styleBgPicker').value; const text = document.getElementById('styleTextPicker').value; const { p, c, field } = currentStyling; const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (!item.styles) item.styles = {}; item.styles[field] = { bg, text }; DataManager.save(); document.getElementById('styleEditor').style.display = 'none'; renderActiveView(); };
const resetStyle = () => { const { p, c, field } = currentStyling; const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (item.styles && item.styles[field]) delete item.styles[field]; DataManager.save(); document.getElementById('styleEditor').style.display = 'none'; renderActiveView(); };
const openRowColorEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; const rowColor = (item.styles && item.styles.row) ? item.styles.row : '#ffffff'; document.getElementById('rowColorPicker').value = rowColor; smartPosition('rowColorEditor', e.target.closest('td')); };
const saveRowColor = () => { const color = document.getElementById('rowColorPicker').value; const {p, c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (!item.styles) item.styles = {}; item.styles.row = color; document.getElementById('rowColorEditor').style.display = 'none'; DataManager.save(); renderActiveView(); };
const resetRowColor = () => { const {p, c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (item.styles && item.styles.row) delete item.styles.row; document.getElementById('rowColorEditor').style.display = 'none'; DataManager.save(); renderActiveView(); };

window.actions = {
    logout: () => AuthManager.logout(),
    mudarTema: (t) => { document.body.setAttribute('data-theme', t); localStorage.setItem('cnab_theme', t); DataManager.saveConfig('cnab_theme', t); },
    updateVisibleCards: (colIndex, val) => { DataManager.statusConfig[colIndex].visibleCards = parseInt(val); DataManager.saveConfig('status_config', DataManager.statusConfig); if(document.getElementById('kanban-container')) KanbanManager.render(); },
    changeGanttView: (mode) => GanttManager.changeView(mode),
    saveGanttConfig: () => { const days = parseInt(document.getElementById('ganttAutoDaysInput').value) || 5; DataManager.ganttAutoDays = days; DataManager.saveConfig('gantt_auto_days', days); alert('Salvo!'); if(document.getElementById('gantt')) GanttManager.render(); },
    
    // GANTT EDIT
    openGanttEditor: (task) => {
        currentGanttTask = task._data;
        const editor = document.getElementById('ganttBarEditor');
        const defaultColor = task._data.id.toString().includes('.') ? '#0d6efd' : '#6c757d';
        const currentColor = (currentGanttTask.styles && currentGanttTask.styles.gantt_color) ? currentGanttTask.styles.gantt_color : defaultColor;
        document.getElementById('ganttBarColor').value = currentColor;
        document.getElementById('ganttBarProgress').value = currentGanttTask.percentual || 0;
        editor.style.display = 'block'; editor.style.top = '100px'; editor.style.left = '50%'; editor.style.transform = 'translateX(-50%)';
    },
    saveGanttStyle: () => {
        if (!currentGanttTask) return;
        if (!currentGanttTask.styles) currentGanttTask.styles = {};
        currentGanttTask.styles.gantt_color = document.getElementById('ganttBarColor').value;
        currentGanttTask.percentual = parseInt(document.getElementById('ganttBarProgress').value) || 0;
        if (currentGanttTask.percentual === 100) currentGanttTask.status = 'Concluído';
        else if (currentGanttTask.status === 'Concluído' && currentGanttTask.percentual < 100) currentGanttTask.status = 'Em Andamento';
        document.getElementById('ganttBarEditor').style.display = 'none';
        DataManager.save(); GanttManager.render();
    },
    resetGanttColor: () => { if (currentGanttTask && currentGanttTask.styles) delete currentGanttTask.styles.gantt_color; document.getElementById('ganttBarEditor').style.display = 'none'; DataManager.save(); GanttManager.render(); },

    syncDate: (targetId, val) => { if(!val) return; const [y, m, d] = val.split('-'); const el = document.getElementById(targetId); if(el) el.value = `${d}/${m}/${y}`; },
    modalAddTag: () => { const inp = document.getElementById('modalNewTagInput'); if (inp.value) { modalTempTags.push(inp.value.toUpperCase() + '|' + modalCurrentColor); inp.value = ''; renderModalTags(); } },
    modalRemoveTag: (i) => { modalTempTags.splice(i, 1); renderModalTags(); },
    modalSelectColor: (c, el) => { modalCurrentColor = c; const m = document.getElementById('modalReg'); if(m) m.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected')); if(el) el.classList.add('selected'); },
    addConfigItem: (key, id) => { const v=document.getElementById(id).value; if(v){ DataManager[key].push(v.toUpperCase()); DataManager.saveConfig(key==='paymentModes'?'payment_modes':key, DataManager[key]); renderConfigList('list'+key, DataManager[key], key); document.getElementById(id).value=''; } },
    removeConfigItem: (key, i) => { if(confirm('Del?')){ DataManager[key].splice(i,1); DataManager.saveConfig(key==='paymentModes'?'payment_modes':key, DataManager[key]); renderConfigList('list'+key, DataManager[key], key); } },
    loadUsersList: async () => { const res = await fetch('api.php?action=list_users'); const json = await res.json(); document.getElementById('usersList').innerHTML = json.data.map(u => `<li class="list-group-item d-flex justify-content-between"><span>${u.username}</span><button class="btn btn-sm btn-link text-danger" onclick="window.actions.delUser(${u.id})">x</button></li>`).join(''); },
    saveUser: async () => { /* ... */ window.actions.loadUsersList(); },
    delUser: async (id) => { if(confirm('Del?')) await fetch('api.php?action=delete_user', { method:'POST', body:JSON.stringify({id}) }); window.actions.loadUsersList(); },
    abrirModalContas: () => { window.actions.abrirConfigStatus(); const t = document.querySelector('a[href="#conf-accounts"]'); if(t) new bootstrap.Tab(t).show(); },
    saveAccount: async () => { const acc = { id: document.getElementById('accId').value, oracle_name: document.getElementById('accOracle').value, bank_name: document.getElementById('accBank').value, bank_number: document.getElementById('accBankNum').value, agency: document.getElementById('accAgency').value, account_number: document.getElementById('accNum').value, company_name: document.getElementById('accCompany').value }; await AccountsManager.save(acc); updateListsModal(); },
    editAccount: (id) => AccountsManager.openModal(id), deleteAccount: (id) => AccountsManager.delete(id), preImportAccounts: (i) => AccountsManager.preImportCSV(i.files[0]), confirmImportAccounts: (m) => AccountsManager.executeImport(m), cancelImportAccounts: () => AccountsManager.pendingImportData = [],
    abrirConfigStatus: () => { const listS = document.getElementById('statusConfigList'); if (!listS) { console.warn("Elemento 'statusConfigList' não encontrado."); const m = document.getElementById('modalConfigStatus'); if(m) new bootstrap.Modal(m).show(); return; } listS.innerHTML = DataManager.statusConfig.map((s, i) => `<li class="list-group-item d-flex justify-content-between align-items-center"><div class="d-flex align-items-center gap-2"><div style="width:20px; height:20px; background:${s.bg}; border:1px solid #ccc;"></div><strong>${s.name}</strong></div><div><button class="btn btn-sm btn-outline-primary" onclick="window.actions.editStatusConfig(${i})"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.actions.delStatus(${i})">x</button></div></li>`).join(''); new bootstrap.Modal(document.getElementById('modalConfigStatus')).show(); },
    editStatusConfig: (i) => { const s = DataManager.statusConfig[i]; document.getElementById('newStatusName').value = s.name; document.getElementById('newStatusLimit').value = s.limit; document.getElementById('newStatusBg').value = s.bg; document.getElementById('newStatusText').value = s.text; document.getElementById('editStatusIndex').value = i; document.getElementById('btnSaveStatus').innerText = 'Atualizar'; document.getElementById('btnCancelEdit').style.display = 'inline-block'; },
    cancelEditStatus: () => { document.getElementById('newStatusName').value = ''; document.getElementById('newStatusLimit').value = ''; document.getElementById('newStatusBg').value = '#e9ecef'; document.getElementById('editStatusIndex').value = -1; document.getElementById('btnSaveStatus').innerText = 'Adicionar'; document.getElementById('btnCancelEdit').style.display = 'none'; },
    saveStatusConfig: () => { /* ... */ window.actions.abrirConfigStatus(); renderActiveView(); },
    delStatus: (i) => { if(confirm('Del?')){ DataManager.statusConfig.splice(i, 1); DataManager.saveConfig('status_config', DataManager.statusConfig); window.actions.abrirConfigStatus(); renderActiveView(); } },
    addSlaRule: () => { const r = document.getElementById('newSlaResp').value; const d = document.getElementById('newSlaDays').value; if(r && d) { DataManager.slaConfig[r] = parseInt(d); DataManager.saveConfig('sla_config', DataManager.slaConfig); renderSLAList(); renderActiveView(); } },
    removeSla: (r) => { delete DataManager.slaConfig[r]; DataManager.saveConfig('sla_config', DataManager.slaConfig); renderSLAList(); renderActiveView(); },
    saveKanbanCardConfig: () => { const checks = document.querySelectorAll('.card-field-check'); const n = {}; checks.forEach(c => n[c.value] = c.checked); DataManager.kanbanCardFields = n; DataManager.saveConfig('kanban_card_fields', n); renderActiveView(); },
    moveColumn: (i, d) => { const n = i + d; if (n >= 0 && n < DataManager.columnOrder.length) { const t = DataManager.columnOrder[i]; DataManager.columnOrder[i] = DataManager.columnOrder[n]; DataManager.columnOrder[n] = t; DataManager.saveConfig('column_order', DataManager.columnOrder); renderColumnConfig(); renderActiveView(); } },
    toggleStrictBank: (c) => { DataManager.strictBankValidation = c; DataManager.saveConfig('strict_bank_validation', c); },
    openBankGridEditor, saveBankGridEditor, openDateEditor, saveDateEditor, openStatusEditor, saveStatusEditor, openTagEditor, addTagFromEditor, removeTag: (i) => { tempTags.splice(i,1); window.actions.saveTagEditor(); }, saveTagEditor, selectColor, openPriorityEditor, savePriorityEditor, openPercentEditor, savePercentEditor, openStyleEditor, saveStyle, resetStyle, openRowColorEditor, saveRowColor, resetRowColor,
    changeGlobalFlow: (flow) => { document.querySelectorAll('#globalFlowSelector').forEach(el => el.value = flow); renderActiveView(); },
    recalcParent: (p) => { const P = DataManager.db[p]; if(P.children && P.children.length){ const t = P.children.reduce((s,c)=>s+(parseInt(c.percentual)||0),0); P.percentual = Math.floor(t/P.children.length); if(P.percentual===100) P.status='Concluído'; else if(P.status==='Concluído') P.status='Em Andamento'; } },
    recalcAllParents: () => { DataManager.db.forEach((_, i) => window.actions.recalcParent(i)); DataManager.save(); renderActiveView(); },
    salvarManual: () => { DataManager.save(); alert("Salvo!"); },
    clearAllTickets: async () => { if(confirm("ZERAR TUDO?")) { await fetch('api.php?action=clear_all_tickets', {method:'POST'}); DataManager.db=[]; renderActiveView(); } },
    toggle: (i) => { DataManager.db[i].expanded = !DataManager.db[i].expanded; renderActiveView(); },
    abrirModalNovoPai: () => { if(!document.getElementById('modalReg')) return; document.getElementById('idxP').value = -1; ALL_FIELDS.forEach(f => { const el = document.getElementById('inp_'+f); if(el) el.value = ''; }); document.getElementById('inp_id').value = Date.now(); document.getElementById('inp_status').value = 'Previsto'; modalTempTags=[]; renderModalTags(); updateListsModal(); new bootstrap.Modal(document.getElementById('modalReg')).show(); },
    openEdit: (p,c) => { if(!document.getElementById('modalReg')) return; const d = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; document.getElementById('idxP').value = p; document.getElementById('idxC').value = c; ALL_FIELDS.forEach(f => { const el = document.getElementById('inp_'+f); if(el) el.value = d[f]||''; }); document.getElementById('inp_dt_tramitacao').value = Utils.formatDate(d.dt_tramitacao); document.getElementById('inp_dt_conclusao').value = Utils.formatDate(d.dt_conclusao); modalTempTags = d.tags ? d.tags.split(',') : []; renderModalTags(); updateListsModal(); new bootstrap.Modal(document.getElementById('modalReg')).show(); },
    salvarModal: () => { 
        const p = parseInt(document.getElementById('idxP').value); const c = parseInt(document.getElementById('idxC').value); 
        const fd = {}; ALL_FIELDS.forEach(f => { const el = document.getElementById('inp_'+f); if(el) fd[f] = el.value; });
        fd['dt_tramitacao'] = Utils.parseDateBR(document.getElementById('inp_dt_tramitacao').value);
        fd['dt_conclusao'] = Utils.parseDateBR(document.getElementById('inp_dt_conclusao').value);
        fd['percentual'] = parseInt(document.getElementById('inp_percentual').value) || 0;
        const dtPrev = Utils.parseDateBR(document.getElementById('inp_dt_prevista').value);
        if(dtPrev && fd['dt_tramitacao'] && dtPrev < fd['dt_tramitacao']) { alert('Data Prevista < Tramitação'); return; }
        fd['dt_prevista'] = dtPrev;
        fd['tags'] = modalTempTags.join(',');
        if(p === -1) { fd.tipo_fluxo = document.getElementById('globalFlowSelector').value; DataManager.db.push({...fd, children:[], expanded:true}); }
        else { const t = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; Object.assign(t, fd); if(c!==-1) window.actions.recalcParent(p); }
        bootstrap.Modal.getInstance(document.getElementById('modalReg')).hide(); DataManager.save(); renderActiveView(); 
    },
    
    // --- GERAÇÃO AUTOMÁTICA DE COR PARA FILHOS ---
    addChild: (p) => { 
        const P = DataManager.db[p]; 
        const newId = P.id + '.' + (P.children.length + 1); 
        const childColors = ['#20c997', '#0dcaf0', '#ffc107', '#fd7e14', '#6f42c1', '#e83e8c', '#198754'];
        const randomColor = childColors[Math.floor(Math.random() * childColors.length)];
        P.children.push({ id: newId, tipo_fluxo: P.tipo_fluxo, dt_tramitacao: new Date().toISOString().split('T')[0], status: 'Previsto', prioridade: 'Média', children: [], tags: '', styles: { gantt_color: randomColor } }); 
        window.actions.recalcParent(p); P.expanded=true; DataManager.save(); renderActiveView(); 
    },
    
    iniciarImportacao: (i) => { if(i.files[0]) { const r = new FileReader(); r.onload = (e) => { if(DataManager.parseCSVForImport(e.target.result) > 0) new bootstrap.Modal(document.getElementById('modalImportConfirm')).show(); else alert('0 registros.'); }; r.readAsText(i.files[0], document.getElementById('encodingSelector').value); } },
    executarImportacao: (m) => { DataManager.confirmImport(m); bootstrap.Modal.getInstance(document.getElementById('modalImportConfirm')).hide(); renderActiveView(); },
    kanbanDragStart: (e,p,c) => KanbanManager.kanbanDragStart(e,p,c),
    kanbanAllowDrop: (e) => KanbanManager.kanbanAllowDrop(e),
    kanbanDrop: (e, col) => KanbanManager.kanbanDrop(e, col),
    refreshKanban: () => { KanbanManager.viewMode = document.getElementById('kanbanViewMode').value; KanbanManager.filterParentId = document.getElementById('kanbanParentFilter').value; document.getElementById('kanbanParentFilter').style.display = KanbanManager.viewMode==='filho'?'block':'none'; KanbanManager.render(); },
};