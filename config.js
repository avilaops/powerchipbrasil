// Configuração da API
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://api.avila.inc';

// Exportar configuração
window.CONFIG = {
    API_URL: API_URL
};
