import { Utils } from './utils.js';

export const DataManager = {
    // Banco de Dados Local
    db: [],
    
    strictBankValidation: true,
    ganttAutoDays: 5, // <--- NOVO PADRÃO (5 dias se não configurado)

    // LISTAS PADRÃO
    paymentModes: ['PIX', 'CONTA CORRENTE', 'ALELO'],
    receivableOccurrences: [
        'ABATIMENTO SOLICITADO', 'ALTERAÇÃO DE VENCIMENTO SOLICITADA', 'BAIXA SOLICITADA',
        'DESCONTO SOLICITADO', 'INSTRUÇÃO DE PROTESTO SOLICITADA', 'REGISTRO SOLICITADO', 'SUSTAÇÃO DE PROTESTO SOLICITADA'
    ],
    fileTypes: ['REMESSA', 'RETORNO'],
    paymentMethods: [
        'ELETRONICO', 'PAGAMENTO PIX', 'IMPOSTOS COM CÓDIGOS DE BARRAS',
        'PAGAMENTO PIX QR CODE', 'BOLETO', 'IMPOSTOS SEM CÓDIGOS DE BARRAS'
    ],

    // ORDEM DAS COLUNAS
    columnOrder: [
        'actions', 'id', 'empresa', 'banco', 'num_banco', 'agencia', 'conta', 
        'modalidade', 'ocorrencia', 'cod', 'tipo_arq', 'metodo', 
        'topico', 'prioridade', 'dt_prevista', 'dt_tramitacao', 'dt_conclusao', 
        'status', 'percentual', 'tags'
    ],

    colLabels: {
        actions: 'AÇÕES', id: 'SEQ', empresa: 'EMPRESA', banco: 'BANCO', num_banco: 'Nº BANCO',
        agencia: 'AGÊNCIA', conta: 'CONTA', modalidade: 'MODALIDADE', ocorrencia: 'OCORRÊNCIA',
        cod: 'Nº CHAMADO/TICKET', tipo_arq: 'TIPO ARQ', metodo: 'MÉTODO', topico: 'TÓPICO',
        prioridade: 'PRIORIDADE', dt_prevista: 'DATA PREV.', dt_tramitacao: 'DATA TRAM.', 
        dt_conclusao: 'DATA CONCL.', status: 'STATUS', percentual: '%', tags: 'TAGS', 
        responsavel: 'RESPONSÁVEL', anotacoes: 'ANOTAÇÕES', obs: 'OBSERVAÇÃO'
    },

    statusConfig: [{name:'Previsto',bg:'#f8f9fa'},{name:'Em Andamento',bg:'#cfe2ff'},{name:'Concluído',bg:'#d1e7dd'}],
    slaConfig: {}, 
    kanbanCardFields: { empresa:true, status:true },
    configTabOrder: null, 

    async load() {
        try {
            const response = await fetch('api.php?action=load_all');
            const json = await response.json();
            if (json.status === 'success') {
                this.db = json.db || [];
                
                if (json.configs) {
                    if (json.configs.status_config) this.statusConfig = json.configs.status_config;
                    if (json.configs.column_order) this.columnOrder = json.configs.column_order;
                    if (json.configs.sla_config) this.slaConfig = json.configs.sla_config;
                    if (json.configs.kanban_card_fields) this.kanbanCardFields = json.configs.kanban_card_fields;
                    if (json.configs.strict_bank_validation !== undefined) this.strictBankValidation = json.configs.strict_bank_validation;
                    if (json.configs.payment_modes) this.paymentModes = json.configs.payment_modes;
                    if (json.configs.receivable_occurrences) this.receivableOccurrences = json.configs.receivable_occurrences;
                    if (json.configs.file_types) this.fileTypes = json.configs.file_types;
                    if (json.configs.payment_methods) this.paymentMethods = json.configs.payment_methods;
                    if (json.configs.config_tab_order) this.configTabOrder = json.configs.config_tab_order;
                    // Carrega configuração do Gantt
                    if (json.configs.gantt_auto_days) this.ganttAutoDays = parseInt(json.configs.gantt_auto_days);
                }
            } else {
                console.error("Erro API:", json.message);
            }
        } catch (error) { console.error("Erro Fatal Load:", error); }
    },

    async save() { 
        try {
            const response = await fetch('api.php?action=save_data', { 
                method:'POST', 
                headers: { 'Content-Type': 'application/json' },
                body:JSON.stringify(this.db) 
            });
            const res = await response.json();
            if(res.status !== 'success') console.error('Erro ao salvar:', res.message);
        } catch(e) {
            console.error('Erro conexão save:', e);
        }
    },

    async saveConfig(key, value) { 
        await fetch('api.php?action=save_config', { 
            method:'POST', 
            body:JSON.stringify({key, value}) 
        }); 
    },

    // ... (Mantém parseCSVForImport e confirmImport iguais) ...
    parseCSVForImport(csvText) {
        const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) return 0;
        const newItems = [];
        let tempIdCounter = Date.now();

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';');
            tempIdCounter++;
            const item = {
                id: tempIdCounter.toString(),
                empresa: cols[1]||'', banco: cols[2]||'', num_banco: cols[3]||'', agencia: cols[4]||'', conta: cols[5]||'',
                modalidade: cols[6]||'', ocorrencia: cols[7]||'', 
                cod: cols[8]||'', tipo_arq: cols[9]||'REMESSA', 
                metodo: cols[10]||'ELETRONICO', 
                topico: cols[11]||'',
                prioridade: 'Média', 
                dt_tramitacao: new Date().toISOString().split('T')[0], 
                status: 'Previsto',
                dt_prevista: '',
                children: [], 
                expanded: false, 
                styles: {}
            };
            newItems.push(item);
        }
        if (newItems.length > 0) { this.tempImportData = newItems; return newItems.length; }
        return 0;
    },

    confirmImport(mode) {
        if (!this.tempImportData) return;
        const flow = document.getElementById('globalFlowSelector')?.value || 'Contas a Pagar';
        this.tempImportData.forEach(i => i.tipo_fluxo = flow);
        
        if (mode === 'overwrite') this.db = this.tempImportData;
        else this.db = [...this.db, ...this.tempImportData];
        
        this.tempImportData = null; 
        this.save().then(() => {
            this.load().then(() => {
                if(window.actions && window.actions.render) window.actions.render();
                else window.location.reload();
            });
        }); 
    }
};