export const Utils = {
    // Converte YYYY-MM-DD para DD/MM/AAAA
    formatDate: (isoDate) => {
        if (!isoDate) return '';
        const [y, m, d] = isoDate.split('-');
        return `${d}/${m}/${y}`;
    },

    // Converte DD/MM/AAAA para YYYY-MM-DD
    parseDateBR: (brDate) => {
        if (!brDate) return '';
        // Aceita DD/MM/AAAA ou DD/MM/YY
        const parts = brDate.split('/');
        if (parts.length !== 3) return '';
        
        let d = parts[0];
        let m = parts[1];
        let y = parts[2];
        
        // Se o ano tiver 2 dígitos (ex: 26), assume 2026
        if (y.length === 2) y = '20' + y;
        
        return `${y}-${m}-${d}`;
    },

    // Gera um ID único simples
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
};