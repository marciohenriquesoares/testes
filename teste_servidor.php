<?php
// teste_servidor.php
ini_set('display_errors', 1);
error_reporting(E_ALL);

echo "<h1>Diagnóstico do Servidor</h1>";

// 1. Testa PHP
echo "<p>✅ PHP está rodando! Versão: " . phpversion() . "</p>";

// 2. Testa SQLite
if (class_exists('PDO') && in_array("sqlite", PDO::getAvailableDrivers())) {
    echo "<p>✅ Driver SQLite está ativado.</p>";
} else {
    echo "<p style='color:red'>❌ ERRO: Driver SQLite NÃO encontrado. Ative 'extension=pdo_sqlite' no php.ini.</p>";
}

// 3. Testa Permissão de Escrita
$dir = __DIR__ . '/database';
if (!is_dir($dir)) {
    echo "<p>⚠️ Pasta database não existe. Tentando criar...</p>";
    if (@mkdir($dir, 0777, true)) {
        echo "<p>✅ Pasta criada com sucesso.</p>";
    } else {
        echo "<p style='color:red'>❌ ERRO: Não foi possível criar a pasta. Verifique as permissões de escrita.</p>";
    }
} else {
    echo "<p>✅ Pasta database já existe.</p>";
    if (is_writable($dir)) {
        echo "<p>✅ Pasta tem permissão de escrita.</p>";
    } else {
        echo "<p style='color:red'>❌ ERRO: Pasta sem permissão de escrita.</p>";
    }
}

echo "<hr>";
echo "<p>Se você viu algum ❌ acima, o sistema NÃO vai funcionar. Corrija o servidor primeiro.</p>";
?>