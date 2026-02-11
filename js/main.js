import { DataManager } from './data.js';
import { UIManager } from './ui.js';
import { KanbanManager } from './kanban.js';
import { AccountsManager } from './accounts.js';
import { Utils } from './utils.js';
import { AuthManager } from './auth.js';

let activeTab = 'grid';
let modalConfigStatus = null;
let modalReg = null;
let modalTempTags = [];
let modalCurrentColor = '#ffc107';
let tempTags = [];
let currentTagColor = '#ffc107';
let currentEditing = { p: -1, c: -1, field: null, originalValue: null }; 
let currentStyling = { type: null, p: -1, c: -1, field: null, configIndex: -1 };
let modalOriginals = { empresa: '', banco: '', num_banco: '', agencia: '', conta: '' };
let validOptions = { empresa: [], banco: [], num_banco: [], agencia: [], conta: [] };
const ALL_FIELDS = ['id','empresa','banco','num_banco','agencia','conta','modalidade','cod','tipo_arq','metodo','topico','prioridade','percentual','anotacoes','obs','responsavel'];

document.addEventListener('DOMContentLoaded', async () => {
    // ... (Init code same as before) ...
    const cachedTheme = localStorage.getItem('cnab_theme') || 'excel';
    document.body.setAttribute('data-theme', cachedTheme);
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) themeSelector.value = cachedTheme;

    const isLogged = await AuthManager.checkSession();
    if (!isLogged) return;
    document.body.style.visibility = 'visible';
    AuthManager.applyUIProtection();

    const loadingOverlay = document.getElementById('loadingOverlay');
    try {
        await DataManager.load();
        if (window.actions && window.actions.recalcAllParents) window.actions.recalcAllParents();
        await AccountsManager.load();
        updateStatusDropdowns();
        renderActiveView();
        setupCascadingDropdownsModal();
        setupGridEditorEvents();
        
        document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const kControls = document.getElementById('kanbanControls');

                
                if (e.target.id === 'kanban-tab') {
                    activeTab = 'kanban';
                    kControls.classList.remove('d-none'); kControls.classList.add('d-flex'); 
                    KanbanManager.populateParentFilter();
                } else {
                    activeTab = 'grid';
                    kControls.classList.add('d-none'); kControls.classList.remove('d-flex');
                }
                renderActiveView();
            });
        });

        const csEl = document.getElementById('modalConfigStatus'); if(csEl) modalConfigStatus = new bootstrap.Modal(csEl);
        const regEl = document.getElementById('modalReg'); if(regEl) modalReg = new bootstrap.Modal(regEl);
        const impEl = document.getElementById('modalImportConfirm'); if(impEl) new bootstrap.Modal(impEl);
        const slaEl = document.getElementById('modalSLA'); if(slaEl) new bootstrap.Modal(slaEl);
        
        document.querySelectorAll('.date-mask').forEach(input => { input.addEventListener('input', (e) => { let v = e.target.value.replace(/\D/g, ''); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9); e.target.value = v; }); });
        
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

            const tabList = document.getElementById('configTabsSortable');
            if(tabList && typeof Sortable !== 'undefined') {
                Sortable.create(tabList, { animation: 150, ghostClass: 'bg-light', onEnd: (evt) => {
                    const order = Array.from(evt.to.children).map(li => { const link = li.querySelector('a.nav-link'); return link ? link.getAttribute('href') : null; }).filter(id => id);
                    DataManager.saveConfig('config_tab_order', order);
                }});
            }
            if(typeof AccountsManager.renderAccountsList === 'function') AccountsManager.renderAccountsList();
        });

    } catch (error) { console.error("Erro Fatal no Init:", error); } 
    finally { if(loadingOverlay) { loadingOverlay.style.opacity = '0'; setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500); } }
});

// ... (Funções auxiliares renderConfigList, etc. mantidas) ...
function applyTabOrder() {
    const order = DataManager.configTabOrder;
    if (!order || !Array.isArray(order)) return;
    const ul = document.getElementById('configTabsSortable');
    if (!ul) return;
    const tabMap = {};
    Array.from(ul.children).forEach(li => { const link = li.querySelector('a.nav-link'); if (link) tabMap[link.getAttribute('href')] = li; });
    order.forEach(href => { if (tabMap[href]) { ul.appendChild(tabMap[href]); delete tabMap[href]; } });
    Object.values(tabMap).forEach(li => ul.appendChild(li));
    const firstTab = ul.querySelector('a.nav-link.active');
    if(!firstTab) { const first = ul.querySelector('a.nav-link'); if(first) new bootstrap.Tab(first).show(); }
}

const renderActiveView = () => { 
    if(activeTab === 'grid') UIManager.render(); 
    else if(activeTab === 'kanban') KanbanManager.render(); 

}

function smartPosition(editorId, targetElement) {
    const editor = document.getElementById(editorId);
    if (!editor || !targetElement) return;
    editor.style.display = 'block'; editor.style.visibility = 'hidden';
    const rect = targetElement.getBoundingClientRect(); const edRect = editor.getBoundingClientRect();
    const viewW = window.innerWidth; const viewH = window.innerHeight;
    let top = rect.bottom; let left = rect.left;
    if (top + edRect.height > viewH - 10) top = rect.top - edRect.height;
    if (left + edRect.width > viewW - 10) left = viewW - edRect.width - 10;
    if (left < 10) left = 10;
    editor.style.top = `${top}px`; editor.style.left = `${left}px`; editor.style.visibility = 'visible';
    const firstInput = editor.querySelector('input, select'); if(firstInput) firstInput.focus();
}

function renderConfigList(elementId, dataArray, configKey) {
    const list = document.getElementById(elementId); if(!list) return;
    list.innerHTML = dataArray.map((item, index) => `<li class="list-group-item d-flex justify-content-between align-items-center py-1"><span>${item}</span><button class="btn btn-sm btn-link text-danger" onclick="window.actions.removeConfigItem('${configKey}', ${index})">x</button></li>`).join('');
}
function renderKanbanCardConfig() {
    const container = document.getElementById('kanbanCardConfigList'); if (!container) return; container.innerHTML = '';
    Object.keys(DataManager.colLabels).forEach(key => { if (['id', 'actions', 'children', 'expanded'].includes(key)) return; const isChecked = DataManager.kanbanCardFields[key] ? 'checked' : ''; const label = DataManager.colLabels[key] || key; container.innerHTML += `<div class="form-check form-switch"><input class="form-check-input card-field-check" type="checkbox" value="${key}" id="chk_kbn_${key}" ${isChecked}><label class="form-check-label" for="chk_kbn_${key}">${label}</label></div>`; });
}
function renderColumnConfig() {
    const list = document.getElementById('colConfigList'); if (!list) return;
    let headerHTML = `<div class="p-2 mb-3 bg-light border rounded"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="chkStrictBank" ${DataManager.strictBankValidation ? 'checked' : ''} onchange="window.actions.toggleStrictBank(this.checked)"><label class="form-check-label fw-bold" for="chkStrictBank">Validar dados bancários</label></div></div><hr>`;
    const itemsHTML = DataManager.columnOrder.map((col, index) => { const label = DataManager.colLabels[col] || col; const isFirst = index === 0 ? 'disabled' : ''; const isLast = index === DataManager.columnOrder.length - 1 ? 'disabled' : ''; return `<li class="list-group-item d-flex justify-content-between align-items-center p-2"><span>${label}</span><div><button class="btn btn-sm btn-outline-secondary py-0" ${isFirst} onclick="window.actions.moveColumn(${index}, -1)"><i class="bi bi-arrow-up"></i></button><button class="btn btn-sm btn-outline-secondary py-0" ${isLast} onclick="window.actions.moveColumn(${index}, 1)"><i class="bi bi-arrow-down"></i></button></div></li>`; }).join('');
    list.innerHTML = headerHTML + itemsHTML;
}
function updateListsForContext(dataObj) { const valEmpresa = (dataObj.empresa || '').trim(); const valBanco = (dataObj.banco || '').trim(); const valNumBanco = (dataObj.num_banco || '').trim(); const valAgencia = (dataObj.agencia || '').trim(); const getUnique = (list, field) => [...new Set(list.map(i => i[field]?i[field].trim():''))].filter(v=>v).sort(); validOptions.empresa = getUnique(AccountsManager.accounts, 'company_name'); let filteredForBank = AccountsManager.accounts; if (valEmpresa) filteredForBank = filteredForBank.filter(a => a.company_name === valEmpresa); if (valBanco) filteredForBank = filteredForBank.filter(a => a.bank_name === valBanco); if (valNumBanco) filteredForBank = filteredForBank.filter(a => a.bank_number === valNumBanco); validOptions.banco = getUnique(filteredForBank, 'bank_name'); validOptions.num_banco = getUnique(filteredForBank, 'bank_number'); let filteredForAgencia = filteredForBank; validOptions.agencia = getUnique(filteredForAgencia, 'agency'); let filteredForConta = filteredForAgencia; if (valAgencia) filteredForConta = filteredForConta.filter(a => a.agency === valAgencia); validOptions.conta = getUnique(filteredForConta, 'account_number'); }
function fillDatalist(id, values) { const dl = document.getElementById(id); if(dl) { dl.innerHTML = ''; values.forEach(v => { const opt = document.createElement('option'); opt.value = v; dl.appendChild(opt); }); } }
function setupGridEditorEvents() { const input = document.getElementById('bankGridInput'); if(input) { input.addEventListener('change', () => { const val = input.value.trim(); if (DataManager.strictBankValidation && currentEditing.field && currentEditing.field !== 'conta' && val !== currentEditing.originalValue && val !== '') { if (!validOptions[currentEditing.field].includes(val)) { alert(`Valor não cadastrado! (Validação Ativa)`); input.value = currentEditing.originalValue; input.focus(); } } }); } }
function setupCascadingDropdownsModal() { 
    const elEmpresa = document.getElementById('inp_empresa'); const elBanco = document.getElementById('inp_banco'); const elNumBanco = document.getElementById('inp_num_banco'); const elAgencia = document.getElementById('inp_agencia'); const elConta = document.getElementById('inp_conta'); if(!elEmpresa) return; 
    const updateAll = () => updateListsModal(); elEmpresa.addEventListener('input', updateAll); elBanco.addEventListener('input', updateAll); elNumBanco.addEventListener('input', updateAll); elAgencia.addEventListener('input', updateAll); 
    elEmpresa.addEventListener('change', () => validateModalField(elEmpresa, 'empresa', 'Empresa não cadastrada!')); elBanco.addEventListener('change', () => { validateModalField(elBanco, 'banco', 'Banco inválido!'); const match = AccountsManager.accounts.find(a => a.bank_name === elBanco.value.trim()); if(match) elNumBanco.value = match.bank_number; }); elNumBanco.addEventListener('change', () => { validateModalField(elNumBanco, 'num_banco', 'Nº inválido!'); const match = AccountsManager.accounts.find(a => a.bank_number === elNumBanco.value.trim()); if(match) elBanco.value = match.bank_name; }); elAgencia.addEventListener('change', () => validateModalField(elAgencia, 'agencia', 'Agência inválida!')); elConta.addEventListener('input', (e) => { const val = e.target.value.trim(); if(!val) return; const match = AccountsManager.accounts.find(acc => acc.account_number.trim() === val); if (match) { document.getElementById('inp_empresa').value = match.company_name; document.getElementById('inp_banco').value = match.bank_name; document.getElementById('inp_num_banco').value = match.bank_number; document.getElementById('inp_agencia').value = match.agency; updateListsModal(); } }); elConta.addEventListener('change', () => validateModalField(elConta, 'conta', 'Conta inválida!')); 
}
function updateListsModal() { const vEmpresa = document.getElementById('inp_empresa').value; const vBanco = document.getElementById('inp_banco').value; const vNumBanco = document.getElementById('inp_num_banco').value; const vAgencia = document.getElementById('inp_agencia').value; updateListsForContext({ empresa: vEmpresa, banco: vBanco, num_banco: vNumBanco, agencia: vAgencia }); fillDatalist('list_empresa', validOptions.empresa); fillDatalist('list_banco', validOptions.banco); fillDatalist('list_num_banco', validOptions.num_banco); fillDatalist('list_agencia', validOptions.agencia); fillDatalist('list_conta', validOptions.conta); }
function validateModalField(input, type, msg) { if (!DataManager.strictBankValidation) return; const val = input.value.trim(); if (!val || val === modalOriginals[type]) return; if (!validOptions[type].includes(val)) { alert(msg); input.value = ''; } else { if(type === 'empresa') { document.getElementById('inp_banco').value=''; document.getElementById('inp_num_banco').value=''; document.getElementById('inp_agencia').value=''; } if(type === 'banco' || type === 'num_banco') { document.getElementById('inp_agencia').value=''; } updateListsModal(); } }
const updateStatusDropdowns = () => { const opts = DataManager.statusConfig.map(s => `<option value="${s.name}">${s.name}</option>`).join(''); document.getElementById('floatStatusInput').innerHTML = opts; document.getElementById('inp_status').innerHTML = opts; }
const renderModalTags = () => { const el = document.getElementById('modalTagList'); if(el) el.innerHTML = modalTempTags.map((t,i) => `<span class="tag-pill" style="background:${t.split('|')[1]}">${t.split('|')[0]} <span onclick="window.actions.modalRemoveTag(${i})">&times;</span></span>`).join(''); }
const renderSLAList = () => { document.getElementById('slaList').innerHTML = Object.entries(DataManager.slaConfig).map(([r, d]) => `<li class="list-group-item d-flex justify-content-between py-1"><span><b>${r}</b>: ${d}d</span><button class="btn btn-sm btn-outline-danger" onclick="window.actions.removeSla('${r}')">x</button></li>`).join(''); }

// ======================================================================
// DEFINIÇÃO DAS FUNÇÕES DE EDIÇÃO (Declaração explícita para evitar ReferenceError)
// ======================================================================
const openBankGridEditor = (p, c, field, e) => { e.stopPropagation(); const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; const valAtual = item[field] || ''; currentEditing = { p, c, field, originalValue: valAtual }; updateListsForContext({ empresa: item.empresa, banco: item.banco, num_banco: item.num_banco, agencia: item.agencia }); const editor = document.getElementById('bankGridEditor'); const input = document.getElementById('bankGridInput'); document.getElementById('bankGridLabel').innerText = (DataManager.colLabels[field] || field).toUpperCase(); input.value = valAtual; fillDatalist('bankGridList', validOptions[field]); smartPosition('bankGridEditor', e.target.closest('td')); input.select(); };
const saveBankGridEditor = () => { const input = document.getElementById('bankGridInput'); const val = input.value.trim(); const { p, c, field, originalValue } = currentEditing; const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (val === originalValue) { document.getElementById('bankGridEditor').style.display = 'none'; return; } if (field === 'conta' && val) { const match = AccountsManager.accounts.find(acc => acc.account_number.trim() === val); if (match) { item.empresa = match.company_name; item.banco = match.bank_name; item.num_banco = match.bank_number; item.agencia = match.agency; item.conta = match.account_number; } else { if(DataManager.strictBankValidation) { alert("Conta não cadastrada!"); input.focus(); return; } else { item.conta = val; } } } else { if (DataManager.strictBankValidation && val && !validOptions[field].includes(val)) { alert("Opção inválida! Escolha um item da lista."); input.focus(); return; } item[field] = val; if (field === 'banco' && val) { const match = AccountsManager.accounts.find(a => a.bank_name === val); if(match) item.num_banco = match.bank_number; } if (field === 'num_banco' && val) { const match = AccountsManager.accounts.find(a => a.bank_number === val); if(match) item.banco = match.bank_name; } if (field === 'empresa') { item.banco = ''; item.num_banco = ''; item.agencia = ''; item.conta = ''; } if (field === 'banco' || field === 'num_banco') { item.agencia = ''; item.conta = ''; } if (field === 'agencia') { item.conta = ''; } } document.getElementById('bankGridEditor').style.display = 'none'; DataManager.save(); renderActiveView(); };
const openModalidadeEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; const sel = document.getElementById('floatModalidadeInput'); sel.innerHTML = DataManager.paymentModes.map(m => `<option value="${m}">${m}</option>`).join(''); sel.value = item.modalidade || DataManager.paymentModes[0]; smartPosition('modalidadeEditor', e.target.closest('td')); };
const saveModalidadeEditor = () => { const val = document.getElementById('floatModalidadeInput').value; const {p,c} = currentEditing; (c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]).modalidade = val; document.getElementById('modalidadeEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openOcorrenciaEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; const sel = document.getElementById('floatOcorrenciaInput'); sel.innerHTML = DataManager.receivableOccurrences.map(m => `<option value="${m}">${m}</option>`).join(''); sel.value = item.ocorrencia || DataManager.receivableOccurrences[0]; smartPosition('ocorrenciaEditor', e.target.closest('td')); };
const saveOcorrenciaEditor = () => { const val = document.getElementById('floatOcorrenciaInput').value; const {p,c} = currentEditing; (c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]).ocorrencia = val; document.getElementById('ocorrenciaEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openFlowEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; document.getElementById('floatFlowInput').value = item.tipo_fluxo || 'Contas a Pagar'; smartPosition('flowEditor', e.target.closest('td')); };
const saveFlowEditor = () => { const val = document.getElementById('floatFlowInput').value; const {p,c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; item.tipo_fluxo = val; if(val === 'Contas a Pagar') item.ocorrencia = ''; else item.modalidade = ''; document.getElementById('flowEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openFileTypeEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; const sel = document.getElementById('floatFileTypeInput'); sel.innerHTML = DataManager.fileTypes.map(m => `<option value="${m}">${m}</option>`).join(''); sel.value = item.tipo_arq || DataManager.fileTypes[0]; smartPosition('fileTypeEditor', e.target.closest('td')); };
const saveFileTypeEditor = () => { const val = document.getElementById('floatFileTypeInput').value; const {p,c} = currentEditing; (c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]).tipo_arq = val; document.getElementById('fileTypeEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const openMethodEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; const sel = document.getElementById('floatMethodInput'); if (!sel) return console.error('HTML #floatMethodInput missing'); sel.innerHTML = DataManager.paymentMethods.map(m => `<option value="${m}">${m}</option>`).join(''); sel.value = item.metodo || DataManager.paymentMethods[0]; smartPosition('methodEditor', e.target.closest('td')); };
const saveMethodEditor = () => { const val = document.getElementById('floatMethodInput').value; const {p,c} = currentEditing; (c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]).metodo = val; document.getElementById('methodEditor').style.display='none'; DataManager.save(); renderActiveView(); };
const addConfigItem = (configKey, inputId) => { const val = document.getElementById(inputId).value.trim(); if(val) { DataManager[configKey].push(val.toUpperCase()); let dbKey = configKey; if(configKey==='paymentModes') dbKey='payment_modes'; if(configKey==='receivableOccurrences') dbKey='receivable_occurrences'; if(configKey==='fileTypes') dbKey='file_types'; if(configKey==='paymentMethods') dbKey='payment_methods'; DataManager.saveConfig(dbKey, DataManager[configKey]); renderConfigList('list'+configKey.charAt(0).toUpperCase()+configKey.slice(1), DataManager[configKey], configKey); document.getElementById(inputId).value = ''; } };
const removeConfigItem = (configKey, index) => { if(confirm('Remover item?')) { DataManager[configKey].splice(index, 1); let dbKey = configKey; if(configKey==='paymentModes') dbKey='payment_modes'; if(configKey==='receivableOccurrences') dbKey='receivable_occurrences'; if(configKey==='fileTypes') dbKey='file_types'; if(configKey==='paymentMethods') dbKey='payment_methods'; DataManager.saveConfig(dbKey, DataManager[configKey]); renderConfigList('list'+configKey.charAt(0).toUpperCase()+configKey.slice(1), DataManager[configKey], configKey); } };
const openRowColorEditor = (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; const rowColor = (item.styles && item.styles.row) ? item.styles.row : '#ffffff'; document.getElementById('rowColorPicker').value = rowColor; smartPosition('rowColorEditor', e.target.closest('td')); };
const saveRowColor = () => { const color = document.getElementById('rowColorPicker').value; const {p, c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (!item.styles) item.styles = {}; item.styles.row = color; document.getElementById('rowColorEditor').style.display = 'none'; DataManager.save(); renderActiveView(); };
const resetRowColor = () => { const {p, c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (item.styles && item.styles.row) delete item.styles.row; document.getElementById('rowColorEditor').style.display = 'none'; DataManager.save(); renderActiveView(); };

// ======================================================================
// WINDOW ACTIONS (EXPORTS)
// ======================================================================
window.actions = {
    logout: () => AuthManager.logout(),
    mudarTema: (t) => { document.body.setAttribute('data-theme', t); localStorage.setItem('cnab_theme', t); DataManager.saveConfig('cnab_theme', t); },
    
    // --- KANBAN HEADER CONTROL (NOVA FUNÇÃO) ---
    updateVisibleCards: (colIndex, val) => {
        const num = parseInt(val);
        if (num >= 0) {
            DataManager.statusConfig[colIndex].visibleCards = num;
            DataManager.saveConfig('status_config', DataManager.statusConfig);
            if (activeTab === 'kanban') KanbanManager.render();
        }
    },

        // Config Editors (Exportados)
    openModalidadeEditor, saveModalidadeEditor,
    openOcorrenciaEditor, saveOcorrenciaEditor,
    openFlowEditor, saveFlowEditor,
    openFileTypeEditor, saveFileTypeEditor,
    openMethodEditor, saveMethodEditor,
    addConfigItem, removeConfigItem,
    openRowColorEditor, saveRowColor, resetRowColor,
    
    // Users, Accounts, etc...
    loadUsersList: async () => { const res = await fetch('api.php?action=list_users'); const json = await res.json(); if(json.status === 'success') { document.getElementById('usersList').innerHTML = json.data.map(u => `<li class="list-group-item d-flex justify-content-between align-items-center"><span><b>${u.username}</b> ${u.permissions.admin?'<span class="badge bg-danger">ADM</span>':''}</span><div><button class="btn btn-sm btn-link" onclick='window.actions.editUser(${JSON.stringify(u)})'>Editar</button>${u.username.toLowerCase()!=='adm'?`<button class="btn btn-sm btn-link text-danger" onclick="window.actions.delUser(${u.id})">Excluir</button>`:''}</div></li>`).join(''); } },
    editUser: (u) => { document.getElementById('editUserId').value = u.id; document.getElementById('userInputName').value = u.username; document.getElementById('userInputPass').value = ''; document.querySelectorAll('.perm-check').forEach(chk => { const key = chk.id.replace('perm_',''); chk.checked = !!u.permissions[key]; }); },
    saveUser: async () => { const id=document.getElementById('editUserId').value; const u=document.getElementById('userInputName').value; const p=document.getElementById('userInputPass').value; const perms={}; document.querySelectorAll('.perm-check').forEach(chk => { if(chk.checked) perms[chk.id.replace('perm_','')] = true; }); if(!u) { alert('Digite um nome de usuário.'); return; } try { const res = await fetch('api.php?action=save_user', { method:'POST', body:JSON.stringify({id, username:u, password:p, permissions:perms}) }); const json = await res.json(); if(json.status==='success') { alert('Salvo!'); document.getElementById('editUserId').value=''; document.getElementById('userInputName').value=''; document.getElementById('userInputPass').value=''; document.querySelectorAll('.perm-check').forEach(c=>c.checked=false); window.actions.loadUsersList(); } else { alert(json.message); } } catch(e){console.error(e);} },
    delUser: async (id) => { if(confirm('Excluir?')) { await fetch('api.php?action=delete_user', { method:'POST', body:JSON.stringify({id}) }); window.actions.loadUsersList(); } },
    abrirModalContas: () => { window.actions.abrirConfigStatus(); const tabEl = document.querySelector('a[href="#conf-accounts"]'); if(tabEl) new bootstrap.Tab(tabEl).show(); },
    saveAccount: async () => { const acc = { id: document.getElementById('accId').value, oracle_name: document.getElementById('accOracle').value, bank_name: document.getElementById('accBank').value, bank_number: document.getElementById('accBankNum').value, agency: document.getElementById('accAgency').value, account_number: document.getElementById('accNum').value, company_name: document.getElementById('accCompany').value }; if(await AccountsManager.save(acc)) { document.getElementById('formAccount').reset(); document.getElementById('accId').value = ''; updateListsModal(); } },
    editAccount: (id) => AccountsManager.openModal(id),
    deleteAccount: (id) => { AccountsManager.delete(id); updateListsModal(); },
    preImportAccounts: (input) => { if(input.files[0]) { AccountsManager.preImportCSV(input.files[0]); input.value = ''; } },
    confirmImportAccounts: (mode) => AccountsManager.executeImport(mode),
    cancelImportAccounts: () => { AccountsManager.pendingImportData = []; },
    abrirConfigStatus: () => { const listS = document.getElementById('statusConfigList'); listS.innerHTML = DataManager.statusConfig.map((s, i) => `<li class="list-group-item d-flex justify-content-between align-items-center"><div class="d-flex align-items-center gap-2"><div style="width:20px; height:20px; background:${s.bg||'#eee'}; border:1px solid #ccc;"></div><strong>${s.name}</strong></div><div><button class="btn btn-sm btn-outline-primary" onclick="window.actions.editStatusConfig(${i})"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.actions.delStatus(${i})">x</button></div></li>`).join(''); new bootstrap.Modal(document.getElementById('modalConfigStatus')).show(); },
    abrirConfigSLA: () => { window.actions.abrirConfigStatus(); const tabEl = document.querySelector('a[href="#conf-sla"]'); if(tabEl) new bootstrap.Tab(tabEl).show(); },
    addSlaRule: () => { const r = document.getElementById('newSlaResp').value; const d = document.getElementById('newSlaDays').value; if(r && d) { DataManager.slaConfig[r] = parseInt(d); DataManager.saveConfig('sla_config', DataManager.slaConfig); renderSLAList(); renderActiveView(); } },
    removeSla: (r) => { delete DataManager.slaConfig[r]; DataManager.saveConfig('sla_config', DataManager.slaConfig); renderSLAList(); renderActiveView(); },
    editStatusConfig: (i) => { const s = DataManager.statusConfig[i]; document.getElementById('newStatusName').value = s.name; document.getElementById('newStatusLimit').value = s.limit; document.getElementById('newStatusBg').value = s.bg || '#e9ecef'; document.getElementById('newStatusText').value = s.text || '#000000'; document.getElementById('editStatusIndex').value = i; document.getElementById('btnSaveStatus').innerText = 'Atualizar'; document.getElementById('btnSaveStatus').className = 'btn btn-success btn-sm w-100'; document.getElementById('btnCancelEdit').style.display = 'inline-block'; },
    cancelEditStatus: () => { document.getElementById('newStatusName').value = ''; document.getElementById('newStatusLimit').value = ''; document.getElementById('newStatusBg').value = '#e9ecef'; document.getElementById('newStatusText').value = '#000000'; document.getElementById('editStatusIndex').value = -1; document.getElementById('btnSaveStatus').innerText = 'Adicionar'; document.getElementById('btnSaveStatus').className = 'btn btn-primary btn-sm w-100'; document.getElementById('btnCancelEdit').style.display = 'none'; },
    saveStatusConfig: () => { const name = document.getElementById('newStatusName').value.trim(); const limit = parseInt(document.getElementById('newStatusLimit').value) || 0; const bg = document.getElementById('newStatusBg').value; const text = document.getElementById('newStatusText').value; const editIdx = parseInt(document.getElementById('editStatusIndex').value); if(name) { if (editIdx > -1) { const oldName = DataManager.statusConfig[editIdx].name; const oldVis = DataManager.statusConfig[editIdx].visibleCards ?? 0; DataManager.statusConfig[editIdx] = { name, limit, bg, text, visibleCards: oldVis }; if (oldName !== name) { DataManager.db.forEach(pai => { if(pai.status === oldName) pai.status = name; pai.children.forEach(filho => { if(filho.status === oldName) filho.status = name; }); }); DataManager.save(); } } else { DataManager.statusConfig.push({ name, limit, bg, text, visibleCards: 0 }); } DataManager.saveConfig('status_config', DataManager.statusConfig); window.actions.abrirConfigStatus(); updateStatusDropdowns(); renderActiveView(); } },
    delStatus: (i) => { if(confirm('Excluir?')) { DataManager.statusConfig.splice(i, 1); DataManager.saveConfig('status_config', DataManager.statusConfig); window.actions.abrirConfigStatus(); updateStatusDropdowns(); renderActiveView(); } },
    openBankGridEditor, saveBankGridEditor,
    openPriorityEditor: (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; document.getElementById('floatPriorityInput').value = item.prioridade || 'Média'; smartPosition('priorityEditor', e.target.closest('td')); },
    savePriorityEditor: () => { const val = document.getElementById('floatPriorityInput').value; const {p,c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; item.prioridade = val; document.getElementById('priorityEditor').style.display='none'; DataManager.save(); renderActiveView(); },
    openPercentEditor: (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; document.getElementById('floatPercentInput').value = item.percentual || 0; smartPosition('percentEditor', e.target.closest('td')); document.getElementById('floatPercentInput').focus(); },
    savePercentEditor: () => { const val = parseInt(document.getElementById('floatPercentInput').value) || 0; const {p,c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; item.percentual = Math.min(100, Math.max(0, val)); if (item.percentual === 100) item.status = 'Concluído'; else if (item.status === 'Concluído' && item.percentual < 100) item.status = 'Em Andamento'; if (c !== -1) window.actions.recalcParent(p); document.getElementById('percentEditor').style.display='none'; DataManager.save(); renderActiveView(); },
    toggle: (i) => { if(DataManager.db[i]) { DataManager.db[i].expanded = !DataManager.db[i].expanded; renderActiveView(); } },
    changeGlobalFlow: (flow) => { renderActiveView(); },
    recalcParent: (p) => { const parent = DataManager.db[p]; if (!parent.children || parent.children.length === 0) return; const total = parent.children.reduce((sum, child) => sum + (parseInt(child.percentual)||0), 0); const avg = Math.floor(total / parent.children.length); parent.percentual = avg; if (avg === 100) parent.status = 'Concluído'; else if (parent.status === 'Concluído' && avg < 100) parent.status = 'Em Andamento'; },
    recalcAllParents: () => { DataManager.db.forEach((parent, index) => { window.actions.recalcParent(index); }); DataManager.save(); renderActiveView(); },
    abrirModalNovoPai: () => { if(!modalReg) return; let maxId = 0; DataManager.db.forEach(item => { const val = parseInt(item.id); if(!isNaN(val) && val > maxId) maxId = val; }); document.getElementById('idxP').value = -1; ALL_FIELDS.forEach(f => { const el = document.getElementById('inp_'+f); if(el) el.value = ''; }); document.getElementById('inp_id').value = maxId + 1; document.getElementById('inp_prioridade').value = 'Média'; document.getElementById('inp_status').value = 'Previsto'; document.getElementById('inp_percentual').value = 0; document.getElementById('inp_dt_tramitacao').value = Utils.formatDate(new Date().toISOString().split('T')[0]); modalTempTags = []; renderModalTags(); modalOriginals = { empresa: '', banco: '', num_banco: '', agencia: '', conta: '' }; updateListsModal(); modalReg.show(); },
    openEdit: (p, c) => { if(!modalReg) return; const d = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; document.getElementById('idxP').value = p; document.getElementById('idxC').value = c; ALL_FIELDS.forEach(f => { const el = document.getElementById('inp_'+f); if(el) el.value = d[f] || ''; }); document.getElementById('inp_dt_tramitacao').value = Utils.formatDate(d.dt_tramitacao); document.getElementById('inp_dt_conclusao').value = Utils.formatDate(d.dt_conclusao); document.getElementById('inp_status').value = d.status || 'Previsto'; modalTempTags = d.tags ? d.tags.split(',').filter(x=>x) : []; renderModalTags(); modalOriginals = { empresa: d.empresa||'', banco: d.banco||'', num_banco: d.num_banco||'', agencia: d.agencia||'', conta: d.conta||'' }; updateListsModal(); modalReg.show(); },
    salvarModal: () => { 
        const p = parseInt(document.getElementById('idxP').value); const c = parseInt(document.getElementById('idxC').value); const formData = {}; 
        ALL_FIELDS.forEach(f => { const el = document.getElementById('inp_'+f); if(el) formData[f] = el.value; }); 
        formData['dt_tramitacao'] = Utils.parseDateBR(document.getElementById('inp_dt_tramitacao').value) || ''; 
        formData['dt_conclusao'] = Utils.parseDateBR(document.getElementById('inp_dt_conclusao').value) || ''; 
        formData['percentual'] = parseInt(document.getElementById('inp_percentual').value) || 0;
        const rawDtPrevista = document.getElementById('inp_dt_prevista').value;
        const dtPrevista = Utils.parseDateBR(rawDtPrevista) || '';
        if (dtPrevista && formData['dt_tramitacao'] && dtPrevista < formData['dt_tramitacao']) { alert("A Data Prevista não pode ser menor que a Data de Tramitação!"); return; }
        if (c !== -1 && dtPrevista) { const parent = DataManager.db[p]; if (parent.dt_prevista && dtPrevista > parent.dt_prevista) { alert("Data Prevista do filho não pode ser maior que a do pai!"); return; } }
        if (c === -1 && dtPrevista) { const parent = DataManager.db[p]; if (parent && parent.children) { const invalidChild = parent.children.find(child => child.dt_prevista && child.dt_prevista > dtPrevista); if (invalidChild) { alert("Existem filhos com Data Prevista maior!"); return; } } }
        formData['dt_prevista'] = dtPrevista;
        if (formData['dt_conclusao']) { formData['status'] = 'Concluído'; formData['percentual'] = 100; } else { formData['status'] = document.getElementById('inp_status').value; if(formData['status'] === 'Concluído') formData['percentual'] = 100; } 
        formData.tags = modalTempTags.join(','); 
        if(p === -1) { formData.tipo_fluxo = document.getElementById('globalFlowSelector').value; DataManager.db.push({ ...formData, children: [], expanded: true, styles:{} }); } else { const target = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; Object.assign(target, formData); if (c === -1 && formData['dt_conclusao']) { if(target.children) { target.children.forEach(child => { child.dt_conclusao = formData['dt_conclusao']; child.status = 'Concluído'; child.percentual = 100; }); } } if (c !== -1) window.actions.recalcParent(p); } 
        modalReg.hide(); DataManager.save(); renderActiveView(); 
    },
    addChild: (p) => { const parent = DataManager.db[p]; let maxSuffix = 0; if (parent.children && parent.children.length > 0) { parent.children.forEach(child => { const parts = child.id.toString().split('.'); if(parts.length > 1) { const suffix = parseInt(parts[1]); if(!isNaN(suffix) && suffix > maxSuffix) maxSuffix = suffix; } }); } const nextSuffix = maxSuffix + 1; const newId = `${parent.id}.${nextSuffix}`; parent.children.push({ id: newId, tipo_fluxo: parent.tipo_fluxo, dt_tramitacao: new Date().toISOString().split('T')[0], status: 'Previsto', prioridade: 'Média', percentual: 0, children:[], tags:'', styles:{}, empresa: parent.empresa, banco: parent.banco }); window.actions.recalcParent(p); parent.expanded = true; DataManager.save(); renderActiveView(); },
    del: (p,c) => { if(confirm('Excluir?')) { if(c===-1) DataManager.db.splice(p,1); else { DataManager.db[p].children.splice(c,1); window.actions.recalcParent(p); } DataManager.save(); renderActiveView(); } },
    iniciarImportacao: (input) => { if(!input.files[0]) return; const reader = new FileReader(); const encEl = document.getElementById('encodingSelector'); const enc = encEl ? encEl.value : 'UTF-8'; document.getElementById('loadingOverlay').style.display='flex'; reader.onload = (e) => { try { const c = DataManager.parseCSVForImport(e.target.result); if(c>0) { const el = document.getElementById('modalImportConfirm'); const modal = bootstrap.Modal.getOrCreateInstance(el); modal.show(); } else { alert("Nenhum registro encontrado."); } } catch(err) { alert("Erro import: " + err); } finally { document.getElementById('loadingOverlay').style.display='none'; input.value = ''; } }; reader.readAsText(input.files[0], enc); },
    executarImportacao: (m) => { DataManager.confirmImport(m); renderActiveView(); const el = document.getElementById('modalImportConfirm'); const modal = bootstrap.Modal.getInstance(el); if (modal) { modal.hide(); } else { const btn = el.querySelector('[data-bs-dismiss="modal"]'); if(btn) btn.click(); } },
    salvarManual: () => { DataManager.save(); alert("Salvo!"); },
    clearAllTickets: async () => { if(!confirm("TEM CERTEZA? APAGARÁ TUDO!")) return; try { const res = await fetch('api.php?action=clear_all_tickets', { method: 'POST' }); const json = await res.json(); if(json.status === 'success') { DataManager.db = []; renderActiveView(); alert("Limpo!"); bootstrap.Modal.getInstance(document.getElementById('modalConfigStatus')).hide(); } } catch(e) { console.error(e); } },
    saveKanbanCardConfig: () => { const checks = document.querySelectorAll('.card-field-check'); const newConfig = {}; checks.forEach(chk => { newConfig[chk.value] = chk.checked; }); DataManager.kanbanCardFields = newConfig; DataManager.saveConfig('kanban_card_fields', newConfig); renderActiveView(); },
    kanbanDragStart: (e,p,c) => KanbanManager.kanbanDragStart(e,p,c),
    kanbanAllowDrop: (e) => KanbanManager.kanbanAllowDrop(e),
    kanbanDrop: (e, col) => KanbanManager.kanbanDrop(e, col),
    refreshKanban: () => { KanbanManager.viewMode = document.getElementById('kanbanViewMode').value; KanbanManager.filterParentId = document.getElementById('kanbanParentFilter').value; document.getElementById('kanbanParentFilter').style.display = KanbanManager.viewMode==='filho'?'block':'none'; KanbanManager.render(); },
    saveStyle: () => { const bg = document.getElementById('styleBgPicker').value; const text = document.getElementById('styleTextPicker').value; const { p, c, field } = currentStyling; const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (!item.styles) item.styles = {}; item.styles[field] = { bg, text }; DataManager.save(); document.getElementById('styleEditor').style.display = 'none'; renderActiveView(); },
    resetStyle: () => { const { p, c, field } = currentStyling; const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]; if (item.styles && item.styles[field]) delete item.styles[field]; DataManager.save(); document.getElementById('styleEditor').style.display = 'none'; renderActiveView(); },
    openStyleEditor: (ev, p, c, field) => { ev.preventDefault(); currentStyling = { p, c, field }; const styles = (c === -1 ? DataManager.db[p] : DataManager.db[p].children[c]).styles || {}; const st = styles[field] || {}; document.getElementById('styleBgPicker').value = st.bg || '#ffffff'; document.getElementById('styleTextPicker').value = st.text || '#000000'; smartPosition('styleEditor', (ev.target.closest('td') || {getBoundingClientRect:()=>({top:ev.clientY,left:ev.clientX,bottom:ev.clientY,right:ev.clientX})})); },
    moveColumn: (index, direction) => { const newIndex = index + direction; if (newIndex >= 0 && newIndex < DataManager.columnOrder.length) { const temp = DataManager.columnOrder[index]; DataManager.columnOrder[index] = DataManager.columnOrder[newIndex]; DataManager.columnOrder[newIndex] = temp; DataManager.saveConfig('column_order', DataManager.columnOrder); renderColumnConfig(); renderActiveView(); } },
    toggleStrictBank: (isChecked) => { DataManager.strictBankValidation = isChecked; DataManager.saveConfig('strict_bank_validation', isChecked); },
    saveCell: (p,c,k,el) => { (c===-1?DataManager.db[p]:DataManager.db[p].children[c])[k] = el.innerText; DataManager.save(); },
    openDateEditor: (p, c, field, e) => { e.stopPropagation(); currentEditing = {p, c, field}; document.getElementById('floatDateInput').value = Utils.formatDate((c===-1?DataManager.db[p]:DataManager.db[p].children[c])[field]); smartPosition('dateEditor', e.target.closest('td')); },
    saveDateEditor: () => { 
        const brDate = document.getElementById('floatDateInput').value; 
        const isoDate = Utils.parseDateBR(brDate); 
        const {p, c, field} = currentEditing;
        const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; 
        if (field === 'dt_prevista' && isoDate && item.dt_tramitacao && isoDate < item.dt_tramitacao) { alert("A Data Prevista não pode ser menor que a Data de Tramitação!"); return; }
        if (field === 'dt_prevista' && isoDate) {
            if (c !== -1) { const parent = DataManager.db[p]; if (parent.dt_prevista && isoDate > parent.dt_prevista) { alert("Data do filho não pode ser maior que a do pai!"); return; } }
            if (c === -1 && item.children) { const invalid = item.children.find(ch => ch.dt_prevista && ch.dt_prevista > isoDate); if (invalid) { alert("Existe um filho com data prevista maior!"); return; } }
        }
        item[field] = isoDate; 
        if (field === 'dt_conclusao' && isoDate) { item.status = 'Concluído'; item.percentual = 100; if (c === -1 && item.children) { item.children.forEach(child => { child.dt_conclusao = isoDate; child.status = 'Concluído'; child.percentual = 100; }); } if (c !== -1) window.actions.recalcParent(p); } 
        document.getElementById('dateEditor').style.display = 'none'; DataManager.save(); renderActiveView(); 
    },
    openStatusEditor: (p, c, e) => { e.stopPropagation(); currentEditing = {p, c}; document.getElementById('floatStatusInput').value = (c===-1?DataManager.db[p]:DataManager.db[p].children[c]).status || 'Previsto'; smartPosition('statusEditor', e.target.closest('td')); },
    saveStatusEditor: () => { const val = document.getElementById('floatStatusInput').value; const {p,c} = currentEditing; const item = c===-1 ? DataManager.db[p] : DataManager.db[p].children[c]; item.status = val; if (val === 'Concluído') item.percentual = 100; if (c !== -1) window.actions.recalcParent(p); document.getElementById('statusEditor').style.display='none'; DataManager.save(); renderActiveView(); },
    openTagEditor: (p,c,e) => { e.stopPropagation(); currentEditing = {p,c}; const item = c===-1?DataManager.db[p]:DataManager.db[p].children[c]; tempTags = item.tags ? item.tags.split(',').filter(x=>x) : []; const lst = document.getElementById('editorTagList'); lst.innerHTML = tempTags.map((t,i) => `<span class="tag-pill" style="background:${t.split('|')[1]}">${t.split('|')[0]} <span onclick="window.actions.removeTag(${i})">x</span></span>`).join(''); smartPosition('tagEditor', e.target.closest('td')); },
    addTagFromEditor: () => { const i = document.getElementById('newTagInput'); if(i.value) { tempTags.push(i.value.toUpperCase()+'|'+currentTagColor); i.value=''; window.actions.saveTagEditor(); } },
    removeTag: (i) => { tempTags.splice(i,1); window.actions.saveTagEditor(); }, 
    saveTagEditor: () => { const item = currentEditing.c===-1?DataManager.db[currentEditing.p]:DataManager.db[currentEditing.p].children[currentEditing.c]; item.tags = tempTags.join(','); document.getElementById('tagEditor').style.display='none'; DataManager.save(); renderActiveView(); },
    selectColor: (c, event) => { currentTagColor = c; const editor = document.getElementById('tagEditor'); if (editor) { editor.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected')); if(event && event.target.classList.contains('color-dot')) event.target.classList.add('selected'); } document.getElementById('newTagInput').focus(); }
};