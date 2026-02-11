import { DataManager } from './data.js';
import { Utils } from './utils.js';

export const UIManager = {
    // Definição das colunas EXCLUSIVAS para os filhos
    childColumnOrder: [
        'actions', 
        'cod', 
        'responsavel', 
        'obs', 
        'prioridade', 
        'dt_prevista',   // <--- NOVA COLUNA
        'dt_tramitacao', 
        'dt_conclusao', 
        'status', 
        'percentual', 
        'tags'
    ],

    render() {
        const thead = document.getElementById('grid-header');
        const tbody = document.getElementById('tabela-corpo');
        const flowSelector = document.getElementById('globalFlowSelector');
        
        if (!thead || !tbody || !flowSelector) return;

        const currentFlow = flowSelector.value; 

        // Filtro de colunas
        const visibleColumns = DataManager.columnOrder.filter(key => {
            if (currentFlow === 'Contas a Pagar' && key === 'ocorrencia') return false;
            if (currentFlow === 'Contas a Receber' && key === 'modalidade') return false;
            return true;
        });

        // Cabeçalho
        let headerHTML = '<tr>';
        visibleColumns.forEach(key => {
            const label = DataManager.colLabels[key] || key;
            headerHTML += `
                <th>
                    <div class="d-flex justify-content-between align-items-center">
                        <span>${label}</span>
                        <i class="bi bi-arrow-down-up" style="cursor:pointer; font-size:0.8rem; opacity:0.5;" onclick="window.actions.ordenar('${key}')"></i>
                    </div>
                </th>`;
        });
        headerHTML += '</tr>';
        thead.innerHTML = headerHTML;

        // Corpo
        let rowsHTML = '';
        
        const visibleRows = DataManager.db.filter(item => {
            const itemFlow = item.tipo_fluxo || 'Contas a Pagar';
            return itemFlow === currentFlow;
        });

        if (visibleRows.length === 0) {
            rowsHTML = `<tr><td colspan="${visibleColumns.length}" class="text-center text-muted py-4">Nenhum registro encontrado em <strong>${currentFlow}</strong>.</td></tr>`;
        } else {
            visibleRows.forEach((parent) => {
                const originalIndex = DataManager.db.indexOf(parent);
                rowsHTML += this.createRowHTML(parent, originalIndex, -1, visibleColumns);
                
                if (parent.expanded && parent.children && parent.children.length > 0) {
                    rowsHTML += `
                        <tr class="child-row-container">
                            <td colspan="${visibleColumns.length}" style="padding: 0 0 0 25px; background-color: #f8f9fa;">
                                <div class="p-2 border-start border-4 border-info bg-white rounded shadow-sm mb-2 mt-1">
                                    <h6 class="small fw-bold text-muted mb-2 ps-1"><i class="bi bi-arrow-return-right"></i> Sub-tarefas</h6>
                                    <table class="table mb-0 table-sm sub-table table-hover">
                                        <thead class="table-light">
                                            <tr>`;
                    this.childColumnOrder.forEach(key => {
                        const label = DataManager.colLabels[key] || key;
                        rowsHTML += `<th class="small text-secondary" style="font-size:0.75rem;">${label}</th>`;
                    });
                    rowsHTML += `       </tr>
                                        </thead>
                                        <tbody>`;
                    parent.children.forEach((child, cIndex) => {
                        rowsHTML += this.createRowHTML(child, originalIndex, cIndex, this.childColumnOrder);
                    });
                    rowsHTML += `       </tbody>
                                    </table>
                                </div>
                            </td>
                        </tr>`;
                }
            });
        }
        
        tbody.innerHTML = rowsHTML;
    },

    createRowHTML(item, pIndex, cIndex, columns) {
        const rowColor = (item.styles && item.styles.row) ? item.styles.row : null;
        let trStyle = rowColor ? `background-color: ${rowColor};` : '';
        let html = `<tr style="${trStyle}" oncontextmenu="window.actions.openStyleEditor(event, ${pIndex}, ${cIndex}, '')">`;
        
        columns.forEach(key => {
            let val = item[key];
            if (val === undefined || val === null) val = '';
            
            // SLA (apenas para dt_tramitacao)
            let slaBadge = ''; let cellTextStyle = '';
            if (key === 'dt_tramitacao' && val && item.responsavel && DataManager.slaConfig[item.responsavel]) {
                const slaDays = parseInt(DataManager.slaConfig[item.responsavel]);
                if (item.status === 'Concluído' || item.status === 'Finalizado') {
                    slaBadge = `<i class="bi bi-check2-all text-success ms-1" title="Finalizado"></i>`;
                } else {
                    const parts = val.split('-'); const startDate = new Date(parts[0], parts[1]-1, parts[2]);
                    const today = new Date(); today.setHours(0,0,0,0);
                    const dueDate = new Date(startDate); dueDate.setDate(dueDate.getDate() + slaDays);
                    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)); 
                    if (diffDays < 0) { slaBadge = `<span class="badge bg-danger ms-1">${diffDays}d</span>`; cellTextStyle = 'color: #dc3545; font-weight: bold;'; } 
                    else if (diffDays <= 2) { slaBadge = `<span class="badge bg-warning text-dark ms-1">${diffDays}d</span>`; cellTextStyle = 'color: #fd7e14; font-weight: bold;'; } 
                    else { slaBadge = `<span class="badge bg-success ms-1 opacity-75">${diffDays}d</span>`; cellTextStyle = 'color: #198754;'; }
                }
            }

            if (key.includes('dt_')) val = Utils.formatDate(val);
            
            let bgStyle = '';
            if (item.styles && item.styles[key] && item.styles[key].bg) { bgStyle = `background-color: ${item.styles[key].bg} !important;`; } else if (rowColor) { bgStyle = `background-color: ${rowColor} !important;`; } else if (cIndex !== -1) { bgStyle = `background-color: #ffffff;`; }
            let textStyle = '';
            if (item.styles && item.styles[key] && item.styles[key].text) { textStyle = `color: ${item.styles[key].text};`; } else { textStyle = cellTextStyle; }
            const finalStyle = `${bgStyle} ${textStyle}`;
            let clickAction = '';

            if (key === 'actions') {
                clickAction = `class="text-center text-nowrap" style="width: 120px; ${bgStyle}"`; 
                const btnColor = `<button class="btn btn-sm btn-link p-0 me-1 text-secondary" title="Cor da Linha" onclick="window.actions.openRowColorEditor(${pIndex}, ${cIndex}, event)"><i class="bi bi-palette"></i></button>`;
                if (cIndex === -1) {
                    val = `${btnColor}<button class="btn btn-sm btn-link p-0 me-1 text-dark" onclick="window.actions.toggle(${pIndex})"><i class="bi bi-${item.expanded ? 'dash-square' : 'plus-square'}"></i></button><button class="btn btn-sm btn-link p-0 me-1 text-success btn-new-grid" onclick="window.actions.addChild(${pIndex})"><i class="bi bi-node-plus"></i></button><button class="btn btn-sm btn-link p-0 text-primary btn-save-grid" onclick="window.actions.openEdit(${pIndex}, -1)"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-link p-0 text-danger ms-1" onclick="window.actions.del(${pIndex}, -1)"><i class="bi bi-trash"></i></button>`;
                } else {
                    val = `${btnColor}<button class="btn btn-sm btn-link p-0 text-primary btn-save-grid" onclick="window.actions.openEdit(${pIndex}, ${cIndex})"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-link p-0 text-danger ms-1" onclick="window.actions.del(${pIndex}, ${cIndex})"><i class="bi bi-trash"></i></button>`;
                }
            }
            else if (key === 'percentual') {
                const pVal = parseInt(val) || 0; 
                clickAction = `onclick="window.actions.openPercentEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`;
                val = `<div class="d-flex align-items-center" style="width: 100%;"><span class="me-2 small fw-bold" style="width: 35px; text-align: right;">${pVal}%</span><div class="progress flex-grow-1" style="height: 6px; background-color: rgba(0,0,0,0.1);"><div class="progress-bar" role="progressbar" style="width: ${pVal}%; background-color: #0d6efd;" aria-valuenow="${pVal}" aria-valuemin="0" aria-valuemax="100"></div></div></div>`;
            }
            else if (key === 'tipo_fluxo') { clickAction = `onclick="window.actions.openFlowEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; font-weight:bold; color:${val==='Contas a Pagar'?'#dc3545':'#198754'}; ${finalStyle}"`; }
            else if (key === 'tipo_arq') { clickAction = `onclick="window.actions.openFileTypeEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`; }
            else if (key === 'metodo') { clickAction = `onclick="window.actions.openMethodEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`; }
            else if (key === 'modalidade') { clickAction = `onclick="window.actions.openModalidadeEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`; if(!val) val = '<span class="text-muted small fst-italic">Selecione...</span>'; }
            else if (key === 'ocorrencia') { clickAction = `onclick="window.actions.openOcorrenciaEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`; if(!val) val = '<span class="text-muted small fst-italic">Selecione...</span>'; }
            else if (['empresa', 'banco', 'num_banco', 'agencia', 'conta'].includes(key)) { clickAction = `onclick="window.actions.openBankGridEditor(${pIndex}, ${cIndex}, '${key}', event)" style="cursor:pointer; ${finalStyle}"`; }
            else if (key.includes('dt_')) { clickAction = `onclick="window.actions.openDateEditor(${pIndex}, ${cIndex}, '${key}', event)" style="cursor:pointer; ${finalStyle}"`; val = `<div class="d-flex align-items-center justify-content-between"><span>${val}</span>${slaBadge}</div>`; }
            else if (key === 'status') { clickAction = `onclick="window.actions.openStatusEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`; let b = 'bg-secondary'; if(val==='Concluído')b='bg-success'; if(val==='Em Andamento')b='bg-primary'; if(val==='Pendente')b='bg-warning text-dark'; val = `<span class="badge ${b}" style="font-weight:normal;">${val}</span>`; }
            else if (key === 'prioridade') { clickAction = `onclick="window.actions.openPriorityEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`; let b = 'bg-secondary'; if(val==='Alta')b='bg-danger'; if(val==='Média')b='bg-warning text-dark'; if(val==='Baixa')b='bg-success'; val = `<span class="badge ${b}" style="font-weight:normal;">${val}</span>`; }
            else if (key === 'tags') { clickAction = `onclick="window.actions.openTagEditor(${pIndex}, ${cIndex}, event)" style="cursor:pointer; ${finalStyle}"`; if (val) val = val.split(',').filter(x=>x).map(t => `<span class="badge rounded-pill me-1" style="background:${t.split('|')[1]||'#6c757d'}; font-weight:normal;">${t.split('|')[0]}</span>`).join(''); }
            else { clickAction = `contenteditable="true" onblur="window.actions.saveCell(${pIndex}, ${cIndex}, '${key}', this)" style="${finalStyle}"`; }

            html += `<td ${clickAction} oncontextmenu="window.actions.openStyleEditor(event, ${pIndex}, ${cIndex}, '${key}'); event.stopPropagation(); return false;">${val}</td>`;
        });
        html += '</tr>';
        return html;
    }
};