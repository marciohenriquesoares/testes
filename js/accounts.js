import { DataManager } from './data.js';

export const AccountsManager = {
    accounts: [],
    pendingImportData: [],

    async load() {
        try {
            const res = await fetch('api.php?action=list_accounts');
            const json = await res.json();
            if (json.status === 'success') {
                this.accounts = json.data;
                this.renderAccountsList();
            }
        } catch (e) {
            console.error('Erro ao carregar contas:', e);
        }
    },

    async save(accountData) {
        try {
            const res = await fetch('api.php?action=save_account', {
                method: 'POST',
                body: JSON.stringify(accountData)
            });
            const json = await res.json();
            if (json.status === 'success') {
                await this.load();
                return true;
            } else {
                alert('Erro ao salvar conta: ' + json.message);
                return false;
            }
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async delete(id) {
        if (!confirm('Tem certeza que deseja excluir esta conta?')) return;
        try {
            await fetch('api.php?action=delete_account', {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            await this.load();
        } catch (e) {
            console.error(e);
        }
    },

    // --- IMPORTAÇÃO CORRIGIDA ---
    preImportCSV(file) {
        const reader = new FileReader();
        // Detecta encoding (tenta ler como ISO-8859-1 para acentos pt-BR, ou UTF-8)
        const encoding = document.getElementById('encodingSelector')?.value || 'ISO-8859-1';
        
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r\n|\n/);
            const newAccounts = [];

            // Começa do índice 1 para pular o cabeçalho
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Divide por PONTO E VÍRGULA (;)
                const cols = line.split(';');

                // Mapeamento baseado no seu CSV:
                // 0: Nome da Conta (Oracle)
                // 1: Número da Conta
                // 2: Banco
                // 3: Número do Banco
                // 4: Agência Bancária
                // 5: Nome da Pessoa Jurídica (Empresa)
                
                if (cols.length >= 6) {
                    newAccounts.push({
                        oracle_name: cols[0].trim(),
                        account_number: cols[1].trim(),
                        bank_name: cols[2].trim(),
                        bank_number: cols[3].trim(),
                        agency: cols[4].trim(),
                        company_name: cols[5].trim()
                    });
                }
            }

            if (newAccounts.length > 0) {
                this.pendingImportData = newAccounts;
                // Abre o modal de opções de importação
                const modalEl = document.getElementById('modalAccountImportOptions');
                if (modalEl) new bootstrap.Modal(modalEl).show();
            } else {
                alert('Nenhum dado válido encontrado no CSV. Verifique se o separador é ";" (ponto e vírgula).');
            }
        };
        reader.readAsText(file, encoding);
    },

    async executeImport(mode) {
        if (!this.pendingImportData || this.pendingImportData.length === 0) return;

        try {
            // Se o modo for 'clear', limpa tudo antes
            if (mode === 'clear') {
                await fetch('api.php?action=clear_accounts', { method: 'POST' });
            }

            // Envia os dados para o PHP salvar em lote
            const res = await fetch('api.php?action=import_accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.pendingImportData)
            });

            const json = await res.json();
            if (json.status === 'success') {
                alert('Importação concluída com sucesso!');
                this.pendingImportData = [];
                const modalEl = document.getElementById('modalAccountImportOptions');
                if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
                await this.load();
            } else {
                alert('Erro na importação: ' + json.message);
            }
        } catch (e) {
            console.error('Erro fatal importação:', e);
            alert('Erro de conexão ao importar.');
        }
    },

    openModal(id) {
        const acc = this.accounts.find(a => a.id == id);
        if (acc) {
            document.getElementById('accId').value = acc.id;
            document.getElementById('accOracle').value = acc.oracle_name;
            document.getElementById('accBank').value = acc.bank_name;
            document.getElementById('accBankNum').value = acc.bank_number;
            document.getElementById('accAgency').value = acc.agency;
            document.getElementById('accNum').value = acc.account_number;
            document.getElementById('accCompany').value = acc.company_name;
        }
    },

    renderAccountsList() {
        const tbody = document.getElementById('accountsTableBody');
        if (!tbody) return;
        tbody.innerHTML = this.accounts.map(acc => `
            <tr>
                <td class="small">${acc.oracle_name}</td>
                <td class="small">${acc.bank_name}</td>
                <td class="small">${acc.bank_number}</td>
                <td class="small text-nowrap">${acc.agency} / ${acc.account_number}</td>
                <td class="small">${acc.company_name}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-link p-0 me-2" onclick="window.actions.editAccount(${acc.id})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-link p-0 text-danger" onclick="window.actions.deleteAccount(${acc.id})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }
};