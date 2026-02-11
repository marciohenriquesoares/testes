export const AuthManager = {
    user: null,

    async checkSession() {
        // Simulação: sempre retorna true em dev, ou implemente chamada real
        // Para o exemplo funcionar sem backend real, simulamos o admin
        this.user = { username: 'admin', permissions: { admin: true } };
        return true; 
        
        /* Implementação Real:
        try {
            const res = await fetch('api.php?action=check_session');
            const json = await res.json();
            if (json.status === 'success') {
                this.user = json.user;
                return true;
            }
            window.location.href = 'login.html';
            return false;
        } catch { return false; }
        */
    },

    can(permission) {
        if (!this.user) return false;
        if (this.user.permissions && this.user.permissions.admin) return true;
        return this.user.permissions && this.user.permissions[permission];
    },

    logout() {
        fetch('api.php?action=logout').then(() => window.location.href = 'login.html');
    },
    
    applyUIProtection() {
        // Esconde elementos baseado nas permissões se necessário
    }
};