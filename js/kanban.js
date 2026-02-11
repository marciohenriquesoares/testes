import { DataManager } from './data.js';
import { Utils } from './utils.js';

export const KanbanManager = {
    viewMode: 'pai', // 'pai' ou 'filho'
    filterParentId: 'all', // ID do pai para filtrar filhos

    render() {
        const container = document.getElementById('kanban-container');
        if (!container) return;
        container.innerHTML = '';

        // 1. Filtrar Itens (Pais ou Filhos)
        let items = [];
        if (this.viewMode === 'pai') {
            items = DataManager.db.map((item, index) => ({ ...item, _pIndex: index, _cIndex: -1, _isParent: true }));
        } else {
            // MODO FILHO: Coleta todos os filhos de todos os pais (ou de um específico)
            DataManager.db.forEach((parent, pIndex) => {
                if (this.filterParentId !== 'all' && parent.id !== this.filterParentId) return;
                
                if (parent.children) {
                    parent.children.forEach((child, cIndex) => {
                        // Importante: Passa o nome da empresa do pai para contexto, se o filho não tiver
                        const childItem = { 
                            ...child, 
                            _pIndex: pIndex, 
                            _cIndex: cIndex, 
                            _isParent: false, 
                            _parentName: parent.empresa, // Nome do pai para referência
                            _parentId: parent.id
                        };
                        items.push(childItem);
                    });
                }
            });
        }

        // 2. Renderizar Colunas
        DataManager.statusConfig.forEach((statusObj, colIndex) => {
            // Filtra itens desta coluna
            const colItems = items.filter(item => (item.status || 'Previsto') === statusObj.name);
            const count = colItems.length;
            const limit = parseInt(statusObj.limit) || 0; 
            const visibleCount = parseInt(statusObj.visibleCards) || 0; 

            const badgeClass = (limit > 0 && count > limit) ? 'bg-danger text-white' : 'bg-secondary bg-opacity-25 text-dark border';

            const col = document.createElement('div');
            col.className = 'kanban-column d-flex flex-column h-100';
            col.style.minWidth = '300px';
            col.style.maxWidth = '300px';
            col.style.backgroundColor = '#f8f9fa';
            col.style.borderRadius = '8px';
            col.style.marginRight = '15px';

            col.innerHTML = `
                <div class="kanban-header p-2 rounded-top border-bottom" style="background-color: ${statusObj.bg || '#e9ecef'}; color: ${statusObj.text || '#000'};">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fw-bold text-truncate" style="max-width: 120px;" title="${statusObj.name}">${statusObj.name}</span>
                            <div class="d-flex align-items-center" title="Limitar visualização (0 = todos)">
                                <i class="bi bi-arrow-down-up" style="font-size: 0.75rem; margin-right: 2px; opacity: 0.5;"></i>
                                <input type="number" class="form-control form-control-sm p-0 text-center" style="width: 40px; height: 22px; font-size: 0.8rem;" value="${visibleCount}" onchange="window.actions.updateVisibleCards(${colIndex}, this.value)">
                            </div>
                        </div>
                        <span class="badge rounded-pill ${badgeClass}">${count}${limit > 0 ? '/' + limit : ''}</span>
                    </div>
                </div>
                <div class="kanban-body p-2 flex-grow-1" style="overflow-y: auto; min-height: 50px;" ondrop="window.actions.kanbanDrop(event, '${statusObj.name}')" ondragover="window.actions.kanbanAllowDrop(event)"></div>
            `;

            const colBody = col.querySelector('.kanban-body');
            const itemsToShow = (visibleCount > 0) ? colItems.slice(0, visibleCount) : colItems;

            itemsToShow.forEach(item => {
                const card = this.createCard(item);
                colBody.appendChild(card);
            });

            if (visibleCount > 0 && colItems.length > visibleCount) {
                const more = document.createElement('div');
                more.className = 'text-center text-muted small mt-2';
                more.innerText = `+ ${colItems.length - visibleCount} ocultos...`;
                colBody.appendChild(more);
            }

            container.appendChild(col);
        });
    },

    createCard(item) {
        const card = document.createElement('div');
        // Define classes base do card
        card.className = 'kanban-card card mb-2 shadow-sm border-0 border-start border-4';
        
        // Define cor da borda pela prioridade
        if(item.prioridade === 'Alta') card.classList.add('border-danger');
        else if(item.prioridade === 'Baixa') card.classList.add('border-success');
        else card.classList.add('border-warning');

        card.draggable = true;
        card.style.cursor = 'grab';
        card.ondragstart = (e) => window.actions.kanbanDragStart(e, item._pIndex, item._cIndex);

        let content = `<div class="card-body p-2">`;
        
        // --- TÍTULO DO CARD ---
        // Se for Pai: Usa o nome da Empresa.
        // Se for Filho: Usa o Tópico (descrição da tarefa) ou "Sem Descrição".
        // Adiciona também o nome do Pai em pequeno para contexto se for filho.
        let titleText = '';
        let subtitleText = '';

        if (item._isParent) {
            titleText = item.empresa || 'Nova Demanda';
        } else {
            // Lógica para filho: Tópico > Obs > "Subtarefa"
            titleText = item.topico || item.obs || 'Subtarefa sem nome';
            // Mostra a qual empresa (Pai) pertence
            if (item._parentName) {
                subtitleText = `<div class="text-muted small mb-1" style="font-size:0.75rem;"><i class="bi bi-diagram-2"></i> ${item._parentName}</div>`;
            }
        }

        const idDisplay = `<span class="text-muted me-1 small">#${item.id}</span>`;
        
        content += `<div class="d-flex justify-content-between mb-1">
                        <div class="text-truncate fw-bold" style="font-size: 0.9rem;" title="${titleText}">${idDisplay}${titleText}</div>
                        ${item._isParent ? '<i class="bi bi-folder2-open text-primary" title="Pai"></i>' : ''}
                    </div>`;
        
        if(subtitleText) content += subtitleText;

        // --- CAMPOS DINÂMICOS (Configurados) ---
        // Exibe Responsável
        if (DataManager.kanbanCardFields.responsavel && item.responsavel) {
            content += `<div class="small text-truncate mb-1"><i class="bi bi-person"></i> ${item.responsavel}</div>`;
        }
        // Exibe Data Tramitação
        if (DataManager.kanbanCardFields.dt_tramitacao && item.dt_tramitacao) {
            content += `<div class="small text-muted mb-1"><i class="bi bi-calendar"></i> ${Utils.formatDate(item.dt_tramitacao)}</div>`;
        }
        
        // --- TAGS ---
        if (item.tags) {
            content += `<div class="mt-2 d-flex flex-wrap gap-1">`;
            item.tags.split(',').filter(t => t).forEach(tag => {
                const parts = tag.split('|');
                const text = parts[0];
                const color = parts[1] || '#6c757d';
                content += `<span class="badge rounded-pill" style="background-color: ${color}; font-size: 0.65rem; font-weight: normal;">${text}</span>`;
            });
            content += `</div>`;
        }

        content += `</div>`;
        card.innerHTML = content;
        return card;
    },

    kanbanDragStart(e, p, c) {
        e.dataTransfer.setData("text/plain", JSON.stringify({ p, c }));
        e.dataTransfer.effectAllowed = "move";
    },

    kanbanAllowDrop(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    },

    kanbanDrop(e, newStatus) {
        e.preventDefault();
        const data = e.dataTransfer.getData("text/plain");
        if (!data) return;
        
        try {
            const { p, c } = JSON.parse(data);
            const item = c === -1 ? DataManager.db[p] : DataManager.db[p].children[c];
            
            if (item.status !== newStatus) {
                item.status = newStatus;
                
                // Regras de negócio ao mover
                if (newStatus === 'Concluído') item.percentual = 100;
                
                // Se for filho, recalcula pai
                if (c !== -1 && window.actions && window.actions.recalcParent) {
                    window.actions.recalcParent(p);
                }

                DataManager.save();
                this.render(); 
            }
        } catch (err) { console.error(err); }
    },

    populateParentFilter() {
        const sel = document.getElementById('kanbanParentFilter');
        if (!sel) return;
        const val = sel.value;
        let html = '<option value="all">Todos os Pais</option>';
        DataManager.db.forEach(pai => {
            html += `<option value="${pai.id}">${pai.id} - ${pai.empresa || 'Sem Nome'}</option>`;
        });
        sel.innerHTML = html;
        if(val) sel.value = val;
    }
};