import { DataManager } from './data.js';
import { Utils } from './utils.js';

export const GanttManager = {
    gantt: null,
    currentViewMode: 'Week', 

    render() {
        const flowSelector = document.getElementById('globalFlowSelector');
        const currentFlow = flowSelector ? flowSelector.value : 'Contas a Pagar';
        
        const container = document.querySelector('.gantt-container');
        if(!container) return;

        const savedScroll = container.scrollLeft;
        const daysToPredict = DataManager.ganttAutoDays || 5;

        const tasks = [];
        const visibleRows = DataManager.db.filter(item => (item.tipo_fluxo || 'Contas a Pagar') === currentFlow);

        // RESET SVG
        container.innerHTML = '<svg id="gantt" width="100%" style="display:block; min-height:100%;"></svg>';
        const svgElement = document.getElementById('gantt');

        if (visibleRows.length === 0) {
            container.innerHTML = '<div class="p-4 text-muted">Nenhum registro encontrado para exibir no Gantt.</div>';
            return;
        }

        visibleRows.forEach(pai => {
            const paiStart = this.resolveDate(pai.dt_tramitacao) || this.getToday();
            const paiEnd = this.resolveDate(pai.dt_prevista) || this.resolveDate(pai.dt_conclusao) || this.addDays(paiStart, daysToPredict);
            const paiStatus = this.getStatusIcon(paiEnd, pai.status, pai.percentual);
            
            if (!pai.styles) pai.styles = {};
            const defaultParentColor = '#6c757d'; 

            tasks.push({
                id: "P" + pai.id, 
                name: `${paiStatus.icon} ${pai.empresa.substring(0, 15)}... ✏️`, 
                start: paiStart, 
                end: paiEnd, 
                progress: pai.percentual || 0, 
                dependencies: "", 
                custom_class: 'gantt-parent', 
                _data: pai,
                _color: pai.styles.gantt_color || defaultParentColor 
            });

            if (pai.children && pai.children.length > 0) {
                pai.children.forEach(filho => {
                    const fStart = this.resolveDate(filho.dt_tramitacao) || paiStart;
                    let fEnd = this.resolveDate(filho.dt_prevista) || this.resolveDate(filho.dt_conclusao);
                    if (!fEnd) fEnd = this.addDays(fStart, daysToPredict);
                    if (fEnd < fStart) fEnd = this.addDays(fStart, 1);

                    const fStatus = this.getStatusIcon(fEnd, filho.status, filho.percentual);
                    if (!filho.styles) filho.styles = {};
                    const defaultChildColor = '#0d6efd';

                    tasks.push({
                        id: "C" + filho.id, 
                        name: `${fStatus.icon} ↳ ${filho.topico || 'Sub'} ✏️`,
                        start: fStart, 
                        end: fEnd, 
                        progress: filho.percentual || 0, 
                        dependencies: "", 
                        custom_class: 'gantt-child',
                        _data: filho,
                        _color: filho.styles.gantt_color || defaultChildColor,
                        _parentId: "P" + pai.id 
                    });
                });
            }
        });

        this.gantt = new Gantt("#gantt", tasks, {
            header_height: 50, column_width: 30, step: 24, view_modes: ['Day', 'Week', 'Month'],
            bar_height: 25, bar_corner_radius: 3, arrow_curve: 5, padding: 18, 
            view_mode: this.currentViewMode,
            date_format: 'YYYY-MM-DD', language: 'ptBr', 
            
            on_click: (task) => {
                if(window.actions && window.actions.openGanttEditor) {
                    window.actions.openGanttEditor(task);
                }
            },

            on_date_change: (task, start, end) => {
                const formatDateISO = (d) => {
                    return d.getFullYear() + '-' + 
                           String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(d.getDate()).padStart(2, '0');
                };
                const newStart = formatDateISO(start);
                const newEnd = formatDateISO(end);
                
                const cleanId = task.id.substring(1); 
                const isParent = task.id.startsWith('P');
                let itemFound = null;

                if (isParent) {
                    itemFound = DataManager.db.find(i => i.id == cleanId);
                } else {
                    for (const parent of DataManager.db) {
                        if (parent.children) {
                            const child = parent.children.find(c => c.id == cleanId);
                            if (child) { itemFound = child; break; }
                        }
                    }
                }

                if (itemFound) {
                    itemFound.dt_tramitacao = newStart;
                    itemFound.dt_prevista = newEnd;
                    DataManager.save().then(() => {
                        setTimeout(() => this.render(), 50); 
                    });
                }
            },

            custom_popup_html: (task) => {
                const item = task._data;
                const endLabel = item.dt_conclusao ? `Concluído: ${Utils.formatDate(item.dt_conclusao)}` : `Previsto: ${Utils.formatDate(item.dt_prevista)}`;
                const cleanName = task.name.replace('✏️', '');
                return `<div class="p-2" style="width:200px; font-family:sans-serif; z-index:10000;">
                    <div class="fw-bold">${cleanName}</div>
                    <div class="small">${item.empresa||''}</div>
                    <hr class="my-1">
                    <div class="small">Resp: ${item.responsavel||'-'}</div>
                    <div class="small">${endLabel}</div>
                    <div class="text-end small text-primary fw-bold">${task.progress}%</div>
                </div>`;
            }
        });

        // =================================================================
        // PÓS-RENDERIZAÇÃO: DESENHAR LINHAS ORTOGONAIS (RETAS)
        // =================================================================
        setTimeout(() => {
            
            // 1. Linhas de Conexão
            tasks.forEach(task => {
                if (task.id.startsWith('C') && task._parentId) {
                    const parentGroup = svgElement.querySelector(`[data-id="${task._parentId}"]`);
                    const childGroup = svgElement.querySelector(`[data-id="${task.id}"]`);
                    
                    if (parentGroup && childGroup) {
                        const pBar = parentGroup.querySelector('.bar');
                        const cBar = childGroup.querySelector('.bar');
                        
                        if (pBar && cBar) {
                            // Coordenadas
                            const pX = parseFloat(pBar.getAttribute('x'));
                            const pY = parseFloat(pBar.getAttribute('y'));
                            const pW = parseFloat(pBar.getAttribute('width'));
                            const pH = parseFloat(pBar.getAttribute('height'));
                            
                            const cX = parseFloat(cBar.getAttribute('x'));
                            const cY = parseFloat(cBar.getAttribute('y'));
                            const cH = parseFloat(cBar.getAttribute('height'));

                            if(!isNaN(pX) && !isNaN(cX)) {
                                // Pontos Principais
                                const startX = pX + pW; // Fim do Pai
                                const startY = pY + (pH / 2); // Meio do Pai
                                const endX = cX; // Início do Filho
                                const endY = cY + (cH / 2); // Meio do Filho
                                
                                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                
                                // LÓGICA DE TRAÇADO ORTOGONAL (Manhattan)
                                // Cria linhas retas: Sai do pai -> Avança -> Desce -> Vai para o filho
                                let d = '';
                                const bufferX = 20; // Espaço para avançar antes de descer

                                if (endX > startX + bufferX) {
                                    // CASO 1: Filho começa bem depois do Pai (Normal)
                                    // Caminho: Direita -> Baixo -> Direita
                                    d = `M ${startX} ${startY} 
                                         L ${startX + bufferX} ${startY} 
                                         L ${startX + bufferX} ${endY} 
                                         L ${endX} ${endY}`;
                                } else {
                                    // CASO 2: Sobreposição (Filho começa antes ou logo após o pai)
                                    // Caminho: Direita -> Baixo (metade) -> Esquerda -> Baixo -> Direita
                                    // Cria um formato de "S" quadrado para contornar
                                    const midY = startY + (endY - startY) / 2;
                                    const backX = endX - 10; // Recua um pouco antes do filho

                                    d = `M ${startX} ${startY} 
                                         L ${startX + 10} ${startY} 
                                         L ${startX + 10} ${midY} 
                                         L ${backX} ${midY} 
                                         L ${backX} ${endY} 
                                         L ${endX} ${endY}`;
                                }
                                
                                path.setAttribute('d', d);
                                path.setAttribute('fill', 'none');
                                path.setAttribute('stroke', '#a3a3ff'); // Azul
                                path.setAttribute('stroke-width', '2');
                                path.setAttribute('class', 'gantt-connector');
                                path.setAttribute('style', 'pointer-events: none; opacity: 0.8;');
                                
                                svgElement.appendChild(path); 
                            }
                        }
                    }
                }
            });

            // 2. Cores
            tasks.forEach(t => {
                const barGroup = svgElement.querySelector(`[data-id="${t.id}"]`);
                if (barGroup) {
                    const barPath = barGroup.querySelector('.bar');
                    if (barPath && t._color) barPath.style.fill = t._color;
                    const barProgress = barGroup.querySelector('.bar-progress');
                    if (barProgress) {
                        barProgress.style.fill = '#ffffff';
                        barProgress.style.opacity = '0.3';
                    }
                }
            });

            // 3. Scroll
            if(container && savedScroll > 0) {
                container.scrollLeft = savedScroll;
            }

        }, 300); 
    },

    changeView(mode) { this.currentViewMode = mode; if (this.gantt) this.gantt.change_view_mode(mode); else this.render(); },
    resolveDate(dateStr) { return dateStr || null; },
    getToday() { return new Date().toISOString().split('T')[0]; },
    addDays(dateStr, days) { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; },
    
    getStatusIcon(endDateStr, status, percent) {
        if (status === 'Concluído' || status === 'Finalizado' || percent === 100) return { icon: '✅', code: 'ok' };
        if (!endDateStr) return { icon: '', code: 'normal' };

        const parts = endDateStr.split('-'); 
        const end = new Date(parts[0], parts[1] - 1, parts[2]); 
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const diffTime = end.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        if (diffDays < 0) return { icon: '❗', code: 'late' }; 
        if (diffDays <= 3) return { icon: '⚠️', code: 'warn' }; 
        
        return { icon: '', code: 'normal' };
    }
};