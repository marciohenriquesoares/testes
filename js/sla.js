import { DataManager } from './data.js';
import { Utils } from './utils.js';

export const SLAManager = {
    /**
     * Calcula o status do SLA
     * @param {string} dtIn - Data de Tramitação (YYYY-MM-DD)
     * @param {string} resp - Nome do Responsável (Ex: Ninecon)
     * @param {string} dtOut - Data de Conclusão (YYYY-MM-DD)
     * @returns {Object|null} - Objeto com status e dias restantes
     */
    checkSLA(dtIn, resp, dtOut) {
        // 1. Se já tiver data de conclusão, não tem SLA pendente (ou está OK)
        if (dtOut && dtOut.trim() !== '') return null;

        // 2. Se não tiver data de início ou responsável, ignora
        if (!dtIn || !resp) return null;

        // 3. Busca configuração de dias (Se não achar, assume 2 dias padrão)
        // Tenta achar exato, senão tenta achar ignorando maiúsculas
        let daysAllowed = DataManager.slaConfig[resp];
        if (daysAllowed === undefined) {
            // Tenta busca case-insensitive
            const key = Object.keys(DataManager.slaConfig).find(k => k.toLowerCase() === resp.toLowerCase());
            daysAllowed = key ? DataManager.slaConfig[key] : 2; 
        }

        // 4. Calcula data limite
        // dtIn vem como '2023-01-01', o replace corrige bug de timezone no JS
        const start = new Date(dtIn + 'T00:00:00'); 
        const target = new Date(start);
        target.setDate(start.getDate() + parseInt(daysAllowed));

        // 5. Compara com Hoje
        const today = new Date();
        today.setHours(0,0,0,0); // Zera hora para comparar apenas datas

        // Diferença em milissegundos convertida para dias
        const diffTime = target - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 6. Define a cor do status
        let status = 'ok'; // Verde
        if (diffDays < 0) status = 'danger'; // Vermelho (Atrasado)
        else if (diffDays <= 1) status = 'warning'; // Amarelo (Vence hoje ou amanhã)

        return {
            status: status,
            diff: diffDays, // Dias restantes (negativo = dias de atraso)
            limitDate: Utils.formatDate(target.toISOString().split('T')[0]) // Data limite formatada BR
        };
    }
};