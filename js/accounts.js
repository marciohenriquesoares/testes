export const AccountsManager = {
    accounts: [],

    async load() {
        try {
            const res = await fetch('api.php?action=load_accounts');
            
            if (!res.ok) {
                console.warn("API retornou erro, iniciando com lista vazia.");
                this.accounts = [];
                return;
            }

            // Lê como texto primeiro para evitar o erro de JSON vazio
            const text = await res.text();
            
            if (!text) {
                this.accounts = [];
                return;
            }

            const json = JSON.parse(text);
            
            if (json.status === 'success') {
                this.accounts = json.data || [];
            } else {
                this.accounts = [];
            }
        } catch (e) {
            console.error("Erro ao carregar contas (usando fallback):", e);
            this.accounts = [];
        }
    },

    async save(account) {
        if (!account.oracle_name || !account.bank_name) {
            alert("Preencha os campos obrigatórios!");
            return false;
        }

        // Se não tem ID, gera um novo
        if (!account.id) {
            account.id = Date.now().toString();
            this.accounts.push(account);
        } else {
            // Edição
            const idx = this.accounts.findIndex(a => a.id === account.id);
            if (idx > -1) this.accounts[idx] = account;
        }

        await this.persist();
        this.renderAccountsList();
        return true;
    },

    delete(id) {
        if (confirm("Excluir esta conta?")) {
            this.accounts = this.accounts.filter(a => a.id !== id);
            this.persist();
            this.renderAccountsList();
        }
    },

    async persist() {
        try {
            await fetch('api.php?action=save_accounts', {
                method: 'POST',
                body: JSON.stringify(this.accounts)
            });
        } catch (e) {
            console.error("Erro ao salvar contas:", e);
        }
    },

    renderAccountsList() {
        const tbody = document.getElementById('accountsTableBody');
        if (!tbody) return;

        if (this.accounts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhuma conta cadastrada.</td></tr>';
            return;
        }

        tbody.innerHTML = this.accounts.map(acc => `
            <tr>
                <td>${acc.oracle_name}</td>
                <td>${acc.bank_name}</td>
                <td>${acc.bank_number}</td>
                <td>${acc.agency} / ${acc.account_number}</td>
                <td>${acc.company_name}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-link p-0 text-primary" onclick="window.actions.editAccount('${acc.id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-link p-0 text-danger ms-2" onclick="window.actions.deleteAccount('${acc.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    openModal(id = null) {
        const form = document.getElementById('formAccount');
        if (form) form.reset();
        const accIdField = document.getElementById('accId');
        if(accIdField) accIdField.value = '';

        if (id) {
            const acc = this.accounts.find(a => a.id === id);
            if (acc) {
                if(accIdField) accIdField.value = acc.id;
                document.getElementById('accOracle').value = acc.oracle_name;
                document.getElementById('accBank').value = acc.bank_name;
                document.getElementById('accBankNum').value = acc.bank_number;
                document.getElementById('accAgency').value = acc.agency;
                document.getElementById('accNum').value = acc.account_number;
                document.getElementById('accCompany').value = acc.company_name;
            }
        }
        
        // Garante que o modal de configuração abra na aba correta
        if (window.actions && window.actions.abrirConfigStatus) {
            window.actions.abrirConfigStatus();
            // Pequeno delay para o modal abrir antes de trocar a aba
            setTimeout(() => {
                const tabEl = document.querySelector('a[href="#conf-accounts"]');
                if(tabEl && typeof bootstrap !== 'undefined') {
                    new bootstrap.Tab(tabEl).show();
                }
            }, 200);
        }
    },

    // --- IMPORTAÇÃO CSV ---
    pendingImportData: [],

    preImportCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r\n|\n/);
            const newAccs = [];
            
            for(let i=1; i<lines.length; i++) {
                const cols = lines[i].split(';');
                if(cols.length < 5) continue;
                newAccs.push({
                    id: Date.now().toString() + Math.random().toString().substr(2,5),
                    oracle_name: cols[0] || '',
                    bank_name: cols[1] || '',
                    bank_number: cols[2] || '',
                    agency: cols[3] || '',
                    account_number: cols[4] || '',
                    company_name: cols[5] || ''
                });
            }

            if(newAccs.length > 0) {
                this.pendingImportData = newAccs;
                const modalEl = document.getElementById('modalAccountImportOptions');
                if(modalEl) new bootstrap.Modal(modalEl).show();
            } else {
                alert("Nenhum dado válido encontrado no CSV.");
            }
        };
        reader.readAsText(file, 'ISO-8859-1');
    },

    executeImport(mode) {
        if(mode === 'clear') {
            this.accounts = this.pendingImportData;
        } else {
            this.accounts = [...this.accounts, ...this.pendingImportData];
        }
        this.persist();
        this.renderAccountsList();
        
        const el = document.getElementById('modalAccountImportOptions');
        if(el) {
            const modal = bootstrap.Modal.getInstance(el);
            if(modal) modal.hide();
        }
        this.pendingImportData = [];
    }
};